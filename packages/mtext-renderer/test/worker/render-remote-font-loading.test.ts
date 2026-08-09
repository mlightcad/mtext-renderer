import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontManager } from '../../src/font/fontManager'
import { DefaultStyleManager } from '../../src/renderer/defaultStyleManager'
import { MText } from '../../src/renderer/mtext'
import { Shape } from '../../src/renderer/shape'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  MTextFlowDirection,
  TextStyle
} from '../../src/renderer/types'
import { MainThreadRenderer } from '../../src/worker/mainThreadRenderer'
import { WebWorkerRenderer } from '../../src/worker/webWorkerRenderer'

const workerInstances: MockWorker[] = []

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage = vi.fn((message: Record<string, unknown>) => {
    queueMicrotask(() => {
      const { type, id, data } = message
      if (type === 'getAvailableFonts') {
        this.onmessage?.({
          data: {
            id,
            type,
            success: true,
            data: { fonts: [] }
          }
        } as MessageEvent)
        return
      }
      if (type === 'loadFonts') {
        this.onmessage?.({
          data: {
            id,
            type,
            success: true,
            data: { loaded: (data as { fonts: string[] }).fonts }
          }
        } as MessageEvent)
        return
      }
      if (
        type === 'setLazyFontLoading' ||
        type === 'setAwaitFontsBeforeDraw'
      ) {
        this.onmessage?.({
          data: {
            id,
            type,
            success: true,
            data: { enabled: (data as { enabled: boolean }).enabled }
          }
        } as MessageEvent)
        return
      }
      if (type === 'setDefaultFonts') {
        this.onmessage?.({
          data: {
            id,
            type,
            success: true,
            data: {
              fonts: (data as { fonts: string[] }).fonts,
              symbolFonts: (data as { symbolFonts: string[] }).symbolFonts
            }
          }
        } as MessageEvent)
        return
      }
      if (type === 'render') {
        this.onmessage?.({
          data: {
            id,
            type,
            success: true,
            data: {
              type: 'MText',
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
              box: {
                min: { x: 0, y: 0, z: 0 },
                max: { x: 0, y: 0, z: 0 }
              },
              children: []
            }
          }
        } as MessageEvent)
      }
    })
  })

  terminate = vi.fn()

  constructor(_url: string | URL, _options?: WorkerOptions) {
    workerInstances.push(this)
  }
}

vi.stubGlobal('Worker', MockWorker)

const minimalMTextData = {
  text: '\\fArial|Hello',
  height: 10,
  width: 100,
  position: { x: 0, y: 0, z: 0 },
  attachmentPoint: MTextAttachmentPoint.BaselineLeft,
  drawingDirection: MTextFlowDirection.BOTTOM_TO_TOP
}

const minimalTextStyle: TextStyle = {
  name: 'Standard',
  standardFlag: 0,
  font: 'txt.shx',
  bigFont: 'hztxt.shx',
  fixedTextHeight: 10,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 10
}

