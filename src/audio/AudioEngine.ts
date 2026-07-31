import * as Tone from 'tone'
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'
import { encodeMp3 } from '@/lib/mp3Encoder'

let _audioUnlocked = false

async function tryUnlockAudio(): Promise<boolean> {
  try { await Tone.start() } catch {}
  const ctx = Tone.getContext()
  if ((ctx.state as string) === 'running') { _audioUnlocked = true; return true }
  try { await (ctx.rawContext as AudioContext).resume() } catch {}
  if ((ctx.state as string) === 'running') { _audioUnlocked = true; return true }
  return false
}

function ensureAudioUnlock() {
  if (_audioUnlocked) return
  const unlock = async () => {
    if (await tryUnlockAudio()) {
      ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
        document.removeEventListener(evt, unlock, true)
      )
    }
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

class AudioEngine {
  private stems: Map<string, LoadedStem> = new Map()
  private mixBus: Tone.Gain | null = null
  private masterGain: Tone.Gain | null = null
  private pitchShift: Tone.PitchShift | null = null
  private _pitchConnected = false

  private _pitch = 0
  private _speed = 1
  private _volume = 0.85
  private _duration = 0
  private listeners: Set<EventCallback> = new Set()
  private rafId: number | null = null
  private _cancelRaf: (() => void) | null = null
  private isLoaded = false
  private _loadId = 0

  constructor() {
    ensureAudioUnlock()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Tone.getContext().state === 'suspended') {
        (Tone.getContext().rawContext as AudioContext).resume().catch(() => {})
      }
    })
  }

  on(cb: EventCallback) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: AudioEngineEvent) {
    this.listeners.forEach(cb => cb(event))
  }

  private _ensurePitchShift(): boolean {
    if (this._pitchConnected && this.pitchShift) return true
    if (!this.mixBus || !this.masterGain) return false
    try {
      this.pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.08, delayTime: 0, feedback: 0, wet: 1 })
      this.mixBus.disconnect(this.masterGain)
      this.mixBus.connect(this.pitchShift)
      this.pitchShift.connect(this.masterGain)
      this._pitchConnected = true
      return true
    } catch (err) {
      console.warn('[AudioEngine] PitchShift creation failed:', err)
      this.pitchShift = null
      return false
    }
  }

  private _applyPitch(): void {
    if (!this.pitchShift) return
    const speedComp = this._speed === 1 ? 0 : -Math.log2(this._speed) * 12
    this.pitchShift.pitch = this._pitch + speedComp
  }

  private async fetchAudio(url: string): Promise<AudioBuffer> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    try {
      const resp = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const arrayBuf = await resp.arrayBuffer()
      return await Tone.getContext().decodeAudioData(arrayBuf)
    } catch (err) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  async load(stems: Stem[]): Promise<void> {
    try { await Tone.start() } catch {}

    const loadId = ++this._loadId
    this.emit({ type: 'loading' })
    await this.dispose()

    const ctx = Tone.getContext()
    if ((ctx.state as string) !== 'running') {
      try { await (ctx.rawContext as AudioContext).resume() } catch {}
    }

    this.mixBus = new Tone.Gain(1)
    this.masterGain = new Tone.Gain(this._volume)
    this.mixBus.connect(this.masterGain)
    this.masterGain.toDestination()

    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0

    const loadStem = async (stem: Stem): Promise<boolean> => {
      try {
        const audioBuf = await this.fetchAudio(stem.audioUrl)
        if (audioBuf.duration < 0.5 || !this.mixBus) return false

        const player = new Tone.Player()
        player.buffer.set(audioBuf)

        const gain = new Tone.Gain(1)
        const panner = new Tone.Panner(0)

        player.connect(gain)
        gain.connect(panner)
        panner.connect(this.mixBus)

        player.sync().start(0)
        player.playbackRate = this._speed

        this.stems.set(stem.id, { id: stem.id, player, gain, panner, originalBuffer: audioBuf })
        return true
      } catch (err) {
        console.error(`[AudioEngine] Stem ${stem.id} failed:`, err)
        return false
      }
    }

    const primaryStem = stems[0]
    const rest = stems.slice(1)

    const primaryOk = await loadStem(primaryStem)
    if (loadId !== this._loadId) return
    if (!primaryOk) {
      this.emit({ type: 'error', message: 'Não foi possível carregar a faixa. Verifique sua conexão.' })
      return
    }

    const primaryLoaded = this.stems.get(primaryStem.id)
    this._duration = primaryLoaded?.originalBuffer.duration ?? 0

    this.isLoaded = true
    this.emit({ type: 'loaded' })

    if (Math.abs(this._pitch) > 0.05 || Math.abs(this._speed - 1) > 0.01) {
      if (this._ensurePitchShift()) this._applyPitch()
    }

    for (let i = 0; i < rest.length; i++) {
      if (loadId !== this._loadId) break
      await new Promise(r => setTimeout(r, 50))
      if (loadId !== this._loadId) break
      await loadStem(rest[i])
      let maxDuration = this._duration
      this.stems.forEach(({ originalBuffer }) => {
        if (originalBuffer.duration > maxDuration) maxDuration = originalBuffer.duration
      })
      this._duration = maxDuration
    }
  }

  async play(): Promise<void> {
    if (!this.isLoaded) return

    try { await Tone.start() } catch {}
    const ctx = Tone.getContext()
    if ((ctx.state as string) !== 'running') {
      try { await (ctx.rawContext as AudioContext).resume() } catch {}
    }

    if ((ctx.state as string) !== 'running') {
      const unlockOnGesture = () => {
        tryUnlockAudio().then(ok => {
          if (ok) {
            Tone.getTransport().start()
            this.startTimeUpdater()
            this.emit({ type: 'timeupdate', currentTime: this.currentTime, duration: this.duration })
          }
        })
        ;['touchstart', 'touchend', 'click'].forEach(e =>
          document.removeEventListener(e, unlockOnGesture, true)
        )
      }
      ;['touchstart', 'touchend', 'click'].forEach(e =>
        document.addEventListener(e, unlockOnGesture, { capture: true, once: true })
      )
      this.emit({ type: 'error', message: 'Toque na tela para ativar o áudio.' })
      return
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

  get currentTime(): number { return Tone.getTransport().seconds }

  get duration(): number {
    return this._speed > 0 ? this._duration / this._speed : this._duration
  }

  get isPlaying(): boolean { return Tone.getTransport().state === 'started' }
  get loaded(): boolean { return this.isLoaded }
  get pitch(): number { return this._pitch }
  get speed(): number { return this._speed }

  setPitch(semitones: number): void {
    this._pitch = semitones
    const needsShift = Math.abs(semitones) > 0.05 || Math.abs(this._speed - 1) > 0.01

    if (needsShift) {
      if (this._ensurePitchShift()) {
        if (this.isPlaying && this.masterGain) {
          const g = this.masterGain.gain
          const vol = this._volume
          const now = Tone.now()
          g.cancelScheduledValues(now)
          g.setValueAtTime(vol, now)
          g.linearRampToValueAtTime(0.001, now + 0.03)
          setTimeout(() => {
            this._applyPitch()
            setTimeout(() => {
              if (this.masterGain) {
                const n2 = Tone.now()
                const g2 = this.masterGain.gain
                g2.cancelScheduledValues(n2)
                g2.setValueAtTime(0.001, n2)
                g2.linearRampToValueAtTime(vol, n2 + 0.05)
              }
            }, 40)
          }, 35)
        } else {
          this._applyPitch()
        }
      }
    } else if (this.pitchShift) {
      this.pitchShift.pitch = 0
    }
  }

  setSpeed(speed: number): void {
    const prev = this._speed
    this._speed = speed

    if (this.masterGain && this.isPlaying && Math.abs(speed - prev) > 0.01) {
      const g = this.masterGain.gain
      const now = Tone.now()
      const vol = this._volume
      g.cancelScheduledValues(now)
      g.setValueAtTime(vol, now)
      g.linearRampToValueAtTime(0.001, now + 0.025)
      setTimeout(() => {
        this.stems.forEach(({ player }) => { player.playbackRate = this._speed })
        if (Math.abs(this._pitch) > 0.05 || Math.abs(this._speed - 1) > 0.01) {
          if (this._ensurePitchShift()) this._applyPitch()
        } else if (this.pitchShift) {
          this.pitchShift.pitch = 0
        }
        setTimeout(() => {
          if (this.masterGain) {
            const n2 = Tone.now()
            const g2 = this.masterGain.gain
            g2.cancelScheduledValues(n2)
            g2.setValueAtTime(0.001, n2)
            g2.linearRampToValueAtTime(vol, n2 + 0.04)
          }
        }, 40)
      }, 30)
    } else {
      this.stems.forEach(({ player }) => { player.playbackRate = this._speed })
      if (Math.abs(this._pitch) > 0.05 || Math.abs(this._speed - 1) > 0.01) {
        if (this._ensurePitchShift()) this._applyPitch()
      } else if (this.pitchShift) {
        this.pitchShift.pitch = 0
      }
    }
  }

  setVolume(volume: number): void {
    this._volume = volume
    if (this.masterGain) this.masterGain.gain.rampTo(volume, 0.05)
  }

  setStemStates(stemStates: Record<string, StemState>): void {
    const stemIds = Object.keys(stemStates)
    const hasSolo = stemIds.some(id => stemStates[id]?.solo)
    stemIds.forEach(id => {
      const stemState = stemStates[id]
      const loaded = this.stems.get(id)
      if (!loaded || !stemState) return
      let targetVolume: number
      if (hasSolo) { targetVolume = stemState.solo ? stemState.volume : 0 }
      else { targetVolume = stemState.muted ? 0 : stemState.volume }
      loaded.gain.gain.rampTo(targetVolume, 0.05)
    })
  }

  setStemVolume(stemId: string, volume: number): void {
    const loaded = this.stems.get(stemId)
    if (loaded) loaded.gain.gain.rampTo(volume, 0.05)
  }

  resetPitch(): void { this.setPitch(0) }
  resetSpeed(): void { this.setSpeed(1) }
  resetMix(): void { this.stems.forEach(({ gain }) => { gain.gain.rampTo(1, 0.1) }) }

  private startTimeUpdater(): void {
    this.stopTimeUpdater()
    let cancelled = false
    const update = () => {
      if (cancelled || !this.isLoaded) return
      const transport = Tone.getTransport()
      if (transport.state !== 'started') { this.rafId = requestAnimationFrame(update); return }
      const ct = transport.seconds
      if (!Number.isFinite(ct) || ct < 0) { this.rafId = requestAnimationFrame(update); return }
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
    if (this._cancelRaf) { this._cancelRaf(); this._cancelRaf = null }
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
  }

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
        if (hasSolo) { vol = state.solo ? state.volume : 0 }
        else { vol = state.muted ? 0 : state.volume }
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

  async dispose(): Promise<void> {
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
    this._pitchConnected = false
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

export const audioEngine = new AudioEngine()
