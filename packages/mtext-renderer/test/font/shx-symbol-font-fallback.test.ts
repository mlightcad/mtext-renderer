import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MeshFont } from '../../src/font/meshFont'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadFont(name: string, file: string, type: 'shx' | 'mesh' = 'shx') {
  const response = await fetch(FONT_BASE + file)
  const fontData: FontData = {
    name,
    type,
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as ShxFont | MeshFont
}

function registerFont(name: string, font: ShxFont | MeshFont) {
  const key = name.toLowerCase()
  font.names.add(key)
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set(key, font)
}

describe('symbolFonts config (integration)', () => {
  it('uses amgdt degree and plus/minus instead of simsun', async () => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = false
    FontManager.instance.setDefaultFonts('modern')

    registerFont('hztxt', await loadFont('hztxt', 'hztxt.shx'))
    registerFont('simsun', await loadFont('simsun', 'simsun.ttf', 'mesh'))
    registerFont('amgdt', await loadFont('amgdt', 'amgdt.shx'))

    const degree = FontManager.instance.getCodeShapeFromSymbolFonts(0xb0, 10)
    const pm = FontManager.instance.getCodeShapeFromSymbolFonts(0xb1, 10)

    expect(degree?.width).toBeCloseTo(2.857142857142857, 5)
    expect(pm?.width).toBeCloseTo(9.285714285714286, 5)

    expect(FontManager.instance.getCharShapeFromDefaults('°', 10)?.width).toBe(
      10
    )
    expect(FontManager.instance.getCharShapeFromDefaults('±', 10)?.width).toBe(
      10
    )
  }, 120_000)
})
