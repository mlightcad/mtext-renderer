import { afterEach, describe, expect, it, vi } from 'vitest'

const workerConstructor = vi.fn()
const workerInstances: MockWorker[] = []

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage = vi.fn()
  terminate = vi.fn()

  constructor(url: string | URL, options?: WorkerOptions) {
    workerConstructor(url, options)
    workerInstances.push(this)
  }
}

vi.stubGlobal('Worker', MockWorker)

import { FontManager } from '../../src/font/fontManager'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  MTextFlowDirection,
  TextStyle
} from '../../src/renderer/types'
import { MainThreadRenderer } from '../../src/worker/mainThreadRenderer'
import { UnifiedRenderer } from '../../src/worker/unifiedRenderer'
import { WebWorkerRenderer } from '../../src/worker/webWorkerRenderer'

const minimalMTextData = {
  text: 'Hello',
  height: 10,
  width: 100,
  position: { x: 0, y: 0, z: 0 },
  attachmentPoint: MTextAttachmentPoint.BaselineLeft,
  drawingDirection: MTextFlowDirection.LEFT_TO_RIGHT
}

const minimalTextStyle: TextStyle = {
  name: 'Standard',
  standardFlag: 0,
  font: 'txt.shx',
  bigFont: '',
  fixedTextHeight: 10,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 10
}

function stubWorkerActivation() {
  const setFontUrl = vi
    .spyOn(WebWorkerRenderer.prototype, 'setFontUrl')
    .mockResolvedValue(undefined)
  const setDefaultFonts = vi
    .spyOn(WebWorkerRenderer.prototype, 'setDefaultFonts')
    .mockResolvedValue(undefined)
  const setLazyFontLoading = vi
    .spyOn(WebWorkerRenderer.prototype, 'setLazyFontLoading')
    .mockResolvedValue(undefined)
  const setAwaitFontsBeforeDraw = vi
    .spyOn(WebWorkerRenderer.prototype, 'setAwaitFontsBeforeDraw')
    .mockResolvedValue(undefined)
  const asyncRenderMText = vi
    .spyOn(WebWorkerRenderer.prototype, 'asyncRenderMText')
    .mockResolvedValue({} as never)
  return {
    setFontUrl,
    setDefaultFonts,
    setLazyFontLoading,
    setAwaitFontsBeforeDraw,
    asyncRenderMText
  }
}

describe('UnifiedRenderer', () => {
  afterEach(() => {
    workerConstructor.mockClear()
    workerInstances.length = 0
    vi.restoreAllMocks()
  })

  it('does not create web workers when default mode is main', () => {
    new UnifiedRenderer('main', { poolSize: 2 })

    expect(workerConstructor).not.toHaveBeenCalled()
  })

  it('creates web workers when default mode is worker', () => {
    new UnifiedRenderer('worker', { poolSize: 2 })

    expect(workerConstructor).toHaveBeenCalledTimes(2)
  })

  it('creates web workers only after switching to worker mode', () => {
    const renderer = new UnifiedRenderer('main', { poolSize: 2 })

    expect(workerConstructor).not.toHaveBeenCalled()

    renderer.setDefaultMode('worker')

    expect(workerConstructor).toHaveBeenCalledTimes(2)
  })

  it('terminateWorkers is a no-op when no workers were created', () => {
    const renderer = new UnifiedRenderer('main', { poolSize: 2 })

    renderer.terminateWorkers()

    expect(workerConstructor).not.toHaveBeenCalled()
  })

  it('terminateWorkers terminates existing workers', () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 2 })

    renderer.terminateWorkers()

    expect(workerInstances).toHaveLength(2)
    for (const worker of workerInstances) {
      expect(worker.terminate).toHaveBeenCalledTimes(1)
    }
  })

  it('recreates workers after terminateWorkers when worker mode is used again', () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 2 })
    expect(workerConstructor).toHaveBeenCalledTimes(2)

    renderer.terminateWorkers()
    renderer.setDefaultMode('main')
    renderer.setDefaultMode('worker')

    expect(workerConstructor).toHaveBeenCalledTimes(4)
  })

  it('destroy terminates workers via terminateWorkers', () => {
    const renderer = new UnifiedRenderer('worker', { poolSize: 2 })

    renderer.destroy()

    expect(workerInstances).toHaveLength(2)
    for (const worker of workerInstances) {
      expect(worker.terminate).toHaveBeenCalledTimes(1)
    }
  })

  it('pushes the main-thread font URL to workers on first render', async () => {
    const spies = stubWorkerActivation()
    vi.spyOn(MainThreadRenderer.prototype, 'setFontUrl').mockImplementation(
      async url => {
        FontManager.instance.baseUrl = url
      }
    )
    const renderer = new UnifiedRenderer('main', { poolSize: 1 })
    await renderer.setFontUrl('https://cdn.example.com/fonts/')

    expect(spies.setFontUrl).not.toHaveBeenCalled()

    renderer.setDefaultMode('worker')
    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(spies.setFontUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/fonts/'
    )
  })

  it('re-pushes the font URL after terminateWorkers recreates the pool', async () => {
    const spies = stubWorkerActivation()
    const renderer = new UnifiedRenderer('worker', { poolSize: 1 })

    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )
    expect(spies.setFontUrl).toHaveBeenCalledTimes(1)

    renderer.terminateWorkers()
    renderer.setDefaultMode('worker')
    await renderer.asyncRenderMText(
      minimalMTextData,
      minimalTextStyle,
      createDefaultColorSettings()
    )

    expect(spies.setFontUrl).toHaveBeenCalledTimes(2)
  })
})
