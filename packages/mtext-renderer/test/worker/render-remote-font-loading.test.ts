import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontManager } from '../../src/font/fontManager'
import { DefaultStyleManager } from '../../src/renderer/defaultStyleManager'
import { MText } from '../../src/renderer/mtext'
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
    FontManager.instance.defaultFonts = new Set(['simkai'])
    FontManager.instance.symbolFonts = new Set(['amgdt'])
    loadFontsByNames = vi
      .spyOn(FontManager.instance, 'loadFontsByNames')
      .mockResolvedValue([])
    workerInstances.length = 0
  })

  afterEach(() => {
    loadFontsByNames.mockRestore()
    vi.unstubAllGlobals()
    vi.stubGlobal('Worker', MockWorker)
  })

  it('MainThreadRenderer loads default and symbol fonts before the first render', async () => {
    const renderer = new MainThreadRenderer()

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(loadFontsByNames).toHaveBeenCalledWith(['simkai', 'amgdt'])
  })

  it('MainThreadRenderer does not reload default fonts on subsequent renders', async () => {
    const renderer = new MainThreadRenderer()

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )
    loadFontsByNames.mockClear()

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(loadFontsByNames).not.toHaveBeenCalledWith(['simkai', 'amgdt'])
  })

  it('MText.asyncDraw collects inline/style fonts and requests loadFontsByNames before parse', async () => {
    const styleManager = new DefaultStyleManager()
    const mtext = new MText(
      minimalMTextData,
      minimalTextStyle,
      styleManager,
      FontManager.instance,
      createDefaultColorSettings()
    )

    await mtext.asyncDraw()

    // arial/txt/hztxt are not defaultFonts; loadFontsByNames still receives them so
    // DefaultFontLoader can download any match from the remote font repository.
    expect(loadFontsByNames).toHaveBeenCalledWith(
      expect.arrayContaining(['arial', 'txt', 'hztxt'])
    )
  })

  it('glyph fallback does not trigger remote font loading', () => {
    const manager = FontManager.instance as any
    const primary = {
      names: new Set(['primary']),
      getCharShape: vi.fn().mockReturnValue(undefined)
    }
    const fallback = {
      names: new Set(['simkai']),
      getCharShape: vi.fn().mockReturnValue(undefined)
    }
    manager.loadedFontMap.set('primary', primary)
    manager.loadedFontMap.set('simkai', fallback)

    expect(
      FontManager.instance.getCharShapeFromDefaults('中', 10)
    ).toBeUndefined()
    expect(loadFontsByNames).not.toHaveBeenCalled()
  })

  it('WebWorkerRenderer asks workers to load default fonts on first render', async () => {
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
    expect(loadFontsMessages[0]?.[0]).toMatchObject({
      type: 'loadFonts',
      data: { fonts: ['simkai', 'amgdt'] }
    })

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
