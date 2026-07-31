import { SoundTouch } from 'soundtouchjs'

const BUFFER_SIZE = 4096

function getNativeAudioContext(ctx: AudioContext): AudioContext {
  const native = (ctx as any)._nativeContext ?? (ctx as any)._context
  if (native && typeof native.createScriptProcessor === 'function') return native
  if (typeof ctx.createScriptProcessor === 'function') return ctx
  throw new Error('createScriptProcessor not available')
}

export class SoundTouchProcessor {
  private st: SoundTouch
  private processor: ScriptProcessorNode
  private ilIn: Float32Array
  private ilOut: Float32Array
  private _bypass = true

  constructor(ctx: AudioContext) {
    this.st = new SoundTouch()
    this.ilIn = new Float32Array(BUFFER_SIZE * 2)
    this.ilOut = new Float32Array(BUFFER_SIZE * 2)
    const nativeCtx = getNativeAudioContext(ctx)
    this.processor = nativeCtx.createScriptProcessor(BUFFER_SIZE, 2, 2)
    this.processor.onaudioprocess = this._process.bind(this)
  }

  private _process(e: AudioProcessingEvent): void {
    const inL = e.inputBuffer.getChannelData(0)
    const inR = e.inputBuffer.getChannelData(1)
    const outL = e.outputBuffer.getChannelData(0)
    const outR = e.outputBuffer.getChannelData(1)

    if (this._bypass) {
      outL.set(inL)
      outR.set(inR)
      return
    }

    const n = inL.length

    for (let i = 0; i < n; i++) {
      this.ilIn[i * 2] = inL[i]
      this.ilIn[i * 2 + 1] = inR[i]
    }

    this.st.inputBuffer.putSamples(this.ilIn, 0, n)
    this.st.process()

    const avail = this.st.outputBuffer.frameCount
    const take = Math.min(n, avail)

    if (take > 0) {
      this.st.outputBuffer.receiveSamples(this.ilOut, take)
      for (let i = 0; i < take; i++) {
        outL[i] = this.ilOut[i * 2]
        outR[i] = this.ilOut[i * 2 + 1]
      }
    }

    if (take < n) {
      for (let i = take; i < n; i++) {
        outL[i] = inL[i]
        outR[i] = inR[i]
      }
    }
  }

  get node(): ScriptProcessorNode {
    return this.processor
  }

  get isBypassed(): boolean {
    return this._bypass
  }

  set pitchSemitones(v: number) {
    const nearZero = Math.abs(v) < 0.05
    if (nearZero && !this._bypass) {
      this._bypass = true
      this.st.clear()
    } else if (!nearZero) {
      if (this._bypass) {
        this._bypass = false
        this.st.clear()
      }
      this.st.pitchSemitones = v
    }
  }

  clear(): void {
    this.st.clear()
  }

  dispose(): void {
    this.processor.disconnect()
    this.processor.onaudioprocess = null
  }
}
