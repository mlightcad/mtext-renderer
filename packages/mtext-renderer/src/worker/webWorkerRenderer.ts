import * as THREE from 'three'

import { awaitRenderWork, checkRenderSignal } from '../common/renderRequest'
import { FontManager } from '../font'
import type { IsolateMemoryStats } from '../memory/types'
import { buildCharBoxesFromObject } from '../renderer/charBoxUtils'
import { buildWorkerMaterialColorSettings } from '../renderer/colorUtils'
import { DefaultStyleManager } from '../renderer/defaultStyleManager'
import { StyleManager } from '../renderer/styleManager'
import {
  CharBox,
  CharBoxType,
  ColorSettings,
  createDefaultColorSettings,
  LineLayout,
  MTextData,
  MTextLayout,
  ShapeData,
  TextStyle
} from '../renderer/types'
import {
  MTextBaseRenderer,
  MTextObject,
  TextRenderOptions
} from './baseRenderer'

/**
 * Configuration options for WebWorkerRenderer
 */
export interface WebWorkerRendererConfig {
  /**
   * Number of worker instances to create in the pool
   * @default Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2))
   */
  poolSize?: number

  /**
   * URL path to the worker script
   * @default './assets/mtext-renderer-worker.js'
   */
  workerUrl?: string | URL

  /**
   * Timeout duration in milliseconds for worker requests
   * @default 120000
   */
  timeOut?: number
}

//
// Base interfaces (unified and generic)
//
interface WorkerMessageBase<TType extends string, TData = unknown> {
  id: string
  type: TType
  data?: TData
}

interface WorkerResponseBase<TType extends string, TData = unknown> {
  id: string
  type: TType
  success: boolean
  data?: TData
  error?: string
}

//
// Specific message types
//
type RenderMessage = WorkerMessageBase<
  'render',
  {
    mtextContent: MTextData
    textStyle: TextStyle
    colorSettings: ColorSettings
  }
>

type LoadFontsMessage = WorkerMessageBase<
  'loadFonts',
  {
    fonts: string[]
  }
>

type SetFontUrlMessage = WorkerMessageBase<
  'setFontUrl',
  {
    url: string
  }
>

type GetAvailableFontsMessage = WorkerMessageBase<'getAvailableFonts'>

type GetMemoryStatsMessage = WorkerMessageBase<'getMemoryStats'>

type SetDefaultFontsMessage = WorkerMessageBase<
  'setDefaultFonts',
  {
    fonts: string[]
    symbolFonts: string[]
  }
>

type SetLazyFontLoadingMessage = WorkerMessageBase<
  'setLazyFontLoading',
  {
    enabled: boolean
  }
>

type SetAwaitFontsBeforeDrawMessage = WorkerMessageBase<
  'setAwaitFontsBeforeDraw',
  {
    enabled: boolean
  }
>

type SetMissedFontsMessage = WorkerMessageBase<
  'setMissedFonts',
  {
    missedFonts: Record<string, number>
  }
>

type WorkerMessageTyped =
  | RenderMessage
  | LoadFontsMessage
  | SetDefaultFontsMessage
  | SetLazyFontLoadingMessage
  | SetAwaitFontsBeforeDrawMessage
  | SetMissedFontsMessage
  | SetFontUrlMessage
  | GetAvailableFontsMessage
  | GetMemoryStatsMessage

//
// Specific response types
//
type RenderResponse = WorkerResponseBase<'render', SerializedMText>

type LoadFontsResponse = WorkerResponseBase<
  'loadFonts',
  {
    loaded: string[]
  }
>

type SetFontUrlResponse = WorkerResponseBase<'setFontUrl'>

type GetAvailableFontsResponse = WorkerResponseBase<
  'getAvailableFonts',
  {
    fonts: Array<{ name: string[] }>
  }
>

type GetMemoryStatsResponse = WorkerResponseBase<
  'getMemoryStats',
  IsolateMemoryStats
>

type SetDefaultFontsResponse = WorkerResponseBase<
  'setDefaultFonts',
  {
    fonts: string[]
    symbolFonts: string[]
  }
>

type SetLazyFontLoadingResponse = WorkerResponseBase<
  'setLazyFontLoading',
  {
    enabled: boolean
  }
