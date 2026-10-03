import { ShxFont as ParsedShxFont, ShxFontType } from '@mlightcad/shx-parser'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { disposeRenderGeometry } from '../../src/common/renderRequest'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import type { StyleManager } from '../../src/renderer/styleManager'
import {
  MTextAttachmentPoint,
  MTextFlowDirection,
  type ShapeData,
  type TextStyle
} from '../../src/renderer/types'
import { MainThreadRenderer } from '../../src/worker/mainThreadRenderer'
import { UnifiedRenderer } from '../../src/worker/unifiedRenderer'
import { WebWorkerRenderer } from '../../src/worker/webWorkerRenderer'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}

const text = {
  text: 'A',
  height: 10,
  width: 100,
  position: { x: 0, y: 0, z: 0 },
  attachmentPoint: MTextAttachmentPoint.BaselineLeft,
  drawingDirection: MTextFlowDirection.LEFT_TO_RIGHT
}
const style: TextStyle = {
  name: 'Standard',
  standardFlag: 0,
  font: 'request-test',
  bigFont: '',
  fixedTextHeight: 10,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 10
}
const shape: ShapeData = {
  shapeNumber: 65,
  size: 10,
  position: { x: 0, y: 0, z: 0 }
}

function materials(color: number) {
  const mesh = new THREE.MeshBasicMaterial({ color })
  const line = new THREE.LineBasicMaterial({ color })
  const owner = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi.fn(() => mesh),
    getLineBasicMaterial: vi.fn(() => line)
  } satisfies StyleManager
  return { ...owner, mesh, line }
}

function materialColors(object: THREE.Object3D) {
  const colors: number[] = []
  object.traverse(child => {
    const material = (child as THREE.Mesh).material
    if (!material) return
    for (const entry of Array.isArray(material) ? material : [material]) {
      colors.push((entry as THREE.MeshBasicMaterial).color.getHex())
    }
  })
  return colors
}

function serializedText() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  return {
    type: 'MText',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } },
    children: [
      {
        type: 'mesh',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
        geometry: {
          attributes: {
            position: {
              arrayBuffer: positions.buffer,
              byteOffset: 0,
              length: positions.length,
              itemSize: 3,
              normalized: false
            }
          },
          index: null
        },
        material: { type: 'MeshBasicMaterial', color: 0xffffff }
      }
    ]
  }
}

type Message = { type: string; id: string; data?: Record<string, unknown> }
const workers: TransportWorker[] = []
class TransportWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  renders: Message[] = []
  holdConfig = false
  configs: Message[] = []
  throwOnRender = false
  terminate = vi.fn()
  postMessage = vi.fn((message: Message) => {
    if (message.type === 'render') {
      if (this.throwOnRender) throw new Error('post failed')
      this.renders.push(message)
    } else if (this.holdConfig) {
      this.configs.push(message)
    } else {
      queueMicrotask(() =>
        this.reply(
          message,
          message.type === 'loadFonts'
            ? { loaded: message.data?.fonts ?? [] }
            : { fonts: [] }
        )
      )
    }
  })
  constructor() {
    workers.push(this)
  }
  reply(message: Message, data: unknown = serializedText()) {
    this.onmessage?.({
      data: { id: message.id, type: message.type, success: true, data }
    } as MessageEvent)
  }
}

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await Promise.resolve()
  }
  throw new Error('Expected bounded renderer progress')
}

