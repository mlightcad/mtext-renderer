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
        expect(shape.width).toBeCloseTo(cellWidth, 4)
        const geometry = shape.toGeometry()
        geometry.computeBoundingBox()
        minYs.push(geometry.boundingBox!.min.y)
      }

      const maxDelta = Math.max(...minYs) - Math.min(...minYs)
      expect(maxDelta).toBeLessThan(0.01)
      expect(maxDelta).toBeLessThan(0.01)
    },
    120_000
  )
})
