/**
 * THREE.FileLoader constructs ProgressEvent in XHR callbacks. Node's test
 * environment does not define it, which becomes an unhandled rejection after
 * lazy catalog loads fetch faces from the CDN.
 */
if (typeof globalThis.ProgressEvent === 'undefined') {
  class ProgressEventPolyfill extends Event {
    readonly lengthComputable: boolean
    readonly loaded: number
    readonly total: number

    constructor(
      type: string,
      init?: {
        lengthComputable?: boolean
        loaded?: number
        total?: number
      }
    ) {
      super(type)
      this.lengthComputable = init?.lengthComputable ?? false
      this.loaded = init?.loaded ?? 0
      this.total = init?.total ?? 0
    }
  }

  Object.defineProperty(globalThis, 'ProgressEvent', {
    configurable: true,
    writable: true,
    value: ProgressEventPolyfill
  })
}
