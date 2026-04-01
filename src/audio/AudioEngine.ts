/**
 * AudioEngine — professional playback core for Palco Solo
 *
 * Architecture:
 *  - Tone.js for Transport sync + Player loading
 *  - SoundTouch WSOLA for offline pitch processing (studio quality)
 *
 * Pitch strategy (offline WSOLA):
 *  When pitch or speed changes, each stem's original AudioBuffer is
 *  processed through SoundTouch WSOLA offline (263x realtime).
 *  The processed buffer replaces the Player's buffer via pause-swap-resume.
 *  Result: zero-artifact pitch shifting, no real-time processing overhead.
 *
 * Audio chain (clean, no ScriptProcessor):
 *  Tone.Player → Tone.Gain (stem) → Tone.Panner → MixBus → MasterGain → Destination
 */

import * as Tone from 'tone'
import { SoundTouch } from 'soundtouchjs'
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'

// ─── Audio Context unlock ───────────────────────────────────────────────────
// Browsers block AudioContext until user gesture. This ensures it's resumed
// on the very first touch/click, so audio always works.

let _audioUnlocked = false

function ensureAudioUnlock() {
  if (_audioUnlocked) return

  const unlock = async () => {
    try {
      await Tone.start()
      // Also resume raw AudioContext in case Tone didn't
      const ctx = Tone.getContext().rawContext
      if (ctx.state === 'suspended') {
        await (ctx as AudioContext).resume()
      }
      _audioUnlocked = true
      // Remove all listeners once unlocked
      ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
        document.removeEventListener(evt, unlock, true)
      )
    } catch {
      // Will retry on next gesture
    }
  }

  // Listen on capture phase so we catch it before anything else
  ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
    document.addEventListener(evt, unlock, { capture: true, passive: true })
  )
}

export interface LoadedStem {
  id: string
  player: Tone.Player
  gain: Tone.Gain
  panner: Tone.Panner
  originalBuffer: AudioBuffer  // raw AudioBuffer clone — never modified
}

export type AudioEngineEvent =
  | { type: 'timeupdate'; currentTime: number; duration: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  | { type: 'loaded' }
  | { type: 'loading' }
  | { type: 'pitchProcessing'; active: boolean }

type EventCallback = (event: AudioEngineEvent) => void

// ─── Offline WSOLA pitch processor ──────────────────────────────────────────

function processBufferWSola(
  audioBuffer: AudioBuffer,
  semitones: number,
): AudioBuffer {
  if (Math.abs(semitones) < 0.01) {
    return audioBuffer
  }

  const st = new SoundTouch()
  st.pitchSemitones = semitones

  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const totalFrames = audioBuffer.length
  const CHUNK = 4096

  // Get source channels
  const srcL = audioBuffer.getChannelData(0)
  const srcR = numChannels > 1 ? audioBuffer.getChannelData(1) : srcL

  // Interleave input
  const interleaved = new Float32Array(totalFrames * 2)
  for (let i = 0; i < totalFrames; i++) {
    interleaved[i * 2] = srcL[i]
    interleaved[i * 2 + 1] = srcR[i]
  }

  // Process through SoundTouch in chunks
  const outputChunks: Float32Array[] = []
  let totalOutput = 0

  for (let pos = 0; pos < totalFrames; pos += CHUNK) {
    const n = Math.min(CHUNK, totalFrames - pos)
    st.inputBuffer.putSamples(interleaved, pos, n)
    st.process()

    const avail = st.outputBuffer.frameCount
    if (avail > 0) {
      const out = new Float32Array(avail * 2)
      st.outputBuffer.receiveSamples(out, avail)
      outputChunks.push(out)
      totalOutput += avail
    }
  }

  // Flush: feed silence to get remaining buffered output
  const silence = new Float32Array(CHUNK * 2)
  for (let flush = 0; flush < 3; flush++) {
    st.inputBuffer.putSamples(silence, 0, CHUNK)
    st.process()
    const avail = st.outputBuffer.frameCount
    if (avail > 0) {
      const out = new Float32Array(avail * 2)
      st.outputBuffer.receiveSamples(out, avail)
      outputChunks.push(out)
      totalOutput += avail
    }
  }

  // Match original duration (pitch shift preserves length)
  const outFrames = Math.min(totalOutput, totalFrames)

  const outBuffer = new AudioBuffer({
    numberOfChannels: numChannels,
    length: outFrames,
    sampleRate,
  })

  // De-interleave output
  const outL = outBuffer.getChannelData(0)
  const outR = numChannels > 1 ? outBuffer.getChannelData(1) : null

  let writePos = 0
  for (const chunk of outputChunks) {
    const chunkFrames = chunk.length / 2
    for (let i = 0; i < chunkFrames && writePos < outFrames; i++, writePos++) {
      outL[writePos] = chunk[i * 2]
      if (outR) outR[writePos] = chunk[i * 2 + 1]
    }
  }

  return outBuffer
}

/** Clone a raw AudioBuffer (deep copy of channel data) */
function cloneAudioBuffer(buf: AudioBuffer): AudioBuffer {
  const clone = new AudioBuffer({
    numberOfChannels: buf.numberOfChannels,
    length: buf.length,
    sampleRate: buf.sampleRate,
  })
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    clone.getChannelData(ch).set(buf.getChannelData(ch))
  }
  return clone
}

