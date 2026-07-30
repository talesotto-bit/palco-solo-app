/**
 * AudioEngine — professional playback core for Palco Solo
 *
 * Audio chain (real-time, zero UI blocking):
 *  Tone.Player → Tone.Gain (stem) → Tone.Panner → MixBus → PitchShift → MasterGain → Destination
 *
 * Pitch strategy (real-time):
 *  A single Tone.PitchShift on the mix bus handles both user pitch and
 *  speed-compensation in real-time. No offline processing, no UI freezes.
 *  Speed changes playbackRate on each Player; PitchShift compensates the
 *  induced pitch shift instantly.
 */

import * as Tone from 'tone'
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'
import { encodeMp3 } from '@/lib/mp3Encoder'

// ─── Audio Context unlock ───────────────────────────────────────────────────

let _audioUnlocked = false

function ensureAudioUnlock() {
  if (_audioUnlocked) return

  const unlock = async () => {
    try {
      await Tone.start()
      const ctx = Tone.getContext().rawContext
      if (ctx.state === 'suspended') {
        await (ctx as AudioContext).resume()
      }
      _audioUnlocked = true
      ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
        document.removeEventListener(evt, unlock, true)
      )
    } catch {}
  }

  ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
    document.addEventListener(evt, unlock, { capture: true, passive: true })
  )
}

export interface LoadedStem {
  id: string
  player: Tone.Player
  gain: Tone.Gain
  panner: Tone.Panner
  originalBuffer: AudioBuffer
}

