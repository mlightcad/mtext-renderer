import { describe, expect, it } from 'vitest'

import {
  CJK_LATIN_SCALE_INFLATION_THRESHOLD,
  computeMeshFontScaleFactor
} from '../../src/font/meshFontScaleFactor'

describe('computeMeshFontScaleFactor', () => {
  it('uses Latin capital height for Western-only fonts', () => {
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 1000,
      charToGlyphIndex: (char: string) => (char === 'A' ? 36 : 0),
      charToGlyph: (char: string) => {
        if (char === 'A') return { yMax: 700, advanceWidth: 600 }
        // opentype.js returns .notdef (index 0) for missing glyphs
        return { yMax: 800, advanceWidth: 1000 }
      }
    })
    expect(scale).toBeCloseTo(1000 / 700)
  })

  it('ignores .notdef CJK probes on Western fonts with full-em notdef advance', () => {
    const latinScale = 1000 / 700
    expect(latinScale).toBeGreaterThan(CJK_LATIN_SCALE_INFLATION_THRESHOLD)
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 1000,
      charToGlyphIndex: (char: string) => (char === 'A' ? 36 : 0),
      charToGlyph: (char: string) => {
        if (char === 'A') return { yMax: 700, advanceWidth: 600 }
        return { yMax: 800, advanceWidth: 1000 }
      }
    })
    expect(scale).toBeCloseTo(latinScale)
  })

  it('returns 1 for CJK fonts where Latin scale would inflate advances', () => {
    const latinScale = 1000 / 683
    expect(latinScale).toBeGreaterThan(CJK_LATIN_SCALE_INFLATION_THRESHOLD)
    const scale = computeMeshFontScaleFactor({
      unitsPerEm: 1000,
      charToGlyphIndex: (char: string) => {
        if (char === 'A') return 36
        if (char === '国') return 9726
        return 0
      },
      charToGlyph: (char: string) => {
        if (char === 'A') return { yMax: 683, advanceWidth: 600 }
        if (char === '国') return { yMax: 880, advanceWidth: 1000 }
        return undefined
      }
    })
    expect(scale).toBe(1)
  })
})
