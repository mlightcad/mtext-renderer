import { ShxFont as ShxFontInternal } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadFont(fileName: string): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + fileName)
  if (!response.ok) throw new Error(`Failed to fetch ${fileName}`)
  const name = fileName.replace(/\.shx$/i, '')
  const fontData: FontData = {
    name,
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('SHX word spacing (issue 72)', () => {
  it.each(['romans.shx', 'simplex.shx', 'txt.shx'])(
    '%s keeps the native pen advance for spaces and letters',
    async fileName => {
      const font = await loadFont(fileName)
      const size = 10
      const cellWidth = font.getFontMetrics(size).cellWidth
      const rawFont = new ShxFontInternal(font.data)

      const space = font.getCharShape(' ', size)!
      const rawSpace = rawFont.getCharShape(' '.charCodeAt(0), size)!
      expect(space.width).toBeCloseTo(rawSpace.lastPoint!.x, 2)
      // Ink-width spacing collapses a blank glyph to 0.2 * cellWidth.
      expect(space.width).toBeGreaterThan(cellWidth * 0.5)

      for (const ch of 'HELLO') {
        const glyph = font.getCharShape(ch, size)!
        const raw = rawFont.getCharShape(ch.charCodeAt(0), size)!
        expect(glyph.width, ch).toBeCloseTo(raw.lastPoint!.x, 2)
        expect(glyph.width, ch).toBeGreaterThan(glyph.shape.bbox.maxX)
      }

      rawFont.release()
    },
    120_000
  )

  it(
    'still pads italic strokes whose pen stops inside the ink',
    async () => {
      const font = await loadFont('italic.shx')
      const size = 10
      const rawFont = new ShxFontInternal(font.data)
      const slash = font.getCharShape('/', size)!
      const rawSlash = rawFont.getCharShape('/'.charCodeAt(0), size)!
      expect(rawSlash.lastPoint!.x).toBeLessThan(rawSlash.bbox.maxX)
      expect(slash.width).toBeGreaterThan(rawSlash.bbox.maxX)
      rawFont.release()
    },
    120_000
  )
})
