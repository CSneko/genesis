/** Used exports of the pinned dsh-see-now 0.2.3 image pipeline. @module */
declare module 'dsh-see-now/pipeline' {
  interface Sheet {
    png: Uint8Array
    frames: Array<{ t: number }>
    from: number
    to: number
  }
  /**
   * Create an isolated RGB24 change detector and sheet compositor.
   * @param options - Capture geometry and bounded retention for one observation.
   * @returns Pipeline owned by its caller; no processes, audio, or wakeups are started.
   */
  export function createPipeline(options: {
    width: number
    height: number
    fps: number
    maxFrames: number
    queueDepth: number
    maxCrop: number
    region: { w: number; h: number }
  }): {
    push(frame: { t: number; buf: Uint8Array }): void
    flushNow(): Sheet | null
    take(): Sheet | null
  }
}