beforeEach(() => {
  vi.useFakeTimers()
  workers.length = 0
  vi.stubGlobal('Worker', TransportWorker)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Tests must remain offline')
    })
  )
  const fonts = FontManager.instance
  fonts.lazyFontLoading = true
  fonts.awaitFontsBeforeDraw = true
  vi.spyOn(fonts, 'getAvailableFonts').mockResolvedValue([])
  vi.spyOn(fonts, 'getFontsToLoad').mockReturnValue([])
  vi.spyOn(fonts, 'requestFonts').mockResolvedValue([])
  // Tiny authored SHX stroke, used by the actual MText/Shape geometry pipeline.
  const parsed = new ParsedShxFont({
    header: {
      fontType: ShxFontType.SHAPES,
      fileHeader: 'AutoCAD-86 shapes V1.0',
      fileVersion: '1.0'
    },
    content: {
      data: { 65: new Uint8Array([65, 0, 0x01, 0x80, 0x02, 0x00]) },
      names: { A: 65 },
      info: '',
      orientation: 'horizontal',
      baseUp: 8,
      baseDown: 2,
      height: 10,
      width: 10,
      isExtended: false
    }
  })
  fonts.loadedFontMap.set(
    'request-test',
    FontFactory.instance.createFont({
      name: 'request-test',
      alias: ['request-test'],
      type: 'shx',
      data: parsed.fontData
    })
  )
})
afterEach(() => {
  FontManager.instance.loadedFontMap.delete('request-test')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('request-owned text rendering', () => {
  it('captures separate material owners before overlapping worker activation and reversed responses', async () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 1 })
    const a = materials(0xff0000),
      b = materials(0x0000ff),
      other = materials(0x00ff00)
    renderer.setStyleManager(a)
    const first = renderer.asyncRenderMText(text, style)
    renderer.setStyleManager(other)
    const second = renderer.asyncRenderMText(text, style, undefined, 'worker', {
      styleManager: b
    })
    await until(() => workers[0].renders.length === 2)
    expect(
      workers[0].postMessage.mock.calls.filter(
        ([m]) => m.type === 'setDefaultFonts'
      )
    ).toHaveLength(1)
    workers[0].reply(workers[0].renders[1])
    workers[0].reply(workers[0].renders[0])
    const [one, two] = await Promise.all([first, second])
    expect(materialColors(one)).toEqual([0xff0000])
    expect(materialColors(two)).toEqual([0x0000ff])
    expect(other.getMeshBasicMaterial).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    disposeRenderGeometry(one)
    disposeRenderGeometry(two)
    renderer.destroy()
  })

  it('cancels one owner promptly without freeing its busy worker or reconstructing a late reply', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 2 })
    const controller = new AbortController(),
      a = materials(0xff0000),
      b = materials(0x0000ff)
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const first = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: a,
      signal: controller.signal
    })
    await until(() => workers[0].renders.length === 1)
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    const second = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: b
    })
    await until(() => workers[1].renders.length === 1)
    workers[0].reply(workers[0].renders[0])
    workers[1].reply(workers[1].renders[0])
    const result = await second
    expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
    expect(materialColors(result)).toEqual([0x0000ff])
    expect(
      workers.every(worker => worker.terminate.mock.calls.length === 0)
    ).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    disposeRenderGeometry(result)
    renderer.destroy()
  })

  it('does not reconstruct when cancellation follows the worker response before its promise continuation', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 1 }),
      a = materials(0xff0000)
    const controller = new AbortController()
    const pending = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: a,
      signal: controller.signal
    })
    await until(() => workers[0].renders.length === 1)
    workers[0].reply(workers[0].renders[0])
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    renderer.destroy()
  })

  it.each(['timeout', 'error', 'post', 'terminate'] as const)(
    'cleans pending ownership and transport timers after %s',
    async failure => {
      const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 10 })
      workers[0].throwOnRender = failure === 'post'
      const controller = new AbortController(),
        a = materials(0xff0000)
      const remove = vi.spyOn(controller.signal, 'removeEventListener')
      const pending = renderer.asyncRenderMText(text, style, undefined, {
        styleManager: a,
        signal: controller.signal
      })
      const rejected = expect(pending).rejects.toBeInstanceOf(Error)
      if (failure !== 'post') await until(() => workers[0].renders.length === 1)
      if (failure === 'timeout') await vi.advanceTimersByTimeAsync(10)
      if (failure === 'error') {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        workers[0].onerror?.({ message: 'failure' } as ErrorEvent)
      }
      if (failure === 'terminate') renderer.terminate()
      await rejected
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)
      expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
      renderer.destroy()
    }
  )

  it('rejects activation retired by worker termination and allows a later fresh pool', async () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 1 })
    workers[0].holdConfig = true
    const first = renderer.asyncRenderMText(text, style)
    const rejected = expect(first).rejects.toBeInstanceOf(Error)
    renderer.terminateWorkers()
    await rejected
    expect(workers[0].renders).toHaveLength(0)
    const second = renderer.asyncRenderMText(text, style)
    await until(() => workers[1]?.renders.length === 1)
    workers[1].reply(workers[1].renders[0])
    disposeRenderGeometry(await second)
    renderer.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels while shared activation is pending without stopping another request', async () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 1 })
    workers[0].holdConfig = true
    const controller = new AbortController(),
      a = materials(0xff0000),
      b = materials(0x0000ff)
    const first = renderer.asyncRenderMText(text, style, undefined, 'worker', {
      styleManager: a,
      signal: controller.signal
    })
    const second = renderer.asyncRenderMText(text, style, undefined, 'worker', {
      styleManager: b
    })
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    workers[0].holdConfig = false
    workers[0].reply(workers[0].configs[0], {})
    await until(() => workers[0].renders.length === 1)
    workers[0].reply(workers[0].renders[0])
    const result = await second
    expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
    expect(materialColors(result)).toEqual([0x0000ff])
    disposeRenderGeometry(result)
    renderer.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['text', 'shape'] as const)(
    'preserves captured main-thread %s materials across asynchronous font waits',
    async kind => {
      const gate = deferred<string[]>()
      vi.mocked(FontManager.instance.requestFonts).mockReturnValue(gate.promise)
      const renderer = new MainThreadRenderer(),
        a = materials(0xff0000),
        b = materials(0x0000ff)
      renderer.styleManager = a
      const first =
        kind === 'text'
          ? renderer.asyncRenderMText(text, style)
          : renderer.asyncRenderShape(shape, style)
      renderer.styleManager = b
      gate.resolve([])
      const result = await first
      expect(materialColors(result)).toContain(0xff0000)
      expect(b.getLineBasicMaterial).not.toHaveBeenCalled()
      disposeRenderGeometry(result)
    }
  )

  it.each(['text', 'shape'] as const)(
    'cancels main-thread %s before font completion and material construction',
    async kind => {
      const gate = deferred<string[]>()
      vi.mocked(FontManager.instance.requestFonts).mockReturnValue(gate.promise)
      const renderer = new MainThreadRenderer(),
        a = materials(0xff0000),
        controller = new AbortController()
      const options = { styleManager: a, signal: controller.signal }
      const pending =
        kind === 'text'
          ? renderer.asyncRenderMText(text, style, undefined, options)
          : renderer.asyncRenderShape(shape, style, undefined, options)
      await until(
        () => vi.mocked(FontManager.instance.requestFonts).mock.calls.length > 0
      )
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      gate.resolve([])
      await Promise.resolve()
      await Promise.resolve()
      expect(a.getLineBasicMaterial).not.toHaveBeenCalled()
      expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
    }
  )

  it('cancels a main-thread catalog wait before constructing geometry and keeps shared initialization reusable', async () => {
    const catalog = deferred<never[]>()
    vi.mocked(FontManager.instance.getAvailableFonts).mockReturnValue(
      catalog.promise
    )
    const renderer = new MainThreadRenderer(),
      a = materials(0xff0000),
      b = materials(0x0000ff)
    const controller = new AbortController()
    const first = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: a,
      signal: controller.signal
    })
    const second = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: b
    })
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    catalog.resolve([])
    const result = await second
    expect(FontManager.instance.getAvailableFonts).toHaveBeenCalledTimes(1)
    expect(a.getLineBasicMaterial).not.toHaveBeenCalled()
    expect(materialColors(result)).toContain(0x0000ff)
    disposeRenderGeometry(result)
  })

  it('releases unpublished geometry when abort wins after drawing without disposing reusable materials', async () => {
    const renderer = new MainThreadRenderer(),
      a = materials(0xff0000),
      controller = new AbortController()
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const disposeMaterial = vi.spyOn(a.line, 'dispose')
    a.getLineBasicMaterial.mockImplementation(() => {
      queueMicrotask(() => controller.abort())
      return a.line
    })
    const pending = renderer.asyncRenderShape(shape, style, undefined, {
      styleManager: a,
      signal: controller.signal
    })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(disposeGeometry).toHaveBeenCalled()
    expect(disposeMaterial).not.toHaveBeenCalled()
  })

  it('shares worker activation between font preload and rendering', async () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 1 })
    const preload = renderer.loadFonts(['request-test'], { scope: 'all' })
    const drawing = renderer.asyncRenderMText(text, style)
    await until(() => workers[0].renders.length === 1)
    workers[0].reply(workers[0].renders[0])
    expect(await preload).toEqual({ loaded: ['request-test'] })
    disposeRenderGeometry(await drawing)
    expect(
      workers[0].postMessage.mock.calls.filter(
        ([message]) => message.type === 'setDefaultFonts'
      )
    ).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    renderer.destroy()
  })

  it('snapshots requested faces and all-worker coverage before activation awaits', async () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 2 })
    const fonts = ['original']
    const options: { scope: 'one' | 'all' } = { scope: 'all' }
    const loading = renderer.loadFonts(fonts, options)
    fonts[0] = 'changed'
    options.scope = 'one'
    expect(await loading).toEqual({ loaded: ['original'] })
    for (const worker of workers) {
      expect(
        worker.postMessage.mock.calls.filter(
          ([message]) => message.type === 'loadFonts'
        )
      ).toEqual([[expect.objectContaining({ data: { fonts: ['original'] } })]])
    }
    expect(vi.getTimerCount()).toBe(0)
    renderer.destroy()
  })

  it('expires cancelled transport accounting without retaining a caller or timer indefinitely', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 10 }),
      a = materials(0xff0000)
    const controller = new AbortController()
    const pending = renderer.asyncRenderMText(text, style, undefined, {
      styleManager: a,
      signal: controller.signal
    })
    await until(() => workers[0].renders.length === 1)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(vi.getTimerCount()).toBe(0)
    workers[0].reply(workers[0].renders[0])
    expect(a.getMeshBasicMaterial).not.toHaveBeenCalled()
    renderer.destroy()
  })

  it.each(['main', 'worker'] as const)(
    'rejects pre-aborted %s requests before font loading or dispatch',
    async mode => {
      const renderer = new UnifiedRenderer(mode, { poolSize: 1 })
      const controller = new AbortController()
      controller.abort()
      await expect(
        renderer.asyncRenderMText(text, style, undefined, mode, {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(FontManager.instance.getAvailableFonts).not.toHaveBeenCalled()
      expect(
        workers.every(worker => worker.postMessage.mock.calls.length === 0)
      ).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      renderer.destroy()
    }
  )

  it('honors per-request sync text and shape styles and pre-aborted requests', () => {
    const renderer = new UnifiedRenderer('main'),
      a = materials(0xff0000),
      b = materials(0x0000ff)
    const textObject = renderer.syncRenderMText(text, style, undefined, {
      styleManager: a
    })
    const shapeObject = renderer.syncRenderShape(shape, style, undefined, {
      styleManager: b
    })
    expect(materialColors(textObject)).toContain(0xff0000)
    expect(materialColors(shapeObject)).toContain(0x0000ff)
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      renderer.syncRenderMText(text, style, undefined, {
        signal: controller.signal
      })
    ).toThrowError(expect.objectContaining({ name: 'AbortError' }))
    disposeRenderGeometry(textObject)
    disposeRenderGeometry(shapeObject)
    renderer.destroy()
  })
})