describe('render remote font loading', () => {
  let loadFontsByNames: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    FontManager.instance.release()
    FontManager.instance.lazyFontLoading = true
    FontManager.instance.awaitFontsBeforeDraw = false
    FontManager.instance.defaultFonts = new Set(['simkai'])
    FontManager.instance.symbolFonts = new Set(['amgdt'])
    loadFontsByNames = vi
      .spyOn(FontManager.instance, 'loadFontsByNames')
      .mockResolvedValue([])
    workerInstances.length = 0
  })

  afterEach(() => {
    loadFontsByNames.mockRestore()
    FontManager.instance.lazyFontLoading = true
    FontManager.instance.awaitFontsBeforeDraw = false
    vi.unstubAllGlobals()
    vi.stubGlobal('Worker', MockWorker)
  })

  it('MainThreadRenderer schedules style fonts lazily on first render', async () => {
    const renderer = new MainThreadRenderer()
    const requestFonts = vi.spyOn(FontManager.instance, 'requestFonts')

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(loadFontsByNames).not.toHaveBeenCalledWith(['simkai', 'amgdt'])
    expect(requestFonts).toHaveBeenCalledWith(
      expect.arrayContaining(['arial', 'txt', 'hztxt'])
    )
    requestFonts.mockRestore()
  })

  it('MText.asyncDraw schedules inline/style fonts without awaiting preload', async () => {
    const styleManager = new DefaultStyleManager()
    const requestFonts = vi.spyOn(FontManager.instance, 'requestFonts')
    const mtext = new MText(
      minimalMTextData,
      minimalTextStyle,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    await mtext.asyncDraw()

    expect(requestFonts).toHaveBeenCalledWith(
      expect.arrayContaining(['arial', 'txt', 'hztxt'])
    )
    requestFonts.mockRestore()
  })

  it('MText.asyncDraw awaits loadFontsByNames when lazyFontLoading is false', async () => {
    FontManager.instance.lazyFontLoading = false
    const styleManager = new DefaultStyleManager()
    const requestFonts = vi.spyOn(FontManager.instance, 'requestFonts')
    const mtext = new MText(
      minimalMTextData,
      minimalTextStyle,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    await mtext.asyncDraw()

    expect(requestFonts).not.toHaveBeenCalled()
    expect(loadFontsByNames).toHaveBeenCalledWith(
      expect.arrayContaining(['arial', 'txt', 'hztxt'])
    )
    requestFonts.mockRestore()
  })

  it('MText.asyncDraw awaits requestFonts when awaitFontsBeforeDraw is true', async () => {
    FontManager.instance.awaitFontsBeforeDraw = true
    const styleManager = new DefaultStyleManager()
    let releaseFonts!: () => void
    const fontsReady = new Promise<void>(resolve => {
      releaseFonts = resolve
    })
    const requestFonts = vi
      .spyOn(FontManager.instance, 'requestFonts')
      .mockImplementation(async () => {
        await fontsReady
        return []
      })
    const mtext = new MText(
      minimalMTextData,
      minimalTextStyle,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    let drawSettled = false
    const drawPromise = mtext.asyncDraw().then(() => {
      drawSettled = true
    })

    await Promise.resolve()
    expect(drawSettled).toBe(false)
    expect(requestFonts).toHaveBeenCalledWith(
      expect.arrayContaining(['arial', 'txt', 'hztxt'])
    )

    releaseFonts()
    await drawPromise
    expect(drawSettled).toBe(true)
    requestFonts.mockRestore()
  })

  it('MText.asyncDraw awaits fonts when options.awaitFonts is true', async () => {
    const styleManager = new DefaultStyleManager()
    let releaseFonts!: () => void
    const fontsReady = new Promise<void>(resolve => {
      releaseFonts = resolve
    })
    const requestFonts = vi
      .spyOn(FontManager.instance, 'requestFonts')
      .mockImplementation(async () => {
        await fontsReady
        return []
      })
    const mtext = new MText(
      minimalMTextData,
      minimalTextStyle,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    let drawSettled = false
    const drawPromise = mtext.asyncDraw({ awaitFonts: true }).then(() => {
      drawSettled = true
    })

    await Promise.resolve()
    expect(drawSettled).toBe(false)

    releaseFonts()
    await drawPromise
    expect(drawSettled).toBe(true)
    requestFonts.mockRestore()
  })

  it('MText.asyncDraw still requests style fonts after an empty first draw', async () => {
    const styleManager = new DefaultStyleManager()
    const requestFonts = vi.spyOn(FontManager.instance, 'requestFonts')
    const style: TextStyle = {
      ...minimalTextStyle,
      font: '',
      bigFont: '',
      extendedFont: ''
    }
    const mtext = new MText(
      {
        ...minimalMTextData,
        text: ''
      },
      style,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    await mtext.asyncDraw()
    expect(requestFonts).not.toHaveBeenCalled()

    style.font = 'txt.shx'
    style.bigFont = 'hztxt.shx'
    await mtext.asyncDraw()

    expect(requestFonts).toHaveBeenCalledWith(
      expect.arrayContaining(['txt', 'hztxt'])
    )
    requestFonts.mockRestore()
  })

  it('Shape.asyncDraw still requests style fonts after an empty first draw', async () => {
    const styleManager = new DefaultStyleManager()
    const requestFonts = vi.spyOn(FontManager.instance, 'requestFonts')
    const style: TextStyle = {
      ...minimalTextStyle,
      font: '',
      bigFont: '',
      extendedFont: ''
    }
    const shape = new Shape(
      {
        shapeNumber: 128,
        size: 24,
        widthFactor: 1,
        rotation: 0,
        position: { x: 0, y: 0, z: 0 }
      },
      style,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    await shape.asyncDraw()
    expect(requestFonts).not.toHaveBeenCalled()

    style.font = 'complex.shx'
    await shape.asyncDraw()

    expect(requestFonts).toHaveBeenCalledWith(
      expect.arrayContaining(['complex'])
    )
    requestFonts.mockRestore()
  })

  it('glyph fallback does not trigger remote font loading', () => {
    const manager = FontManager.instance as any
    const primary = {
      names: new Set(['primary']),
      getCharShape: vi.fn().mockReturnValue(undefined),
      dispose: vi.fn()
    }
    const fallback = {
      names: new Set(['simkai']),
      getCharShape: vi.fn().mockReturnValue(undefined),
      dispose: vi.fn()
    }
    manager.loadedFontMap.set('primary', primary)
    manager.loadedFontMap.set('simkai', fallback)

    expect(
      FontManager.instance.getCharShapeFromDefaults('中', 10)
    ).toBeUndefined()
    expect(loadFontsByNames).not.toHaveBeenCalled()
  })

  it('WebWorkerRenderer does not preload default fonts on first render', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 5000 })

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    const loadFontsMessages = workerInstances[0].postMessage.mock.calls.filter(
      ([message]) => (message as { type?: string }).type === 'loadFonts'
    )
    expect(loadFontsMessages).toHaveLength(0)

    renderer.destroy()
  })

  it('MainThreadRenderer preloads default fonts when lazyFontLoading is false', async () => {
    FontManager.instance.lazyFontLoading = false
    const renderer = new MainThreadRenderer()

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(loadFontsByNames).toHaveBeenCalledWith(['simkai', 'amgdt'])
  })

  it('WebWorkerRenderer preloads default fonts when lazyFontLoading is false', async () => {
    FontManager.instance.lazyFontLoading = false
    const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 5000 })

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    const loadFontsMessages = workerInstances[0].postMessage.mock.calls.filter(
      ([message]) => (message as { type?: string }).type === 'loadFonts'
    )
    expect(loadFontsMessages.length).toBeGreaterThan(0)
    expect(loadFontsMessages[0][0]).toEqual(
      expect.objectContaining({
        type: 'loadFonts',
        data: { fonts: ['simkai', 'amgdt'] }
      })
    )

    renderer.destroy()
  })

  it('WebWorkerRenderer does not dispatch fontLoaded when pool sync reports empty loaded', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 5000 })
    const listener = vi.fn()
    FontManager.instance.events.fontLoaded.addEventListener(listener)

    // Override MockWorker so loadFonts returns no successfully loaded faces.
    workerInstances[0].postMessage = vi.fn((message: Record<string, unknown>) => {
      queueMicrotask(() => {
        const { type, id } = message
        if (type === 'loadFonts') {
          workerInstances[0].onmessage?.({
            data: {
              id,
              type,
              success: true,
              data: { loaded: [] }
            }
          } as MessageEvent)
          return
        }
      })
    })

    workerInstances[0].onmessage?.({
      data: {
        id: '',
        type: 'fontLoaded',
        success: true,
        data: { fontName: 'missing-face' }
      }
    } as MessageEvent)

    await new Promise(resolve => setTimeout(resolve, 30))
    expect(listener).not.toHaveBeenCalled()

    FontManager.instance.events.fontLoaded.removeEventListener(listener)
    renderer.destroy()
  })

  it('WebWorkerRenderer forwards worker fontLoaded to main FontManager', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 1, timeOut: 5000 })
    const listener = vi.fn()
    FontManager.instance.events.fontLoaded.addEventListener(listener)

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    workerInstances[0].onmessage?.({
      data: {
        id: '',
        type: 'fontLoaded',
        success: true,
        data: { fontName: 'hztxt' }
      }
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({ fontName: 'hztxt' })
    })
    FontManager.instance.events.fontLoaded.removeEventListener(listener)
    renderer.destroy()
  })

  it('WebWorkerRenderer syncs lazy fontLoaded into every worker before dispatch', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 2, timeOut: 5000 })
    const listener = vi.fn()
    FontManager.instance.events.fontLoaded.addEventListener(listener)

    workerInstances[0].onmessage?.({
      data: {
        id: '',
        type: 'fontLoaded',
        success: true,
        data: { fontName: 'simkai' }
      }
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({ fontName: 'simkai' })
    })

    for (const worker of workerInstances) {
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'loadFonts',
          data: { fonts: ['simkai'] }
        })
      )
    }

    FontManager.instance.events.fontLoaded.removeEventListener(listener)
    renderer.destroy()
  })

  it('WebWorkerRenderer setLazyFontLoading mirrors flag to all workers', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 2, timeOut: 5000 })

    await renderer.setLazyFontLoading(false)

    expect(FontManager.instance.lazyFontLoading).toBe(false)
    for (const worker of workerInstances) {
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'setLazyFontLoading',
          data: { enabled: false }
        })
      )
    }

    await renderer.setLazyFontLoading(true)
    renderer.destroy()
  })

  it('WebWorkerRenderer setAwaitFontsBeforeDraw mirrors flag to all workers', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 2, timeOut: 5000 })

    await renderer.setAwaitFontsBeforeDraw(true)

    expect(FontManager.instance.awaitFontsBeforeDraw).toBe(true)
    for (const worker of workerInstances) {
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'setAwaitFontsBeforeDraw',
          data: { enabled: true }
        })
      )
    }

    await renderer.setAwaitFontsBeforeDraw(false)
    renderer.destroy()
  })

  it('WebWorkerRenderer loadFonts delegates font names to all workers', async () => {
    const renderer = new WebWorkerRenderer({ poolSize: 2, timeOut: 5000 })

    await renderer.loadFonts(['txt', 'hztxt'])

    for (const worker of workerInstances) {
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'loadFonts',
          data: { fonts: ['txt', 'hztxt'] }
        })
      )
    }

    renderer.destroy()
  })
})