// ─── AudioEngine ────────────────────────────────────────────────────────────

class AudioEngine {
  private stems: Map<string, LoadedStem> = new Map()
  private mixBus: Tone.Gain | null = null
  private masterGain: Tone.Gain | null = null

  private _pitch = 0       // semitones (-12..+12)
  private _speed = 1       // ratio (0.5..2.0)
  private _volume = 0.85
  private _duration = 0
  private listeners: Set<EventCallback> = new Set()
  private rafId: number | null = null
  private _cancelRaf: (() => void) | null = null
  private isLoaded = false
  private _loadId = 0       // guard against concurrent loads
  private _pitchJobId = 0   // guard against concurrent pitch processing

  constructor() {
    // Register unlock listeners immediately so first user gesture unlocks audio
    ensureAudioUnlock()
  }

  // ─── Event system ──────────────────────────────────────────────────────────

  on(cb: EventCallback) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: AudioEngineEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  // ─── Buffer swap (pause → replace → resume) ──────────────────────────────

  /**
   * Safely replace a Player's AudioBuffer while preserving Transport sync.
   * Briefly pauses transport, swaps all buffers, then resumes from same position.
   */
  private applyBuffersToPlayers(bufferMap: Map<string, AudioBuffer>): void {
    const transport = Tone.getTransport()
    const wasPlaying = transport.state === 'started'
    const pos = transport.seconds

    // Pause to safely swap buffers
    if (wasPlaying) transport.pause()

    for (const [id, buf] of bufferMap) {
      const stem = this.stems.get(id)
      if (!stem) continue

      // Unsync → stop → swap → re-sync
      try {
        stem.player.unsync()
        stem.player.stop()
      } catch { /* ok if already stopped */ }

      // Replace buffer contents (ToneAudioBuffer.set replaces internal AudioBuffer ref)
      stem.player.buffer.set(buf)

      // Re-sync to Transport and restore playback rate
      stem.player.sync().start(0)
      stem.player.playbackRate = this._speed
    }

    // Resume from same position
    transport.seconds = pos
    if (wasPlaying) transport.start()
  }

  // ─── Offline pitch processing ─────────────────────────────────────────────