export type AudioEngineEvent =
  | { type: 'timeupdate'; currentTime: number; duration: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  | { type: 'loaded' }
  | { type: 'loading' }
  | { type: 'pitchProcessing'; active: boolean }

type EventCallback = (event: AudioEngineEvent) => void

// ─── AudioEngine ────────────────────────────────────────────────────────────

class AudioEngine {
  private stems: Map<string, LoadedStem> = new Map()
  private mixBus: Tone.Gain | null = null
  private masterGain: Tone.Gain | null = null
  private pitchShift: Tone.PitchShift | null = null

  private _pitch = 0       // semitones (-12..+12)
  private _speed = 1       // ratio (0.5..2.0)
  private _volume = 0.85
  private _duration = 0
  private listeners: Set<EventCallback> = new Set()
  private rafId: number | null = null
  private _cancelRaf: (() => void) | null = null
  private isLoaded = false
  private _loadId = 0
  private _pitchTimer: ReturnType<typeof setTimeout> | null = null
  private _speedTimer: ReturnType<typeof setTimeout> | null = null
  private _lastPitchApply = 0
  private _lastSpeedApply = 0

  constructor() {
    ensureAudioUnlock()

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const ctx = Tone.getContext().rawContext
        if (ctx.state === 'suspended') {
          (ctx as AudioContext).resume().catch(() => {})
        }
      }
    })
  }

  // ─── Event system ──────────────────────────────────────────────────────────

  on(cb: EventCallback) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: AudioEngineEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  // ─── Real-time pitch update ────────────────────────────────────────────────

  private _applyPitchNow(): void {
    if (!this.pitchShift) return
    const speedComp = -Math.log2(this._speed) * 12
    this.pitchShift.pitch = this._pitch + speedComp
    this._lastPitchApply = performance.now()
  }

  private updatePitchShift(): void {
    if (!this.pitchShift) return
    const now = performance.now()
    if (now - this._lastPitchApply > 60) {
      this._applyPitchNow()
    } else {
      if (this._pitchTimer) clearTimeout(this._pitchTimer)
      this._pitchTimer = setTimeout(() => {
        this._pitchTimer = null
        this._applyPitchNow()
      }, 60)
    }
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  async load(stems: Stem[]): Promise<void> {
    const loadId = ++this._loadId
    this.emit({ type: 'loading' })
    await this.dispose()

    try { await Tone.start() } catch {}
    const ctx = Tone.getContext().rawContext as AudioContext
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }

    // Audio chain: stems → mixBus → pitchShift → masterGain → destination
    this.mixBus = new Tone.Gain(1)
    this.pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.2 })
    this.masterGain = new Tone.Gain(this._volume)

    this.mixBus.connect(this.pitchShift)
    this.pitchShift.connect(this.masterGain)
    this.masterGain.toDestination()

    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0

    const loadStem = async (stem: Stem): Promise<boolean> => {
      try {
        const player = new Tone.Player({ url: stem.audioUrl, loop: false })

        await Promise.race([
          new Promise<void>((resolve, reject) => {
            if (player.buffer.loaded) {
              resolve()
              return
            }
            player.buffer.onload = () => resolve()
            ;(player as any).onerror = (err: any) => reject(err || new Error('Load error'))
          }),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 30000)
          ),
        ])

        const bufDur = player.buffer?.duration ?? 0
        if (!player.buffer || !Number.isFinite(bufDur) || bufDur < 0.5) {
          player.dispose()
          return false
        }

        if (!this.mixBus) {
          player.dispose()
          return false
        }

        const gain = new Tone.Gain(1)
        const panner = new Tone.Panner(0)

        player.connect(gain)
        gain.connect(panner)
        panner.connect(this.mixBus)

        player.sync().start(0)
        player.playbackRate = this._speed

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

    // Apply pitch + speed compensation instantly
    this.updatePitchShift()

    // Load remaining stems progressively
    for (let i = 0; i < rest.length; i++) {
      if (loadId !== this._loadId) break
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
  }

  // ─── Transport controls ────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.isLoaded) return

    const ctx = Tone.getContext().rawContext as AudioContext

    const getState = () => ctx.state as string
    if (getState() !== 'running') {
      try { await Tone.start() } catch {}
      if (getState() === 'suspended') {
        try { await ctx.resume() } catch {}
      }
      if (getState() !== 'running') {
        await new Promise(r => setTimeout(r, 100))
      }
      if (getState() !== 'running') {
        // Pre-unlock on next gesture so the subsequent play attempt works
        const preUnlock = async () => {
          try {
            await Tone.start()
            if (ctx.state === 'suspended') await ctx.resume()
            if (ctx.state === 'running') _audioUnlocked = true
          } catch {}
          ;['touchstart', 'click'].forEach(e =>
            document.removeEventListener(e, preUnlock, true)
          )
        }
        ;['touchstart', 'click'].forEach(e =>
          document.addEventListener(e, preUnlock, { capture: true, once: true })
        )
        this.emit({ type: 'error', message: 'Toque na tela para ativar o áudio.' })
        return
      }
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
    this.emit({ type: 'timeupdate', currentTime: 0, duration: this.duration })
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration - 0.1))
    if (this.masterGain && this.isPlaying) {
      const g = this.masterGain.gain
      const now = Tone.now()
      g.cancelScheduledValues(now)
      g.setValueAtTime(0, now)
      Tone.getTransport().seconds = clamped
      g.linearRampToValueAtTime(this._volume, now + 0.04)
    } else {
      Tone.getTransport().seconds = clamped
    }
  }

  get currentTime(): number {
    return Tone.getTransport().seconds
  }

  get duration(): number {
    return this._speed > 0 ? this._duration / this._speed : this._duration
  }

  get isPlaying(): boolean {
    return Tone.getTransport().state === 'started'
  }

  // ─── Pitch (semitones, -12..+12) ──────────────────────────────────────────

  setPitch(semitones: number): void {
    this._pitch = semitones
    this.updatePitchShift()
  }

  get pitch(): number {
    return this._pitch
  }

  // ─── Speed (0.5..2.0) ─────────────────────────────────────────────────────

  private _applySpeedNow(): void {
    this.stems.forEach(({ player }) => {
      player.playbackRate = this._speed
    })
    this.updatePitchShift()
    this._lastSpeedApply = performance.now()
  }

  setSpeed(speed: number): void {
    this._speed = speed
    const now = performance.now()
    if (now - this._lastSpeedApply > 60) {
      this._applySpeedNow()
    } else {
      if (this._speedTimer) clearTimeout(this._speedTimer)
      this._speedTimer = setTimeout(() => {
        this._speedTimer = null
        this._applySpeedNow()
      }, 60)
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

      const transport = Tone.getTransport()
      if (transport.state !== 'started') {
        this.rafId = requestAnimationFrame(update)
        return
      }

      const ct = transport.seconds
      if (!Number.isFinite(ct) || ct < 0) {
        this.rafId = requestAnimationFrame(update)
        return
      }

      const effectiveDur = this.duration
      this.emit({ type: 'timeupdate', currentTime: ct, duration: effectiveDur })

      if (effectiveDur > 0 && ct >= effectiveDur - 0.15) {
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

  // ─── Export mixdown ─────────────────────────────────────────────────────────

  exportMixdown(stemStates: Record<string, StemState>): Blob | null {
    if (!this.isLoaded || this.stems.size === 0) return null

    try {
      const hasSolo = Object.values(stemStates).some(s => s.solo)

      const audible: { buffer: AudioBuffer; volume: number }[] = []
      let maxLength = 0

      for (const [id, loaded] of this.stems) {
        const state = stemStates[id]
        if (!state) continue

        let vol: number
        if (hasSolo) {
          vol = state.solo ? state.volume : 0
        } else {
          vol = state.muted ? 0 : state.volume
        }
        if (vol === 0) continue

        const buf = loaded.originalBuffer
        if (!buf || buf.length < 1) continue

        audible.push({ buffer: buf, volume: vol * this._volume })
        if (buf.length > maxLength) maxLength = buf.length
      }

      if (audible.length === 0 || maxLength === 0) return null

      const sampleRate = audible[0].buffer.sampleRate

      const outL = new Float32Array(maxLength)
      const outR = new Float32Array(maxLength)

      for (const { buffer, volume } of audible) {
        const srcL = buffer.getChannelData(0)
        const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL
        const len = buffer.length
        for (let i = 0; i < len; i++) {
          outL[i] += srcL[i] * volume
          outR[i] += srcR[i] * volume
        }
      }

      // Resample for speed if needed
      let finalL = outL
      let finalR = outR
      let finalLength = maxLength

      if (Math.abs(this._speed - 1) > 0.001) {
        finalLength = Math.round(maxLength / this._speed)
        finalL = new Float32Array(finalLength)
        finalR = new Float32Array(finalLength)
        for (let i = 0; i < finalLength; i++) {
          const srcIdx = i * this._speed
          const idx0 = Math.floor(srcIdx)
          const idx1 = Math.min(idx0 + 1, maxLength - 1)
          const frac = srcIdx - idx0
          finalL[i] = outL[idx0] * (1 - frac) + outL[idx1] * frac
          finalR[i] = outR[idx0] * (1 - frac) + outR[idx1] * frac
        }
      }

      const offCtx = new OfflineAudioContext(2, finalLength, sampleRate)
      const mixed = offCtx.createBuffer(2, finalLength, sampleRate)
      mixed.getChannelData(0).set(finalL)
      mixed.getChannelData(1).set(finalR)

      return encodeMp3(mixed)
    } catch (err) {
      console.error('[AudioEngine] exportMixdown failed:', err)
      return null
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    if (this._pitchTimer) { clearTimeout(this._pitchTimer); this._pitchTimer = null }
    if (this._speedTimer) { clearTimeout(this._speedTimer); this._speedTimer = null }
    this.stopTimeUpdater()
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()

    this.stems.forEach(({ player, gain, panner }) => {
      try { player.unsync() } catch {}
      try { player.stop() } catch {}
      try { player.dispose() } catch {}
      try { gain.dispose() } catch {}
      try { panner.dispose() } catch {}
    })
    this.stems.clear()

    if (this.pitchShift) {
      try { this.pitchShift.dispose() } catch {}
      this.pitchShift = null
    }
    if (this.mixBus) {
      try { this.mixBus.dispose() } catch {}
      this.mixBus = null
    }
    if (this.masterGain) {
      try { this.masterGain.dispose() } catch {}
      this.masterGain = null
    }

    this.isLoaded = false
    this._duration = 0
  }
}

// Singleton
export const audioEngine = new AudioEngine()
