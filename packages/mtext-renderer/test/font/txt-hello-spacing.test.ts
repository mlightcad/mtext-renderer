import { InkWidthAdvanceStrategy, Point } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadTxt(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'txt.shx')
  if (!response.ok) throw new Error('Failed to fetch txt.shx')
  const fontData: FontData = {
    name: 'txt',
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: ['txt']
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('txt.shx Latin spacing in renderer', () => {
  it(
    'does not overlap successive lowercase l glyphs in Hello',
    async () => {
      const font = await loadTxt()
      const size = 16
      const letterL = font.getCodeShape('l'.charCodeAt(0), size)!
      const secondL = letterL.offset(new Point(letterL.width, 0))
      const gap = secondL.shape.bbox.minX - letterL.shape.bbox.maxX

      const cellWidth = font.getFontMetrics(size).cellWidth
      expect(letterL.width).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(letterL.shape, cellWidth)
      )
      expect(gap).toBeGreaterThanOrEqual(0)
    },
    120_000
  )
})
