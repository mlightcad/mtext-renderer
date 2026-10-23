import { afterEach, describe, expect, it } from 'vitest'

import { TextRenderProfiler } from '../../src/memory/textRenderProfiler'

describe('TextRenderProfiler', () => {
  afterEach(() => {
    TextRenderProfiler.setEnabled(null)
    TextRenderProfiler.reset()
  })

  it('is a no-op when disabled', () => {
    TextRenderProfiler.setEnabled(false)
    TextRenderProfiler.addMs('triangulateMs', 10)
    TextRenderProfiler.noteCacheMiss(65)
    expect(TextRenderProfiler.snapshot().triangulateMs).toBe(0)
    expect(TextRenderProfiler.snapshot().cacheMiss).toBe(0)
  })

  it('accumulates leaf timers and residual layout', () => {
    TextRenderProfiler.setEnabled(true)
    TextRenderProfiler.reset()

    TextRenderProfiler.timeSync('triangulateMs', () => {
      const end = performance.now() + 2
      while (performance.now() < end) {
        // busy wait so residual math has a measurable leaf
      }
    })
    const leafAfterTri = TextRenderProfiler.geometryLeafTotalMs()
    expect(leafAfterTri).toBeGreaterThan(0)

    TextRenderProfiler.addProcessTextResidual(20, 0)
    const snap = TextRenderProfiler.snapshot()
    expect(snap.triangulateMs).toBeGreaterThan(0)
    expect(snap.parseLayoutMs).toBeGreaterThan(0)
    expect(snap.parseLayoutMs).toBeLessThanOrEqual(20)
  })

  it('merges worker deltas including unique char codes', () => {
    TextRenderProfiler.setEnabled(true)
    TextRenderProfiler.reset()
    TextRenderProfiler.mergeDelta({
      triangulateMs: 12,
      uniqueChars: 2,
      uniqueCharCodes: [0x4e00, 0x4e01],
      placedChars: 5,
      drawCount: 1
    })
    const snap = TextRenderProfiler.snapshot()
    expect(snap.triangulateMs).toBe(12)
    expect(snap.uniqueChars).toBe(2)
    expect(snap.placedChars).toBe(5)
    expect(snap.drawCount).toBe(1)
  })

  it('records mergeMesh batch size buckets', () => {
    TextRenderProfiler.setEnabled(true)
    TextRenderProfiler.reset()
    TextRenderProfiler.noteMergeMeshBatch(1)
    TextRenderProfiler.noteMergeMeshBatch(5)
    TextRenderProfiler.noteMergeMeshBatch(20)
    TextRenderProfiler.noteMergeMeshBatch(40)
    const snap = TextRenderProfiler.snapshot()
    expect(snap.mergeMeshCalls).toBe(4)
    expect(snap.mergeMeshEntries).toBe(66)
    expect(snap.mergeMeshEntriesMax).toBe(40)
    expect(snap.mergeMeshBucket1).toBe(1)
    expect(snap.mergeMeshBucket2to8).toBe(1)
    expect(snap.mergeMeshBucket9to32).toBe(1)
    expect(snap.mergeMeshBucket33plus).toBe(1)
  })
})
