import { MTextColor } from '@mlightcad/mtext-parser'
import * as THREE from 'three'

import { FontManager } from '../font'
import { buildCharBoxesFromObject } from '../renderer/charBoxUtils'
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
  TextStyle
} from '../renderer/types'
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
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): Promise<MTextObject> {
    await this.ensureInitialized()

    const serialized = await this.sendMessageToOneWorker<
      RenderMessage,
      RenderResponse
    >({
      type: 'render',
      data: { mtextContent, textStyle, colorSettings }
    })

    return this.reconstructMText(serialized, colorSettings)
  }

  /**
   * Render MText synchronously.
   * Notes: It isn't supported yet.
   */
  syncRenderMText(
    _mtextContent: MTextData,
    _textStyle: TextStyle,
    _colorSettings: ColorSettings = createDefaultColorSettings()
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
    colorSettings: ColorSettings
  ): MTextObject {
    const baseByLayer = colorSettings.color.aci === 256
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
        const materialColorSettings = this.buildMaterialColorSettings(
          colorSettings,
          childData.material.color,
          baseByLayer
        )
        material = this.defaultStyleManager.getMeshBasicMaterial({
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
        const materialColorSettings = this.buildMaterialColorSettings(
          colorSettings,
          childData.material.color,
          baseByLayer
        )
        material = this.defaultStyleManager.getLineBasicMaterial({
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

  private buildMaterialColorSettings(
    base: ColorSettings,
    resolvedColor: number,
    baseByLayer: boolean
  ): ColorSettings {
    const color = new MTextColor()
    if (baseByLayer && resolvedColor === base.byLayerColor) {
      color.aci = 256
    } else if (base.color.isAci && base.color.aci !== null) {
      color.aci = base.color.aci
    } else {
      color.rgbValue = resolvedColor
    }

    return {
      byLayerColor: base.byLayerColor,
      byBlockColor: base.byBlockColor,
      layer: base.layer,
      color
    }
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

    if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
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