>

type SetAwaitFontsBeforeDrawResponse = WorkerResponseBase<
  'setAwaitFontsBeforeDraw',
  {
    enabled: boolean
  }
>

type SetMissedFontsResponse = WorkerResponseBase<
  'setMissedFonts',
  {
    missedFonts: Record<string, number>
  }
>

/** Push notification from a worker when a font finishes lazy-loading. */
type FontLoadedNotification = WorkerResponseBase<
  'fontLoaded',
  {
    fontName: string
  }
>

/** Push notification from a worker when a requested face is first recorded as missing. */
type FontNotFoundNotification = WorkerResponseBase<
  'fontNotFound',
  {
    fontName: string
    count?: number
  }
>

type WorkerResponseTyped =
  | RenderResponse
  | LoadFontsResponse
  | SetDefaultFontsResponse
  | SetLazyFontLoadingResponse
  | SetAwaitFontsBeforeDrawResponse
  | SetFontUrlResponse
  | SetMissedFontsResponse
  | GetAvailableFontsResponse
  | GetMemoryStatsResponse
  | FontLoadedNotification
  | FontNotFoundNotification

// Serialized MText data from worker (JSON-based)
interface SerializedMText {
  type: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
  box: {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
  }
  children: SerializedChild[]
}

interface SerializedCharBox {
  type: string
  char: string
  box: {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
  }
  children: SerializedCharBox[]
}

interface SerializedChild {
  type: 'mesh' | 'line'
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
  geometry: {
    attributes: {
      [key: string]: {
        arrayBuffer: ArrayBuffer
        byteOffset: number
        length: number
        itemSize: number
        normalized: boolean
      }
    }
    index: {
      arrayBuffer: ArrayBuffer
      byteOffset: number
      length: number
      componentType?: 'uint16' | 'uint32'
    } | null
  }
  material: {
    type: string
    color: number
    transparent: boolean
    opacity: number
    side?: number
    linewidth?: number
    /** Original segment colour when the worker preserved ACI/RGB semantics. */
    mtextColor?: {
      aci?: number | null
      rgbValue?: number | null
    }
  }
  charBoxType?: CharBox['type']
  lineLayouts?: Array<{ y: number; height: number; breakIndex?: number }>
  charBoxes?: SerializedCharBox[]
}

const tempPoint = /*@__PURE__*/ new THREE.Vector3()
const tempPoint2 = /*@__PURE__*/ new THREE.Vector3()
const tempPoint3 = /*@__PURE__*/ new THREE.Vector3()

/**
 * Manages communication with the MText web worker
 */
