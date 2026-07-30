import { SoundTouch } from 'soundtouchjs'

const BUFFER_SIZE = 4096

export class SoundTouchProcessor {
  private st: SoundTouch
  private processor: ScriptProcessorNode
  private ilIn: Float32Array
  private ilOut: Float32Array

  constructor(ctx: AudioContext) {
    this.st = new SoundTouch()
    this.ilIn = new Float32Array(BUFFER_SIZE * 2)
    this.ilOut = new Float32Array(BUFFER_SIZE * 2)
    this.processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2)
    this.processor.onaudioprocess = this._process.bind(this)
  }

  private _process(e: AudioProcessingEvent): void {
    const inL = e.inputBuffer.getChannelData(0)
    const inR = e.inputBuffer.getChannelData(1)
    const n = inL.length

    for (let i = 0; i < n; i++) {
      this.ilIn[i * 2] = inL[i]
      this.ilIn[i * 2 + 1] = inR[i]
    }

    this.st.inputBuffer.putSamples(this.ilIn, 0, n)
    this.st.process()

    const outL = e.outputBuffer.getChannelData(0)
    const outR = e.outputBuffer.getChannelData(1)
    const avail = this.st.outputBuffer.frameCount
    const take = Math.min(n, avail)

    if (take > 0) {
      this.st.outputBuffer.receiveSamples(this.ilOut, take)
      for (let i = 0; i < take; i++) {
        outL[i] = this.ilOut[i * 2]
        outR[i] = this.ilOut[i * 2 + 1]
      }
    }

    for (let i = take; i < n; i++) {
      outL[i] = 0
      outR[i] = 0
    }
  }

  get node(): ScriptProcessorNode {
    return this.processor
  }

  set pitchSemitones(v: number) {
    this.st.pitchSemitones = v
  }

  clear(): void {
    this.st.clear()
  }

  dispose(): void {
    this.processor.disconnect()
    this.processor.onaudioprocess = null
  }
}
