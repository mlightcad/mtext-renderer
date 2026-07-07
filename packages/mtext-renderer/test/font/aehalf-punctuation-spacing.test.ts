import { getAdvanceWidth, Point, ShxFont as ShxFontInternal } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadAehalf(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'aehalf.shx')
  if (!response.ok) throw new Error('Failed to fetch aehalf.shx')
  const fontData: FontData = {
    name: 'aehalf',
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: ['aehalf']
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('aehalf punctuation spacing in renderer', () => {
  it(
    'uses cell width advance for quote and tilde with moderate ink gaps',
    async () => {
      const font = await loadAehalf()
      const size = 30
      const cellWidth = font.getFontMetrics(size).cellWidth
      const codes = ['t'.charCodeAt(0), 34, 50, 48, 126, 50]

      const shapes = codes.map(code => font.getCodeShape(code, size)!)
      for (const shape of shapes) {
        expect(shape).toBeDefined()
      }

      for (const code of [34, 126]) {
        const shape = font.getCodeShape(code, size)!
        expect(shape.width).toBeCloseTo(cellWidth)
      }

      let cursor = 0
      const placed = shapes.map(shape => {
        const placedShape = shape.offset(new Point(cursor, 0))
        cursor += shape.width
        return placedShape
      })

      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX
        expect(gap).toBeGreaterThan(0)
        expect(gap).toBeLessThan(cellWidth)
      }
    },
    120_000
  )

  it(
    'uses cell width advance for each digit in 2180',
    async () => {
      const font = await loadAehalf()
      const size = 30
      const cellWidth = font.getFontMetrics(size).cellWidth

      for (const ch of '2180') {
        expect(font.getCharShape(ch, size)!.width).toBeCloseTo(cellWidth)
      }

      const placed = font.generateShapes('2180', size)
      expect(placed).toHaveLength(4)
      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX
        expect(gap).toBeLessThan(cellWidth)
      }
    },
    120_000
  )

  it(
    'maps aehalf glyphs using font metrics for advance and vertical placement',
    async () => {
      const font = await loadAehalf()
      const size = 30
      const metrics = font.getFontMetrics(size)

      for (const ch of [';', ':', '(', ')', ',', '.']) {
        const shape = font.getCharShape(ch, size)!
        expect(shape.width).toBeCloseTo(metrics.cellWidth)
      }

      const letterA = font.getCharShape('A', size)!
      expect(letterA.shape.bbox.minY).toBeCloseTo(0, 0)
      expect(letterA.shape.bbox.maxY).toBeCloseTo(metrics.capHeight, 0)

      const quote = font.getCharShape('"', size)!
      const quoteResponse = await fetch(FONT_BASE + 'aehalf.shx')
      const rawInternal = new ShxFontInternal(await quoteResponse.arrayBuffer())
      const rawQuote = rawInternal.getCharShape(34, size)!
      rawInternal.release()
      expect(quote.shape.bbox.minY).toBeCloseTo(
        rawQuote.bbox.minY + metrics.capHeight,
        0
      )

      for (const ch of 'gjpq') {
        const shape = font.getCharShape(ch, size)!
        expect(shape.shape.bbox.minY).toBeCloseTo(0, 0)
      }

      const semicolon = font.getCharShape(';', size)!
      const placedA = font
        .getCharShape('A', size)!
        .offset(new Point(semicolon.width, 0))
      const gap = placedA.shape.bbox.minX - semicolon.shape.bbox.maxX
      expect(gap).toBeGreaterThan(0)
    },
    120_000
  )
})