export class WebWorkerRenderer implements MTextBaseRenderer {
  private workers: Worker[] = []
  private inFlightPerWorker: number[] = []
  private pendingRequests: Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      cleanup: () => void
    }
  > = new Map()
  // Cancelled callers no longer own results, but their dispatched work still
  // occupies its worker until a reply, error or the transport deadline.
  private workerRequests = new Map<
    string,
    {
      workerIndex: number
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private terminated = false
  private requestId = 0
  private poolSize: number
  private timeOut: number
  private readyPromise: Promise<void> | null = null
  private initialization: Promise<void> | null = null
  private defaultStyleManager: StyleManager
  /**
   * Fonts known to be present in a given worker isolate after an explicit
   * {@link loadFonts} or a lazy `fontLoaded` notification from that worker.
   *
   * Intentionally per-worker: fanning a mesh face (e.g. simsun) into every
   * isolate re-parses tens of MB of opentype data N times and makes worker
   * mode slower than main-thread rendering.
   */
  private fontsPerWorker: Array<Set<string>> = []
  /** Fonts already forwarded as main-thread fontLoaded for this pool lifetime. */
  private poolFontLoadedDispatched = new Set<string>()

  constructor(config: WebWorkerRendererConfig = {}) {
    // Apply default values
    this.poolSize =
      config.poolSize ??
      Math.max(
        1,
        navigator.hardwareConcurrency
          ? Math.min(4, navigator.hardwareConcurrency)
          : 2
      )
    this.defaultStyleManager = new DefaultStyleManager()
    const workerUrl = config.workerUrl ?? './assets/mtext-renderer-worker.js'
    this.timeOut = config.timeOut ?? 120000

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerUrl, {
        type: 'module'
      })
      this.attachWorkerHandlers(worker, i)
      this.workers.push(worker)
      this.inFlightPerWorker.push(0)
      this.fontsPerWorker.push(new Set())
    }
  }

  /**
   * Used to manage materials used by texts
   */
  get styleManager(): StyleManager {
    return this.defaultStyleManager
  }
  set styleManager(value: StyleManager) {
    this.defaultStyleManager = value
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        if (!FontManager.instance.lazyFontLoading) {
          await this.loadFonts(FontManager.instance.getFontsToLoad())
        }
      })()
      const initialization = this.initialization
      void initialization.catch(() => {
        if (this.initialization === initialization) this.initialization = null
      })
    }
    return this.initialization
  }

  /**
   * Handles messages coming from any worker.
   */
  private handleWorkerMessage(
    response: WorkerResponseTyped,
    workerIndex: number
  ) {
    // Lazy font loads complete after the render request has already resolved.
    // Record the face on the notifying worker only — do not re-parse into the
    // rest of the pool (N× mesh-font cost). Other workers load on demand when
    // they first draw text that needs the face; pickLeastLoadedWorker prefers
    // already-warm isolates.
    if (response.type === 'fontLoaded') {
      const fontName = response.data?.fontName
      if (fontName) {
        const key = fontName.toLowerCase()
        this.fontsPerWorker[workerIndex]?.add(key)
        if (key && !this.poolFontLoadedDispatched.has(key)) {
          this.poolFontLoadedDispatched.add(key)
          FontManager.instance.applyRemoteFontLoaded(fontName)
          FontManager.instance.events.fontLoaded.dispatch({ fontName })
        }
      }
      return
    }

    if (response.type === 'fontNotFound') {
      const fontName = response.data?.fontName
      if (fontName) {
        FontManager.instance.applyRemoteFontNotFound(
          fontName,
          response.data?.count ?? 1
        )
      }
      return
    }

    const { id, success, data, error } = response
    if (this.workerRequests.get(id)?.workerIndex !== workerIndex) return
    const pendingRequest = this.finishRequest(id)

    if (pendingRequest) {
      if (success) {
        if (response.type === 'loadFonts') {
          const loaded =
            (data as LoadFontsResponse['data'] | undefined)?.loaded ?? []
          const set = this.fontsPerWorker[workerIndex]
          if (set) {
            for (const name of loaded) {
              const key = name.toLowerCase()
              if (key) set.add(key)
            }
          }
        }
        pendingRequest.resolve(data)
      } else {
        pendingRequest.reject(new Error(error || 'Unknown worker error'))
      }
    }
  }

  /**
   * Attaches message and error handlers to a worker.
   */
  private attachWorkerHandlers(worker: Worker, index: number) {
    worker.onmessage = (event: MessageEvent<WorkerResponseTyped>) => {
      this.handleWorkerMessage(event.data, index)
    }

    worker.onerror = error => {
      console.error(`Worker ${index} error:`, error)

      // Reject all pending requests for this worker
      const idsToReject: string[] = []
      this.workerRequests.forEach((pending, key) => {
        if (pending.workerIndex === index) idsToReject.push(key)
      })

      idsToReject.forEach(id => {
        this.finishRequest(id)?.reject(new Error('Worker error occurred'))
      })

      this.inFlightPerWorker[index] = 0
    }
  }
  private pickLeastLoadedWorker(): number {
    let minIndex = 0
    let minInFlight = this.inFlightPerWorker[0] ?? 0
    let minFonts = this.fontsPerWorker[0]?.size ?? 0
    for (let i = 1; i < this.inFlightPerWorker.length; i++) {
      const inFlight = this.inFlightPerWorker[i] ?? 0
      const fontCount = this.fontsPerWorker[i]?.size ?? 0
      // Prefer fewer in-flight tasks; break ties toward warmer isolates so
      // cold workers are not forced to re-parse large mesh fonts.
      if (
        inFlight < minInFlight ||
        (inFlight === minInFlight && fontCount > minFonts)
      ) {
        minInFlight = inFlight
        minFonts = fontCount
        minIndex = i
      }
    }
    return minIndex
  }
  private sendMessageToAllWorkers<
    TMessage extends WorkerMessageTyped,
    TResponse extends WorkerResponseTyped
  >(message: Omit<TMessage, 'id'>): Promise<NonNullable<TResponse['data']>[]> {
    if (this.terminated)
      return Promise.reject(new Error('Text worker pool is unavailable'))
    return Promise.all(
      this.workers.map((_, index) =>
        this.sendMessageToOneWorker<TMessage, TResponse>(message, index)
      )
    )
  }

  /** Release a transport slot and, if still present, its caller ownership. */
  private finishRequest(id: string) {
    const transport = this.workerRequests.get(id)
    if (transport) {
      clearTimeout(transport.timer)
      this.workerRequests.delete(id)
      const index = transport.workerIndex
      this.inFlightPerWorker[index] = Math.max(
        0,
        (this.inFlightPerWorker[index] ?? 0) - 1
      )
    }
    const pending = this.pendingRequests.get(id)
    if (pending) {
      this.pendingRequests.delete(id)
      pending.cleanup()
    }
    return pending
  }

  private sendMessageToOneWorker<
    TMessage extends WorkerMessageTyped,
    TResponse extends WorkerResponseTyped
  >(
    message: Omit<TMessage, 'id'>,
    workerIndex?: number,
    signal?: AbortSignal
  ): Promise<NonNullable<TResponse['data']>> {
    const index = workerIndex ?? this.pickLeastLoadedWorker()
    const worker = this.workers[index]

    return new Promise((resolve, reject) => {
      checkRenderSignal(signal)
      if (this.terminated || !worker)
        throw new Error('Text worker pool is unavailable')
      const id = `req_${++this.requestId}`
      const fullMessage = { ...message, id } as TMessage
      const abort = () => {
        const owner = this.pendingRequests.get(id)
        if (!owner) return
        this.pendingRequests.delete(id)
        owner.cleanup()
        owner.reject(
          new DOMException('Text rendering was cancelled', 'AbortError')
        )
      }
      this.pendingRequests.set(id, {
        resolve: (value: unknown) =>
          resolve(value as NonNullable<TResponse['data']>),
        reject,
        cleanup: () => signal?.removeEventListener('abort', abort)
      })
      const timer = setTimeout(() => {
        this.finishRequest(id)?.reject(new Error('Worker request timeout'))
      }, this.timeOut)
      this.workerRequests.set(id, { workerIndex: index, timer })
      this.inFlightPerWorker[index] = (this.inFlightPerWorker[index] ?? 0) + 1
      signal?.addEventListener('abort', abort, { once: true })
      try {
        worker.postMessage(fullMessage)
      } catch (error) {
        this.finishRequest(id)?.reject(
          error instanceof Error ? error : new Error(String(error))
        )
      }
    })
  }

  private ensureTasksFinished(): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    if (this.terminated)
      return Promise.reject(new Error('Text worker pool is unavailable'))
    this.readyPromise = this.sendMessageToAllWorkers<
      GetAvailableFontsMessage,
      GetAvailableFontsResponse
    >({
      type: 'getAvailableFonts'
    }).then(() => undefined)
    return this.readyPromise
  }

  /**
   * Set URL to load fonts
   * @param value - URL to load fonts
   */
  async setFontUrl(value: string) {
    await this.sendMessageToAllWorkers<SetFontUrlMessage, SetFontUrlResponse>({
      type: 'setFontUrl',
      data: { url: value }
    })
  }

  /**
   * Syncs the default font fallback chain to all workers.
   */
  async setDefaultFonts(
    fonts: readonly string[],
    symbolFonts: readonly string[]
  ) {
    FontManager.instance.setDefaultFonts(fonts)
    FontManager.instance.setSymbolFonts(symbolFonts)
    await this.sendMessageToAllWorkers<
      SetDefaultFontsMessage,
      SetDefaultFontsResponse
    >({
      type: 'setDefaultFonts',
      data: {
        fonts: [...fonts],
        symbolFonts: [...symbolFonts]
      }
    })
  }

  /**
   * Mirrors {@link FontManager.lazyFontLoading} into every worker isolate.
   */
  async setLazyFontLoading(enabled: boolean): Promise<void> {
    FontManager.instance.lazyFontLoading = enabled
    await this.sendMessageToAllWorkers<
      SetLazyFontLoadingMessage,
      SetLazyFontLoadingResponse
    >({
      type: 'setLazyFontLoading',
      data: { enabled }
    })
  }

  /**
   * Mirrors {@link FontManager.awaitFontsBeforeDraw} into every worker isolate.
   */
  async setAwaitFontsBeforeDraw(enabled: boolean): Promise<void> {
    FontManager.instance.awaitFontsBeforeDraw = enabled
    await this.sendMessageToAllWorkers<
      SetAwaitFontsBeforeDrawMessage,
      SetAwaitFontsBeforeDrawResponse
    >({
      type: 'setAwaitFontsBeforeDraw',
      data: { enabled }
    })
  }

  /**
   * Replaces session-scoped {@link FontManager.missedFonts} on every worker,
   * then adopts the intersection of worker-filtered maps on the main thread.
   *
   * Workers drop faces they have already loaded; in worker-only mode the main
   * isolate often has an empty {@link FontManager.loadedFontMap}, so the
   * authoritative "still missing" set comes from the pool responses.
   */
  async replaceMissedFonts(fonts: Record<string, number>): Promise<void> {
    const results = await this.sendMessageToAllWorkers<
      SetMissedFontsMessage,
      SetMissedFontsResponse
    >({
      type: 'setMissedFonts',
      data: { missedFonts: { ...(fonts ?? {}) } }
    })

    if (results.length === 0) {
      FontManager.instance.replaceMissedFonts(fonts ?? {})
      return
    }

    const intersected: Record<string, number> = {}
    for (const name of Object.keys(results[0]?.missedFonts ?? {})) {
      if (!results.every(r => (r?.missedFonts?.[name] ?? 0) > 0)) {
        continue
      }
      intersected[name] = Math.max(
        ...results.map(r => r?.missedFonts?.[name] ?? 0)
      )
    }
    FontManager.instance.replaceMissedFonts(intersected)
  }

  /** Clears {@link FontManager.missedFonts} on the main thread and every worker. */
  async clearMissedFonts(): Promise<void> {
    await this.replaceMissedFonts({})
  }

  /**
   * Render MText in one worker and return serialized data asynchronously.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    options: TextRenderOptions = {}
  ): Promise<MTextObject> {
    const request = {
      styleManager: options.styleManager ?? this.defaultStyleManager,
      signal: options.signal
    }
    checkRenderSignal(request.signal)
    await awaitRenderWork(this.ensureInitialized(), request.signal)
    checkRenderSignal(request.signal)

    const serialized = await this.sendMessageToOneWorker<
      RenderMessage,
      RenderResponse
    >(
      {
        type: 'render',
        data: { mtextContent, textStyle, colorSettings }
      },
      undefined,
      request.signal
    )

    checkRenderSignal(request.signal)
    if (this.terminated) throw new Error('Text worker pool was terminated')
    return this.reconstructMText(serialized, colorSettings, request)
  }

  /**
   * Render MText synchronously.
   * Notes: It isn't supported yet.
   */
  syncRenderMText(
    _mtextContent: MTextData,
    _textStyle: TextStyle,
    _colorSettings: ColorSettings = createDefaultColorSettings(),
    _options?: TextRenderOptions
  ): MTextObject {
    throw new Error(
      'Fuction \'syncRenderMText\' isn\'t supported in \'WebWorkerRenderer\'!'
    )
  }

  async asyncRenderShape(
    _shapeContent: ShapeData,
    _textStyle: TextStyle,
    _colorSettings: ColorSettings = createDefaultColorSettings(),
    _options?: TextRenderOptions
  ): Promise<MTextObject> {
    throw new Error(
      'Function \'asyncRenderShape\' isn\'t supported in \'WebWorkerRenderer\'!'
    )
  }

  syncRenderShape(
    _shapeContent: ShapeData,
    _textStyle: TextStyle,
    _colorSettings: ColorSettings = createDefaultColorSettings(),
    _options?: TextRenderOptions
  ): MTextObject {
    throw new Error(
      'Function \'syncRenderShape\' isn\'t supported in \'WebWorkerRenderer\'!'
    )
  }

  /**
   * Loads fonts into the worker pool.
   *
   * @param fonts - Logical font names (extensions stripped by workers).
   * @param options.scope - `one` (default) warms a single least-loaded /
   *   already-warm worker so open-time preload does not re-parse large mesh
   *   fonts into every isolate. Pass `all` only when every worker must have
   *   the faces before the first draw (rare; expensive for mesh fonts).
   * @returns Fonts confirmed loaded in the target isolate(s). With
   *   `scope: 'all'`, only faces present in every worker.
   */
  async loadFonts(
    fonts: readonly string[],
    options?: { scope?: 'one' | 'all' }
  ): Promise<{ loaded: string[] }> {
    const requestedFonts = [...fonts]
    const scope = options?.scope ?? 'one'
    await this.ensureTasksFinished()

    if (scope === 'one') {
      const index = this.pickLeastLoadedWorker()
      const result = await this.sendMessageToOneWorker<
        LoadFontsMessage,
        LoadFontsResponse
      >(
        {
          type: 'loadFonts',
          data: { fonts: requestedFonts }
        },
        index
      )
      const loaded = result?.loaded ?? []
      const set = this.fontsPerWorker[index]
      if (set) {
        for (const name of loaded) {
          const key = name.toLowerCase()
          if (key) set.add(key)
        }
      }
      for (const name of loaded) {
        const key = name.toLowerCase()
        if (key) this.poolFontLoadedDispatched.add(key)
      }
      return { loaded: [...loaded] }
    }

    const results = await this.sendMessageToAllWorkers<
      LoadFontsMessage,
      LoadFontsResponse
    >({
      type: 'loadFonts',
      data: { fonts: requestedFonts }
    })

    // Intersection, not union: a partial pool load must not be reported as
    // preloaded everywhere. `[].every(...)` is true, so require results.
    const loadedInAll: string[] = []
    const firstLoaded = results[0]?.loaded ?? []
    if (results.length > 0) {
      for (const name of firstLoaded) {
        const key = name.toLowerCase()
        if (!key) {
          continue
        }
        const presentEverywhere = results.every(r =>
          r?.loaded?.some(loadedName => loadedName.toLowerCase() === key)
        )
        if (presentEverywhere) {
          this.poolFontLoadedDispatched.add(key)
          loadedInAll.push(name)
        }
      }
    }

    return { loaded: loadedInAll }
  }

  async getAvailableFonts(): Promise<{ fonts: Array<{ name: string[] }> }> {
    const results = await this.sendMessageToAllWorkers<
      GetAvailableFontsMessage,
      GetAvailableFontsResponse
    >({
      type: 'getAvailableFonts'
    })

    // All workers return the same result; return the first
    return results[0] ?? { fonts: [] }
  }

  /**
   * Collects memory estimates from each worker in the pool.
   *
   * Worker ids are rewritten to `worker-0`, `worker-1`, … and
   * {@link inFlightPerWorker} counts are attached.
   */
  async estimateMemoryUsage(): Promise<IsolateMemoryStats[]> {
    if (this.workers.length === 0) {
      return []
    }

    const results = await this.sendMessageToAllWorkers<
      GetMemoryStatsMessage,
      GetMemoryStatsResponse
    >({
      type: 'getMemoryStats'
    })

    return results.map((stats, index) => ({
      ...stats,
      id: `worker-${index}`,
      inFlightRequests: this.inFlightPerWorker[index] ?? 0
    }))
  }

  /**
   * Reconstruct MText object from JSON serialized data
   */
  reconstructMText(
    serializedData: SerializedMText,
    colorSettings: ColorSettings,
    options: TextRenderOptions = {}
  ): MTextObject {
    checkRenderSignal(options.signal)
    const styleManager = options.styleManager ?? this.defaultStyleManager
    const baseByLayer = colorSettings.color.aci === 256
    const group = new THREE.Group()

    // Large drawing coordinates live on the root transform; glyph geometry stays local.
    group.position.set(
      serializedData.position.x,
      serializedData.position.y,
      serializedData.position.z
    )
    group.quaternion.set(
      serializedData.rotation.x,
      serializedData.rotation.y,
      serializedData.rotation.z,
      serializedData.rotation.w
    )
    group.scale.set(
      serializedData.scale.x,
      serializedData.scale.y,
      serializedData.scale.z
    )

    // Reconstruct all child objects. Materials stay owned by the supplied manager.
    const geometries: THREE.BufferGeometry[] = []
    try {
      serializedData.children.forEach(childData => {
        checkRenderSignal(options.signal)
        const geometry = new THREE.BufferGeometry()
        geometries.push(geometry)

        // Reconstruct geometry attributes from ArrayBuffers
        Object.keys(childData.geometry.attributes).forEach(key => {
          const attr = childData.geometry.attributes[key]
          // Create a new TypedArray view from the transferred ArrayBuffer
          const typedArray = new Float32Array(
            attr.arrayBuffer,
            attr.byteOffset,
            attr.length
          )

          const bufferAttribute = new THREE.BufferAttribute(
            typedArray,
            attr.itemSize,
            attr.normalized
          )
          geometry.setAttribute(key, bufferAttribute)
        })

        // Reconstruct index if present from ArrayBuffer
        if (childData.geometry.index) {
          const useUint32 = childData.geometry.index.componentType === 'uint32'
          if (useUint32) {
            const indexTypedArray = new Uint32Array(
              childData.geometry.index.arrayBuffer,
              childData.geometry.index.byteOffset,
              childData.geometry.index.length
            )
            geometry.setIndex(
              new THREE.Uint32BufferAttribute(indexTypedArray, 1)
            )
          } else {
            const indexTypedArray = new Uint16Array(
              childData.geometry.index.arrayBuffer,
              childData.geometry.index.byteOffset,
              childData.geometry.index.length
            )
            geometry.setIndex(
              new THREE.Uint16BufferAttribute(indexTypedArray, 1)
            )
          }
        }

        // Create material using StyleManager for proper material reuse
        const materialColorSettings = buildWorkerMaterialColorSettings(
          colorSettings,
          childData.material.color,
          baseByLayer,
          childData.material.mtextColor
        )
        let material: THREE.Material
        if (childData.type === 'mesh') {
          material = styleManager.getMeshBasicMaterial({
            ...materialColorSettings
          })
          // Apply additional properties if they differ from defaults
          if (childData.material.transparent !== undefined) {
            material.transparent = childData.material.transparent
          }
          if (childData.material.opacity !== undefined) {
            material.opacity = childData.material.opacity
          }
          if (childData.material.side !== undefined) {
            material.side = childData.material.side as THREE.Side
          }
        } else {
          material = styleManager.getLineBasicMaterial({
            ...materialColorSettings
          })
          // Apply additional properties if they differ from defaults
          if (childData.material.transparent !== undefined) {
            material.transparent = childData.material.transparent
          }
          if (childData.material.opacity !== undefined) {
            material.opacity = childData.material.opacity
          }
          if (childData.material.linewidth !== undefined) {
            ;(material as THREE.LineBasicMaterial).linewidth =
              childData.material.linewidth
          }
        }

        // Create mesh or line
        let object: THREE.Object3D
        if (childData.type === 'mesh') {
          object = new THREE.Mesh(geometry, material as THREE.MeshBasicMaterial)
        } else {
          object = new THREE.LineSegments(
            geometry,
            material as THREE.LineBasicMaterial
          )
        }

        // Ensure geometry has bounding volumes for correct frustum culling
        // This helps prevent objects from being culled as invisible
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox()
        }
        if (!geometry.boundingSphere) {
          geometry.computeBoundingSphere()
        }

        // Child transforms are local to the MText root group.
        object.position.set(
          childData.position.x,
          childData.position.y,
          childData.position.z
        )

        object.quaternion.set(
          childData.rotation.x,
          childData.rotation.y,
          childData.rotation.z,
          childData.rotation.w
        )

        object.scale.set(
          childData.scale.x,
          childData.scale.y,
          childData.scale.z
        )

        if (childData.charBoxType) {
          object.userData.charBoxType = childData.charBoxType
        }
        if (childData.lineLayouts && childData.lineLayouts.length > 0) {
          object.userData.lineLayouts = childData.lineLayouts.map(line => ({
            y: line.y,
            height: line.height,
            breakIndex: line.breakIndex
          }))
        }
        if (childData.charBoxes && childData.charBoxes.length > 0) {
          object.userData.layout = {
            chars: this.deserializeCharBoxes(childData.charBoxes)
          }
        }
        // Keep segment colour on the reconstructed leaf so cad-viewer can
        // rematerialize entity ACI 7 without wiping true inline `\C` overrides.
        object.userData.mtextColor = materialColorSettings.color

        group.add(object)
      })
      checkRenderSignal(options.signal)
    } catch (error) {
      for (const geometry of geometries) geometry.dispose()
      group.clear()
      throw error
    }

    // Add transformed bounding box property (already in world coordinates)
    ;(group as unknown as MTextObject).box = new THREE.Box3(
      new THREE.Vector3(
        serializedData.box.min.x,
        serializedData.box.min.y,
        serializedData.box.min.z
      ),
      new THREE.Vector3(
        serializedData.box.max.x,
        serializedData.box.max.y,
        serializedData.box.max.z
      )
    )
    const mtextObject = group as unknown as MTextObject
    mtextObject.createLayoutData = () => {
      const cached = group.userData?.layoutCache as MTextLayout | undefined
      if (cached) {
        return cached
      }
      const layout: MTextLayout = { lines: [], chars: [] }
      group.updateWorldMatrix(true, true)
      this.collectLayout(group, layout.chars, layout.lines)
      group.userData.layoutCache = layout
      return layout
    }

    return mtextObject
  }

  private deserializeCharBoxes(serialized: SerializedCharBox[]): CharBox[] {
    return serialized.map(entry => ({
      type: entry.type as CharBox['type'],
      char: entry.char,
      box: new THREE.Box3(
        new THREE.Vector3(entry.box.min.x, entry.box.min.y, entry.box.min.z),
        new THREE.Vector3(entry.box.max.x, entry.box.max.y, entry.box.max.z)
      ),
      children: this.deserializeCharBoxes(entry.children ?? [])
    }))
  }

  private collectLayout(
    object: THREE.Object3D,
    chars: CharBox[],
    lines: LineLayout[]
  ) {
    object.updateWorldMatrix(false, false)

    const objectCharBoxes = object.userData?.layout?.chars as
      | CharBox[]
      | undefined
    const objectLineLayouts = object.userData?.lineLayouts as
      | LineLayout[]
      | undefined
    if (objectLineLayouts && objectLineLayouts.length > 0) {
      objectLineLayouts.forEach(line => {
        tempPoint.set(0, line.y, 0).applyMatrix4(object.matrixWorld)
        tempPoint2
          .set(0, line.y - line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        tempPoint3
          .set(0, line.y + line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        lines.push({
          y: tempPoint.y,
          height: Math.abs(tempPoint3.y - tempPoint2.y),
          breakIndex: line.breakIndex
        })
      })
    }

    if (objectCharBoxes && objectCharBoxes.length > 0) {
      const charBoxType = object.userData?.charBoxType as
        | CharBoxType
        | undefined
      const entries = buildCharBoxesFromObject(
        objectCharBoxes,
        object.matrixWorld,
        charBoxType
      )
      chars.push(...entries)
      return
    }

    if (object instanceof THREE.LineSegments || object instanceof THREE.Mesh) {
      const geometry = object.geometry
      if (!geometry.userData?.isDecoration) {
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox()
        }
        const box = new THREE.Box3().copy(geometry.boundingBox)
        box.applyMatrix4(object.matrixWorld)
        chars.push({
          type: CharBoxType.CHAR,
          box,
          char: '',
          children: []
        })
      }
    }

    const children = object.children
    for (let i = 0, l = children.length; i < l; i++) {
      this.collectLayout(children[i], chars, lines)
    }
  }

  /**
   * Terminate the worker
   */
  terminate() {
    this.terminated = true
    this.workers.forEach(worker => {
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    })
    for (const id of this.workerRequests.keys()) {
      this.finishRequest(id)?.reject(new Error('Renderer terminated'))
    }
    this.workers = []
    this.inFlightPerWorker = []
    this.fontsPerWorker = []
    this.readyPromise = null
    this.poolFontLoadedDispatched.clear()
  }

  destroy(): void {
    this.terminate()
  }
}
