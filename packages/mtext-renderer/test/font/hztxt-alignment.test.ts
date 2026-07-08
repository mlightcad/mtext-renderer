import {
  getAdvanceWidth,
  InkWidthAdvanceStrategy,
  Point,
  ShxFont as ShxFontInternal
} from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

let cachedHztxtBuffer: ArrayBuffer | undefined

async function loadHztxt(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'hztxt.shx')
  if (!response.ok) throw new Error('Failed to fetch hztxt.shx')
  cachedHztxtBuffer = await response.arrayBuffer()
  const fontData: FontData = {
    name: 'hztxt',
    type: 'shx',
    data: cachedHztxtBuffer,
    encoding: 'gbk',
    alias: ['hztxt']
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

async function rawHztxtShape(code: number, size: number) {
  if (!cachedHztxtBuffer) {
    const response = await fetch(FONT_BASE + 'hztxt.shx')
    cachedHztxtBuffer = await response.arrayBuffer()
  }
  const internal = new ShxFontInternal(cachedHztxtBuffer)
  const raw = internal.getCharShape(code, size)!
  internal.release()
  return raw
}

describe('hztxt glyph alignment in renderer', () => {
  it(
    'preserves BIGFONT vertical coordinates and pen advance after layout',
    async () => {
      const font = await loadHztxt()
      const size = 16

      for (const code of [0xa1a2, 0xa1a3, 0xa3a4, 0xb1df]) {
        const raw = await rawHztxtShape(code, size)
        const layout = font.getCodeShape(code, size)!
        expect(layout.shape.bbox.minY).toBeLessThanOrEqual(raw.bbox.minY)
        expect(layout.width).toBeCloseTo(getAdvanceWidth(raw), 0)
      }

      for (const code of [0xa1b0, 0xa1b1]) {
        const shape = font.getCodeShape(code, size)!
        expect(shape.shape.bbox.maxY).toBeGreaterThan(size * 0.5)
        expect(shape.shape.bbox.minY).toBeGreaterThan(0)
      }

      const han = font.getCodeShape(0xd2bb, size)!
      expect(han.shape.bbox.maxY).toBeGreaterThan(size * 0.5)
      expect(han.shape.bbox.minY).toBeGreaterThanOrEqual(0)
      expect(han.shape.bbox.minY).toBeLessThan(size * 0.75)
    },
    120_000
  )

  it(
    'resolves Unicode curly quotes through GBK halfwidth glyphs',
    async () => {
      const font = await loadHztxt()
      const size = 16

      for (const char of ['\u201c', '\u201d']) {
        const shape = font.getCharShape(char, size)
        expect(shape).toBeDefined()
        expect(shape!.width).toBeGreaterThan(0)
      }
    },
    120_000
  )

  it(
    'maps ASCII comma and hyphen to hztxt halfwidth glyphs',
    async () => {
      const font = await loadHztxt()
      const size = 16

      for (const ch of [',', '-']) {
        const shape = font.getCharShape(ch, size)
        expect(shape, ch).toBeDefined()
        expect(shape!.width).toBeGreaterThan(0)
      }

      const comma = font.getCharShape(',', size)!
      const rawComma = await rawHztxtShape(0xa3ac, size)
      expect(comma.width).toBeCloseTo(getAdvanceWidth(rawComma), 0)
    },
    120_000
  )

  it(
    'keeps horizontal gap between hztxt comma and the following letter G',
    async () => {
      const font = await loadHztxt()
      const size = 16
      const comma = font.getCodeShape(0xa3ac, size)!
      const letterG = font.getCodeShape(0xa3c7, size)!.offset(new Point(comma.width, 0))
      const gap = letterG.shape.bbox.minX - comma.shape.bbox.maxX

      expect(comma.width).toBeGreaterThanOrEqual(size / 2)
      expect(gap).toBeGreaterThanOrEqual(0)
    },
    120_000
  )
})

describe('unifont narrow punctuation advance in renderer', () => {
  it(
    'uses center-origin ink advance for tssdeng comma without pen vector',
    async () => {
      const response = await fetch(FONT_BASE + 'tssdeng.shx')
      if (!response.ok) return
      const fontData: FontData = {
        name: 'tssdeng',
        type: 'shx',
        data: await response.arrayBuffer(),
        alias: ['tssdeng']
      }
      const font = FontFactory.instance.createFont(fontData) as ShxFont
      const size = 16
      const cellWidth = font.getFontMetrics(size).cellWidth
      const comma = font.getCharShape(',', size)!
      expect(comma.width).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(comma.shape, cellWidth)
      )
    },
    120_000
  )
})