  private async reprocessPitch(): Promise<void> {
    const jobId = ++this._pitchJobId

    // Total pitch: user pitch + speed compensation
    // Player.playbackRate of S shifts pitch by +log2(S)*12. Compensate with -log2(S)*12.
    const speedComp = -Math.log2(this._speed) * 12
    const totalSemitones = this._pitch + speedComp

    // Neutral: restore original buffers
    if (Math.abs(totalSemitones) < 0.01) {
      const originals = new Map<string, AudioBuffer>()
      this.stems.forEach((stem, id) => originals.set(id, stem.originalBuffer))
      this.applyBuffersToPlayers(originals)
      return
    }

    this.emit({ type: 'pitchProcessing', active: true })

    try {
      const processed = new Map<string, AudioBuffer>()

      for (const [id, stem] of this.stems) {
        if (jobId !== this._pitchJobId) return // newer change, abort

        // Yield to keep UI responsive between stems
        await new Promise(r => setTimeout(r, 0))
        if (jobId !== this._pitchJobId) return

        // Clone before processing to protect the original reference
        const safeBuf = cloneAudioBuffer(stem.originalBuffer)
        const result = processBufferWSola(safeBuf, totalSemitones)
        processed.set(id, result)
      }

      if (jobId !== this._pitchJobId) return

      // Apply all at once
      this.applyBuffersToPlayers(processed)
    } finally {
      if (jobId === this._pitchJobId) {
        this.emit({ type: 'pitchProcessing', active: false })
      }
    }
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  async load(stems: Stem[]): Promise<void> {
    const loadId = ++this._loadId
    this.emit({ type: 'loading' })
    await this.dispose()

    // Try to unlock AudioContext early (may fail if no gesture yet — that's OK,
    // play() will retry. But if user already tapped, this ensures decode works)
    try { await Tone.start() } catch {}
    const ctx = Tone.getContext().rawContext
    if (ctx.state === 'suspended') {
      try { await (ctx as AudioContext).resume() } catch {}
    }

    // Clean audio chain
    this.mixBus = new Tone.Gain(1)
    this.masterGain = new Tone.Gain(this._volume)
    this.mixBus.connect(this.masterGain)
    this.masterGain.toDestination()

    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0

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

        if (!player.buffer || !player.buffer.duration || player.buffer.duration < 0.5) {
          console.warn(`[AudioEngine] Stem ${stem.id} has invalid buffer, skipping`)
          player.dispose()
          return false
        }

        const gain = new Tone.Gain(1)
        const panner = new Tone.Panner(0)

        player.connect(gain)
        gain.connect(panner)
        panner.connect(this.mixBus!)

        player.sync().start(0)
        player.playbackRate = this._speed

        // Store original AudioBuffer for pitch reprocessing
        // Clone lazily: only deep-copy when pitch is active, otherwise store reference
        // (cloning 20+ stems eagerly doubles memory and crashes mobile)
        const rawBuf = player.buffer.get()
        const originalBuffer = rawBuf ?? new AudioBuffer({ numberOfChannels: 2, length: 1, sampleRate: 44100 })

        this.stems.set(stem.id, { id: stem.id, player, gain, panner, originalBuffer })
        return true
      } catch (err) {
        console.warn(`[AudioEngine] Skipping stem ${stem.id}:`, err)
        return false
      }
    }

    // Load primary stem first
    const primaryStem = stems[0]
    const rest = stems.slice(1)

    const primaryOk = await loadStem(primaryStem)
    if (loadId !== this._loadId) return
    if (!primaryOk) {
      this.emit({ type: 'error', message: 'Não foi possível carregar a faixa. Verifique sua conexão.' })
      return
    }

    const primaryLoaded = this.stems.get(primaryStem.id)
    this._duration = primaryLoaded?.player.buffer?.duration ?? 0

    this.isLoaded = true
    this.emit({ type: 'loaded' })

    // Apply pitch if needed
    const needsPitch = Math.abs(this._pitch + (-Math.log2(this._speed) * 12)) > 0.01
    if (needsPitch) {
      this.reprocessPitch()
    }

    // Load remaining stems progressively (1 at a time to avoid mobile memory pressure)
    for (let i = 0; i < rest.length; i++) {
      if (loadId !== this._loadId) break
      // Yield between stems so the browser can GC and paint
      await new Promise(r => setTimeout(r, 50))
      if (loadId !== this._loadId) break
      await loadStem(rest[i])

      let maxDuration = this._duration
      this.stems.forEach(({ player }) => {
        const dur = player.buffer?.duration ?? 0
        if (dur > maxDuration) maxDuration = dur
      })
      this._duration = maxDuration
    }

    // After all stems loaded, reprocess if pitch is active
    if (needsPitch && loadId === this._loadId) {
      this.reprocessPitch()
    }
  }

  // ─── Transport controls ────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.isLoaded) return

    // Ensure AudioContext is running (required by browsers on first interaction)
    try {
      await Tone.start()
    } catch { /* will retry below */ }

    // Double-check: some browsers need explicit resume on the raw context
    const ctx = Tone.getContext().rawContext
    if (ctx.state === 'suspended') {
      try {
        await (ctx as AudioContext).resume()
      } catch { /* best effort */ }
    }

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
    this.emit({ type: 'timeupdate', currentTime: 0, duration: this._duration })
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this._duration - 0.1))
    Tone.getTransport().seconds = clamped
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

  setPitch(semitones: number): void {
    this._pitch = semitones
    if (this.isLoaded) {
      this.reprocessPitch()
    }
  }

  get pitch(): number {
    return this._pitch
  }

  // ─── Speed (0.5..2.0) ─────────────────────────────────────────────────────

  setSpeed(speed: number): void {
    this._speed = speed

    this.stems.forEach(({ player }) => {
      player.playbackRate = speed
    })

    // Reprocess pitch to compensate speed-induced pitch change
    if (this.isLoaded) {
      this.reprocessPitch()
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
    this._pitchJobId++
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
