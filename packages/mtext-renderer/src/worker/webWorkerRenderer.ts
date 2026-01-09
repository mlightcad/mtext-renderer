import * as THREE from 'three'

import { FontManager } from '../font'
import { DefaultStyleManager } from '../renderer/defaultStyleManager'
import { StyleManager } from '../renderer/styleManager'
import { ColorSettings, MTextData, TextStyle } from '../renderer/types'
import { MTextBaseRenderer, MTextObject } from './baseRenderer'

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
  workerUrl?: string

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

type WorkerMessageTyped =
  | RenderMessage
  | LoadFontsMessage
  | SetFontUrlMessage
  | GetAvailableFontsMessage

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

type WorkerResponseTyped =
  | RenderResponse
  | LoadFontsResponse
  | SetFontUrlResponse
  | GetAvailableFontsResponse

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
  }
}

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
      workerIndex: number
    }
  > = new Map()
  private requestId = 0
  private poolSize: number
  private timeOut: number
  private readyPromise: Promise<void> | null = null
  private isInitialized: boolean
  private defaultStyleManager: StyleManager

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
    }

    this.isInitialized = false
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

  private async ensureInitialized() {
    if (!this.isInitialized) {
      // Guarantee the default font is loaded
      await this.loadFonts([FontManager.instance.defaultFont])
      this.isInitialized = true
    }
  }

  /**
   * Handles messages coming from any worker.
   */
  private handleWorkerMessage(
    response: WorkerResponseTyped,
    workerIndex: number
  ) {
    const { id, success, data, error } = response
    const pendingRequest = this.pendingRequests.get(id)

    if (pendingRequest) {
      this.pendingRequests.delete(id)
      this.inFlightPerWorker[workerIndex] = Math.max(
        0,
        this.inFlightPerWorker[workerIndex] - 1
      )

      if (success) {
        pendingRequest.resolve(data)
      } else {
        pendingRequest.reject(new Error(error || 'Unknown worker error'))
      }
    } else {
      console.warn(`No pending request found for worker response id=${id}`)
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
      this.pendingRequests.forEach((pending, key) => {
        if (pending.workerIndex === index) idsToReject.push(key)
      })

      idsToReject.forEach(id => {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          pending.reject(new Error('Worker error occurred'))
          this.pendingRequests.delete(id)
        }
      })

      this.inFlightPerWorker[index] = 0
    }
  }
  private pickLeastLoadedWorker(): number {
    let minIndex = 0
    let minValue = this.inFlightPerWorker[0] ?? 0
    for (let i = 1; i < this.inFlightPerWorker.length; i++) {
      const value = this.inFlightPerWorker[i] ?? 0
      if (value < minValue) {
        minValue = value
        minIndex = i
      }
    }
    return minIndex
  }
  private sendMessageToAllWorkers<
    TMessage extends WorkerMessageTyped,
    TResponse extends WorkerResponseTyped
  >(message: Omit<TMessage, 'id'>): Promise<NonNullable<TResponse['data']>[]> {
    return Promise.all(
      this.workers.map((_, index) =>
        this.sendMessageToOneWorker<TMessage, TResponse>(message, index)
      )
    )
  }

  private sendMessageToOneWorker<
    TMessage extends WorkerMessageTyped,
    TResponse extends WorkerResponseTyped
  >(
    message: Omit<TMessage, 'id'>,
    workerIndex?: number
  ): Promise<NonNullable<TResponse['data']>> {
    const index = workerIndex ?? this.pickLeastLoadedWorker()
    const worker = this.workers[index]

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestId}`
      const fullMessage = { ...message, id } as TMessage

      this.pendingRequests.set(id, {
        resolve: (value: unknown) =>
          resolve(value as NonNullable<TResponse['data']>),
        reject,
        workerIndex: index
      })

      this.inFlightPerWorker[index] = (this.inFlightPerWorker[index] ?? 0) + 1
      worker.postMessage(fullMessage)

      setTimeout(() => {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          this.pendingRequests.delete(id)
          this.inFlightPerWorker[index] = Math.max(
            0,
            this.inFlightPerWorker[index] - 1
          )
          reject(new Error('Worker request timeout'))
        }
      }, this.timeOut)
    })
  }

  private ensureTasksFinished(): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    if (this.workers.length === 0) return Promise.resolve()

    this.readyPromise = Promise.all(
      this.workers.map(
        (worker, index) =>
          new Promise<void>((resolve, reject) => {
            const id = `req_${++this.requestId}`
            this.pendingRequests.set(id, {
              resolve: () => resolve(),
              reject,
              workerIndex: index
            })
            this.inFlightPerWorker[index] =
              (this.inFlightPerWorker[index] ?? 0) + 1
            worker.postMessage({ type: 'getAvailableFonts', id })
            setTimeout(() => {
              const pending = this.pendingRequests.get(id)
              if (pending) {
                this.pendingRequests.delete(id)
                this.inFlightPerWorker[index] = Math.max(
                  0,
                  this.inFlightPerWorker[index] - 1
                )
                reject(new Error('Worker init timeout'))
              }
            }, this.timeOut)
          })
      )
    ).then(() => undefined)

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
   * Render MText in one worker and return serialized data asynchronously.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = {
      byLayerColor: 0xffffff,
      byBlockColor: 0xffffff
    }
  ): Promise<MTextObject> {
    await this.ensureInitialized()

    const serialized = await this.sendMessageToOneWorker<
      RenderMessage,
      RenderResponse
    >({
      type: 'render',
      data: { mtextContent, textStyle, colorSettings }
    })

    return this.reconstructMText(serialized, textStyle)
  }

  /**
   * Render MText synchronously.
   * Notes: It isn't supported yet.
   */
  syncRenderMText(
    _mtextContent: MTextData,
    _textStyle: TextStyle,
    _colorSettings: ColorSettings = {
      byLayerColor: 0xffffff,
      byBlockColor: 0xffffff
    }
  ): MTextObject {
    throw new Error(
      'Fuction \'syncRenderMText\' isn\'t supported in \'WebWorkerRenderer\'!'
    )
  }

  async loadFonts(fonts: string[]): Promise<{ loaded: string[] }> {
    await this.ensureTasksFinished()

    const results = await this.sendMessageToAllWorkers<
      LoadFontsMessage,
      LoadFontsResponse
    >({
      type: 'loadFonts',
      data: { fonts }
    })

    const aggregated = new Set<string>()
    results.forEach(r => r?.loaded?.forEach(f => aggregated.add(f)))

    return { loaded: Array.from(aggregated) }
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
   * Reconstruct MText object from JSON serialized data
   */
  reconstructMText(
    serializedData: SerializedMText,
    textStyle: TextStyle
  ): MTextObject {
    const group = new THREE.Group()

    // Reconstruct all child objects
    serializedData.children.forEach(childData => {
      const geometry = new THREE.BufferGeometry()

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
          geometry.setIndex(new THREE.Uint32BufferAttribute(indexTypedArray, 1))
        } else {
          const indexTypedArray = new Uint16Array(
            childData.geometry.index.arrayBuffer,
            childData.geometry.index.byteOffset,
            childData.geometry.index.length
          )
          geometry.setIndex(new THREE.Uint16BufferAttribute(indexTypedArray, 1))
        }
      }

      // Create material using StyleManager for proper material reuse
      let material: THREE.Material
      if (childData.type === 'mesh') {
        material = this.defaultStyleManager.getMeshBasicMaterial({
          layer: textStyle.layer,
          isByLayer: textStyle.isByLayer,
          color: childData.material.color
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
        material = this.defaultStyleManager.getLineBasicMaterial({
          layer: textStyle.layer,
          isByLayer: textStyle.isByLayer,
          color: childData.material.color
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

      // Set position, rotation, and scale directly (already in world coordinates)
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

      object.scale.set(childData.scale.x, childData.scale.y, childData.scale.z)

      group.add(object)
    })

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

    return group as unknown as MTextObject
  }

  /**
   * Terminate the worker
   */
  terminate() {
    this.workers.forEach(w => w.terminate())
    this.workers = []
    this.inFlightPerWorker = []
    this.readyPromise = null
    // Reject any remaining pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Renderer terminated'))
    })
    this.pendingRequests.clear()
  }

  destroy(): void {
    this.terminate()
  }
}
