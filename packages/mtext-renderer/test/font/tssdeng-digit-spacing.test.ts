import { InkWidthAdvanceStrategy } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadTssdeng(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'tssdeng.shx')
  if (!response.ok) throw new Error('Failed to fetch tssdeng.shx')
  const fontData: FontData = {
    name: 'tssdeng',
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: ['tssdeng']
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('tssdeng.shx digit spacing in renderer', () => {
  it(
    'uses center-origin ink advance for each digit in 1024',
    async () => {
      const font = await loadTssdeng()
      const size = 30
      const cellWidth = font.getFontMetrics(size).cellWidth
      const shapes = font.generateShapes('1024', size)
      expect(shapes).toHaveLength(4)

      for (let i = 1; i < shapes.length; i++) {
        const gap = shapes[i].shape.bbox.minX - shapes[i - 1].shape.bbox.maxX
        expect(gap).toBeGreaterThanOrEqual(0)
      }

      for (const ch of '1024') {
        const glyph = font.getCharShape(ch, size)!
        expect(glyph.width).toBeCloseTo(
          InkWidthAdvanceStrategy.computeAdvance(glyph.shape, cellWidth)
        )
      }
    },
    120_000
  )
})
