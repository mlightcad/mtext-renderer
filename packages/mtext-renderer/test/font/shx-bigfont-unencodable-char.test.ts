import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadShxFont(name: string, file: string, encoding?: string) {
  const response = await fetch(FONT_BASE + file)
  const fontData: FontData = {
    name,
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: [name],
    encoding
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('ShxFont BIGFONT encoding (regression)', () => {
  it('reports no glyph for a character its legacy encoding cannot represent, instead of a mojibake substitute (#473)', async () => {
    // hztxt.shx is a GBK-encoded BIGFONT. U+2205 (the diameter dimension
    // symbol some DWGs embed literally) has no GBK representation.
    // iconv-lite silently substitutes ASCII '?' (0x3F) when asked to encode
    // it, and 0x3F is itself a perfectly valid glyph in hztxt.shx -- so
    // before this fix, hasChar/getCharShape reported success and rendered
    // a literal question mark instead of falling back to a font that
    // actually has the diameter glyph (amgdt.shx).
    const hztxt = await loadShxFont('hztxt', 'hztxt.shx', 'gbk')

    expect(hztxt.hasChar('∅')).toBe(false)
    expect(hztxt.getCharShape('∅', 10)).toBeUndefined()

    // Real GBK-representable CJK text must still resolve normally.
    expect(hztxt.hasChar('技')).toBe(true)
    expect(hztxt.getCharShape('技', 10)).toBeDefined()
  }, 120_000)

  it('confirms the symbol font that should catch the fallback actually has the glyph', async () => {
    const amgdt = await loadShxFont('amgdt', 'amgdt.shx')
    expect(amgdt.hasChar('∅')).toBe(true)
    expect(amgdt.getCharShape('∅', 10)).toBeDefined()
  }, 120_000)
})
