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

import { UnifiedRenderer } from '../../src/worker/unifiedRenderer'

describe('UnifiedRenderer', () => {
  afterEach(() => {
    workerConstructor.mockClear()
    workerInstances.length = 0
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
})
