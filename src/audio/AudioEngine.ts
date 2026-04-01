/**
 * AudioEngine — núcleo de reprodução profissional do Palco Solo
 *
 * Arquitetura v2 — SoundTouch WSOLA:
 *  - Tone.js para Transport sync + Player loading
 *  - SoundTouch (WSOLA algorithm) para pitch/speed processing
 *  - Qualidade profissional: sem artefatos, sem distorção
 *
 * Audio chain:
 *  Tone.Player → Tone.Gain (stem) → Tone.Panner → MixBus
 *  MixBus → SoundTouch ScriptProcessor → MasterGain → Destination
 *
 * Pitch: SoundTouch pitchSemitones (independent of speed)
 * Speed: Player.playbackRate + SoundTouch pitch compensation (WSOLA quality)
 */

import * as Tone from 'tone'
import { SoundTouch } from 'soundtouchjs'
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'

export interface LoadedStem {
  id: string
  player: Tone.Player
  gain: Tone.Gain
  panner: Tone.Panner
}

export type AudioEngineEvent =
  | { type: 'timeupdate'; currentTime: number; duration: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  | { type: 'loaded' }
  | { type: 'loading' }

type EventCallback = (event: AudioEngineEvent) => void

// SoundTouch processing constants — optimized for music quality + low latency
const BUFFER_SIZE = 2048              // smaller buffer = lower latency (~46ms at 44.1k)
const SOUNDTOUCH_SEQUENCE_MS = 40     // shorter segments = less smearing on transients
const SOUNDTOUCH_SEEKWINDOW_MS = 15   // tighter seek = more precise overlap matching
const SOUNDTOUCH_OVERLAP_MS = 8       // less overlap = cleaner transitions

class AudioEngine {
  private stems: Map<string, LoadedStem> = new Map()
  private mixBus: Tone.Gain | null = null
  private masterGain: Tone.Gain | null = null

  // SoundTouch processing
  private soundTouch: SoundTouch | null = null
  private scriptNode: ScriptProcessorNode | null = null
  private stBypass: GainNode | null = null // bypass node when no processing needed

  private _pitch = 0       // semitones (-12..+12)
  private _speed = 1       // ratio (0.5..2.0)
  private _volume = 0.85
  private _duration = 0
  private listeners: Set<EventCallback> = new Set()
  private rafId: number | null = null
  private _cancelRaf: (() => void) | null = null
  private isLoaded = false
  private _loadId = 0      // guard against concurrent loads

  constructor() {}

  // ─── Event system ──────────────────────────────────────────────────────────

  on(cb: EventCallback) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: AudioEngineEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  // ─── SoundTouch setup ─────────────────────────────────────────────────────

  private initSoundTouch(): void {
    const ctx = Tone.getContext().rawContext as AudioContext

    // Create SoundTouch processor
    this.soundTouch = new SoundTouch()

    // Configure WSOLA parameters for music quality
    // @ts-ignore — soundtouchjs internal settings
    if (this.soundTouch._stretch) {
      // @ts-ignore
      this.soundTouch._stretch.sequenceMs = SOUNDTOUCH_SEQUENCE_MS
      // @ts-ignore
      this.soundTouch._stretch.seekWindowMs = SOUNDTOUCH_SEEKWINDOW_MS
      // @ts-ignore
      this.soundTouch._stretch.overlapMs = SOUNDTOUCH_OVERLAP_MS
    }

    // Create ScriptProcessorNode for real-time audio processing
    this.scriptNode = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2)

    // Audio processing callback
    this.scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.soundTouch) return

      const inputL = event.inputBuffer.getChannelData(0)
      const inputR = event.inputBuffer.getChannelData(1)
      const outputL = event.outputBuffer.getChannelData(0)
      const outputR = event.outputBuffer.getChannelData(1)
      const numFrames = inputL.length

      // Interleave input: [L0, R0, L1, R1, ...]
      const interleaved = new Float32Array(numFrames * 2)
      for (let i = 0; i < numFrames; i++) {
        interleaved[i * 2] = inputL[i]
        interleaved[i * 2 + 1] = inputR[i]
      }

      // Push samples into SoundTouch
      this.soundTouch.inputBuffer.putSamples(interleaved, numFrames)

      // Process
      this.soundTouch.process()

      // Pull processed samples
      const outputInterleaved = new Float32Array(numFrames * 2)
      const received = this.soundTouch.outputBuffer.receiveSamples(outputInterleaved, numFrames)

      // De-interleave to output channels
      for (let i = 0; i < numFrames; i++) {
        if (i < received) {
          outputL[i] = outputInterleaved[i * 2]
          outputR[i] = outputInterleaved[i * 2 + 1]
        } else {
          // Fill remaining with silence (SoundTouch may produce fewer frames)
          outputL[i] = 0
          outputR[i] = 0
        }
      }
    }
  }

  private updateSoundTouchParams(): void {
    if (!this.soundTouch) return

    // SoundTouch pitch compensation:
    // Player.playbackRate changes speed AND pitch.
    // We use SoundTouch to restore the correct pitch.
    //
    // playbackRate of S changes pitch by log2(S)*12 semitones.
    // So we need to apply: userPitch + (-log2(S)*12) to compensate.
    //
    // SoundTouch.pitchSemitones does high-quality WSOLA pitch shifting.

    const speedPitchCompensation = -Math.log2(this._speed) * 12
    const totalPitch = this._pitch + speedPitchCompensation

    this.soundTouch.pitchSemitones = totalPitch

    // If no processing needed, SoundTouch is still in the chain
    // but with neutral settings — minimal overhead
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  async load(stems: Stem[]): Promise<void> {
    const loadId = ++this._loadId
    this.emit({ type: 'loading' })
    await this.dispose()

    // MixBus: all stems feed into this
    this.mixBus = new Tone.Gain(1)

    // MasterGain: final volume control
    this.masterGain = new Tone.Gain(this._volume)

    // Initialize SoundTouch processing chain
    let soundTouchConnected = false
    try {
      this.initSoundTouch()

      if (this.scriptNode) {
        // Method: connect Tone output → native ScriptProcessor → Tone input
        // Tone nodes expose .output (native GainNode) and .input (native GainNode)
        const mixOutput = this.mixBus.output as unknown as AudioNode
        const masterInput = this.masterGain.input as unknown as AudioNode

        mixOutput.connect(this.scriptNode)
        this.scriptNode.connect(masterInput)
        soundTouchConnected = true
      }
    } catch (err) {
      console.warn('[AudioEngine] SoundTouch init failed, falling back:', err)
      this.soundTouch = null
      if (this.scriptNode) {
        this.scriptNode.disconnect()
        this.scriptNode = null
      }
    }

    // Fallback: direct connection without SoundTouch processing
    if (!soundTouchConnected) {
      this.mixBus.connect(this.masterGain)
    }

    this.masterGain.toDestination()

    // Apply current SoundTouch settings
    this.updateSoundTouchParams()

    // Tone.Transport settings
    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0

    // Helper: load a single stem and connect to mix bus
    const loadStem = async (stem: Stem): Promise<boolean> => {
      try {
        const player = new Tone.Player({ url: stem.audioUrl, loop: false })

        await Promise.race([
          new Promise<void>((resolve, reject) => {
            player.buffer.onload = () => resolve()
            ;(player as any).onerror = reject
          }),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 20000)
          ),
        ])

        // Verify buffer is valid
        if (!player.buffer || !player.buffer.duration || player.buffer.duration < 0.5) {
          console.warn(`[AudioEngine] Stem ${stem.id} has invalid buffer, skipping`)
          player.dispose()
          return false
        }

        const gain = new Tone.Gain(1)
        const panner = new Tone.Panner(0)

        // Audio routing: player → gain → panner → mixBus
        player.connect(gain)
        gain.connect(panner)
        panner.connect(this.mixBus!)

        // Sync player to Transport clock
        player.sync().start(0)
        player.playbackRate = this._speed

        this.stems.set(stem.id, { id: stem.id, player, gain, panner })
        return true
      } catch (err) {
        console.warn(`[AudioEngine] Skipping stem ${stem.id}:`, err)
        return false
      }
    }

    // 1. Load primary stem first so playback can start quickly
    const primaryStem = stems[0]
    const rest = stems.slice(1)

    const primaryOk = await loadStem(primaryStem)
    if (loadId !== this._loadId) return // another load started — abort
    if (!primaryOk) {
      this.emit({ type: 'error', message: 'Não foi possível carregar a faixa. Verifique sua conexão.' })
      return
    }

    // Get duration from primary stem
    const primaryLoaded = this.stems.get(primaryStem.id)
    this._duration = primaryLoaded?.player.buffer?.duration ?? 0

    // Mark as loaded — playback is ready with primary stem
    this.isLoaded = true
    this.emit({ type: 'loaded' })

    // 2. Load remaining stems in background, in batches of 3
    const BATCH_SIZE = 3
    for (let i = 0; i < rest.length; i += BATCH_SIZE) {
      if (loadId !== this._loadId) break // another load started — abort
      const batch = rest.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(s => loadStem(s)))

      // Update duration if a longer stem was found
      let maxDuration = this._duration
      this.stems.forEach(({ player }) => {
        const dur = player.buffer?.duration ?? 0
        if (dur > maxDuration) maxDuration = dur
      })
      this._duration = maxDuration
    }
  }

  // ─── Transport controls ────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.isLoaded) return
    await Tone.start()
    Tone.getTransport().start()
    this.startTimeUpdater()
  }

  pause(): void {
    Tone.getTransport().pause()
    this.stopTimeUpdater()
  }

  stop(): void {
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    this.stopTimeUpdater()

    // Clear SoundTouch buffers to prevent stale audio on restart
    if (this.soundTouch) {
      this.soundTouch.clear()
    }

    this.emit({ type: 'timeupdate', currentTime: 0, duration: this._duration })
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this._duration - 0.1))
    Tone.getTransport().seconds = clamped

    // Clear SoundTouch buffers on seek to prevent artifacts
    if (this.soundTouch) {
      this.soundTouch.clear()
    }
  }

  get currentTime(): number {
    return Tone.getTransport().seconds
  }

  get duration(): number {
    return this._duration
  }

  get isPlaying(): boolean {
    return Tone.getTransport().state === 'started'
  }

  // ─── Pitch (semitones, -12..+12) ──────────────────────────────────────────
  // Uses SoundTouch WSOLA — zero distortion, preserves formants

  setPitch(semitones: number): void {
    this._pitch = semitones
    this.updateSoundTouchParams()
  }

  get pitch(): number {
    return this._pitch
  }

  // ─── Speed (0.5..2.0) ─────────────────────────────────────────────────────
  // Strategy: Player.playbackRate for time sync + SoundTouch WSOLA for pitch fix
  // The WSOLA algorithm produces dramatically better results than Tone.PitchShift

  setSpeed(speed: number): void {
    const prev = this._speed
    this._speed = speed

    // Update playbackRate on all players
    this.stems.forEach(({ player }) => {
      player.playbackRate = speed
    })

    // Update SoundTouch pitch compensation
    this.updateSoundTouchParams()

    // Adjust transport position to maintain correct time
    if (Tone.getTransport().state === 'started') {
      const currentPos = Tone.getTransport().seconds
      const newPos = currentPos * (prev / speed)
      Tone.getTransport().seconds = newPos
    }

    // Clear SoundTouch buffers for clean transition
    if (this.soundTouch) {
      this.soundTouch.clear()
    }
  }

  get speed(): number {
    return this._speed
  }

  // ─── Master volume (0..1) ─────────────────────────────────────────────────

  setVolume(volume: number): void {
    this._volume = volume
    if (this.masterGain) {
      this.masterGain.gain.rampTo(volume, 0.05)
    }
  }

  // ─── Stem controls ─────────────────────────────────────────────────────────

  setStemStates(stemStates: Record<string, StemState>): void {
    const stemIds = Object.keys(stemStates)
    const hasSolo = stemIds.some(id => stemStates[id]?.solo)

    stemIds.forEach(id => {
      const stemState = stemStates[id]
      const loaded = this.stems.get(id)
      if (!loaded || !stemState) return

      let targetVolume: number
      if (hasSolo) {
        targetVolume = stemState.solo ? stemState.volume : 0
      } else {
        targetVolume = stemState.muted ? 0 : stemState.volume
      }

      loaded.gain.gain.rampTo(targetVolume, 0.05)
    })
  }

  setStemVolume(stemId: string, volume: number): void {
    const loaded = this.stems.get(stemId)
    if (loaded) {
      loaded.gain.gain.rampTo(volume, 0.05)
    }
  }

  // ─── Reset helpers ─────────────────────────────────────────────────────────

  resetPitch(): void {
    this.setPitch(0)
  }

  resetSpeed(): void {
    this.setSpeed(1)
  }

  resetMix(): void {
    this.stems.forEach(({ gain }) => {
      gain.gain.rampTo(1, 0.1)
    })
  }

  // ─── Time updater (RAF-based) ─────────────────────────────────────────────

  private startTimeUpdater(): void {
    this.stopTimeUpdater()
    let cancelled = false
    const update = () => {
      if (cancelled || !this.isLoaded) return
      const ct = Tone.getTransport().seconds
      this.emit({ type: 'timeupdate', currentTime: ct, duration: this._duration })

      if (this._duration > 0 && ct >= this._duration - 0.1) {
        this.stop()
        this.emit({ type: 'ended' })
        return
      }
      this.rafId = requestAnimationFrame(update)
    }
    // Store cancellation function for cleanup
    this._cancelRaf = () => { cancelled = true }
    this.rafId = requestAnimationFrame(update)
  }

  private stopTimeUpdater(): void {
    if (this._cancelRaf) {
      this._cancelRaf()
      this._cancelRaf = null
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    this.stopTimeUpdater()
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()

    this.stems.forEach(({ player, gain, panner }) => {
      try {
        player.unsync()
        player.stop()
        player.dispose()
        gain.dispose()
        panner.dispose()
      } catch {
        // ignore cleanup errors
      }
    })
    this.stems.clear()

    // Cleanup SoundTouch chain
    if (this.scriptNode) {
      this.scriptNode.disconnect()
      this.scriptNode.onaudioprocess = null
      this.scriptNode = null
    }
    if (this.soundTouch) {
      this.soundTouch.clear()
      this.soundTouch = null
    }

    if (this.mixBus) {
      this.mixBus.dispose()
      this.mixBus = null
    }
    if (this.masterGain) {
      this.masterGain.dispose()
      this.masterGain = null
    }

    this.isLoaded = false
    this._duration = 0
  }
}

// Singleton
export const audioEngine = new AudioEngine()
