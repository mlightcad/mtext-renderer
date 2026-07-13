import { describe, expect, it } from 'vitest'

import { formatMemoryUsageReport } from '../../src/memory/formatMemoryUsageReport'
import type { MemoryUsageReport } from '../../src/memory/types'

function makeReport(
  overrides: Partial<MemoryUsageReport> = {}
): MemoryUsageReport {
  return {
    collectedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    totalEstimatedBytes: 4096,
    mainThread: {
      id: 'main',
      fonts: [],
      materials: { meshCount: 0, lineCount: 0, estimatedBytes: 0 },
      totalEstimatedBytes: 1024
    },
    workers: [],
    indexedDbFontCache: {
      fontCount: 0,
      totalBytes: 0,
      fonts: []
    },
    ...overrides
  }
}

describe('formatMemoryUsageReport', () => {
  it('includes totals and empty worker/font sections', () => {
    const text = formatMemoryUsageReport(makeReport())
    expect(text).toContain('mtext-renderer memory estimate')
    expect(text).toContain('main: 1 KB')
    expect(text).toContain('workers: (none)')
    expect(text).toContain('indexedDbFontCache (not in total): 0 fonts')
  })

  it('formats worker and font details', () => {
    const text = formatMemoryUsageReport(
      makeReport({
        workers: [
          {
            id: 'worker-0',
            inFlightRequests: 1,
            fonts: [
              {
                names: ['romans'],
                type: 'shx',
                sourceByteLength: 1024,
                parsedFontEstimatedBytes: 1536,
                charGeometryCache: {
                  entries: 2,
                  maxEntries: 4096,
                  estimatedBytes: 100
                },
                shxLayoutCache: {
                  entries: 1,
                  maxEntries: 4096,
                  estimatedBytes: 50
                },
                estimatedBytes: 1686
              }
            ],
            materials: { meshCount: 1, lineCount: 0, estimatedBytes: 512 },
            totalEstimatedBytes: 2198
          }
        ],
        indexedDbFontCache: {
          fontCount: 1,
          totalBytes: 2048,
          fonts: [{ name: 'romans', type: 'shx', bytes: 2048 }]
        }
      })
    )

    expect(text).toContain('worker-0')
    expect(text).toContain('in-flight: 1')
    expect(text).toContain('font "romans" [shx]')
    expect(text).toContain('romans [shx]: 2 KB')
    expect(text).toContain('indexedDbFontCache (not in total)')
  })
})
