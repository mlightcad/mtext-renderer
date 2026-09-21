import { describe, expect, it } from 'vitest'

import { computeMeshFontScaleFactor } from '../../src/font/meshFontScaleFactor'

describe('computeMeshFontScaleFactor', () => {
  it('uses Latin capital height for Western-only fonts', () => {
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 1000,
      charToGlyphIndex: (char: string) => (char === 'A' ? 36 : 0),
      charToGlyph: (char: string) => {
        if (char === 'A') return { yMax: 700, advanceWidth: 600 }
        return { yMax: 800, advanceWidth: 1000 }
      }
    })
    expect(scale).toBeCloseTo(1000 / 700)
  })

  it('ignores .notdef for missing Latin A', () => {
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 1000,
      charToGlyphIndex: () => 0,
      charToGlyph: () => ({ yMax: 800, advanceWidth: 1000 })
    })
    expect(scale).toBe(1)
  })

  it('uses Latin capital height for CJK faces too', () => {
    // SimSun-like: em 256, A.yMax 179. Em-square scale (1) under-sizes
    // advances and delays soft wraps versus AutoCAD.
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 256,
      charToGlyphIndex: (char: string) => {
        if (char === 'A') return 36
        if (char === '国') return 9726
        return 0
      },
      charToGlyph: (char: string) => {
        if (char === 'A') return { yMax: 179, advanceWidth: 128 }
        if (char === '国') return { yMax: 207, advanceWidth: 256 }
        return undefined
      }
    })
    expect(scale).toBeCloseTo(256 / 179)
  })
})
