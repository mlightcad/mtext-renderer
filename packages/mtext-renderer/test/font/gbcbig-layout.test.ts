import iconv from 'iconv-lite'
import { afterEach, describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadGbcbig(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'gbcbig.shx')
  if (!response.ok) throw new Error('Failed to fetch gbcbig.shx')
  const fontData: FontData = {
    name: 'gbcbig',
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: ['gbcbig'],
    encoding: 'gb2312'
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}


describe('gbcbig.shx CJK layout (integration)', () => {
  afterEach(() => {
    FontManager.instance.release()
  })

  it(
    'uses uniform cell advance and consistent baseline for 东亚字符集字体',
    async () => {
      const font = await loadGbcbig()
      const size = 10
      const text = '东亚字符集字体'
      const cellWidth =
        (font.data.content.width / font.data.content.height) * size

      const shapes = text.split('').map(ch => {
        const shape = font.getCharShape(ch, size)
        expect(shape, ch).toBeDefined()
        return shape!
      })

      const minYs: number[] = []
      for (const shape of shapes) {
        const pen = shape.shape.lastPoint?.x ?? 0
        const expectedAdvance = pen > 0 ? pen : cellWidth
        expect(shape.width).toBeCloseTo(expectedAdvance, 4)
        const geometry = shape.toGeometry()
        geometry.computeBoundingBox()
        minYs.push(geometry.boundingBox!.min.y)
      }

      const maxDelta = Math.max(...minYs) - Math.min(...minYs)
      expect(maxDelta).toBeLessThan(2)

      // Visual ink gaps between adjacent glyphs should stay uniform (no double-width holes).
      const placed = font.generateShapes(text, size)
      const inkExtents = placed.map((shape, i) => {
        const geometry = shape.toGeometry()
        geometry.computeBoundingBox()
        return {
          ch: text[i],
          minX: geometry.boundingBox!.min.x,
          maxX: geometry.boundingBox!.max.x
        }
      })
      const gaps: number[] = []
      for (let i = 0; i < inkExtents.length - 1; i++) {
        gaps.push(inkExtents[i + 1].minX - inkExtents[i].maxX)
      }
      const maxGap = Math.max(...gaps)
      const minGap = Math.min(...gaps)
      expect(maxGap - minGap).toBeLessThan(2.5)
    },
    120_000
  )
})
