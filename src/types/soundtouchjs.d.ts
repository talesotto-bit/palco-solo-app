declare module 'soundtouchjs' {
  export class SoundTouch {
    constructor()
    tempo: number
    rate: number
    pitch: number
    pitchOctaves: number
    pitchSemitones: number
    rateChange: number
    tempoChange: number
    inputBuffer: FifoSampleBuffer
    outputBuffer: FifoSampleBuffer
    process(): void
    clear(): void
    clone(): SoundTouch
    calculateEffectiveRateAndTempo(): void
  }

  export class FifoSampleBuffer {
    putSamples(samples: Float32Array, numFrames?: number): void
    receiveSamples(output: Float32Array, numFrames?: number): number
    extract(output: Float32Array, numFrames?: number): number
    clear(): void
    readonly frameCount: number
    readonly position: number
    readonly startIndex: number
    readonly endIndex: number
    vector: Float32Array
    rewind(): void
    ensureCapacity(size: number): void
    ensureAdditionalCapacity(size: number): void
    put(numFrames: number): void
    receive(numFrames: number): void
    putBuffer(buffer: FifoSampleBuffer): void
  }

  export class SimpleFilter {
    constructor(source: any, soundTouch: SoundTouch, callback?: () => void)
    extract(target: Float32Array, numFrames: number): number
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer)
    extract(target: Float32Array, numFrames: number, position: number): number
    readonly durationMs: number
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (pos: { position: number }) => void,
    bufferSize?: number
  ): ScriptProcessorNode
}
