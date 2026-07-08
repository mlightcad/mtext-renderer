import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MeshFont } from '../../src/font/meshFont'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadFont(
  name: string,
  file: string,
  type: 'shx' | 'mesh' = 'shx',
  encoding?: string
) {
  const response = await fetch(FONT_BASE + file)
  const fontData: FontData = {
    name,
    type,
    data: await response.arrayBuffer(),
    alias: [name],
    encoding
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

    registerFont('hztxt', await loadFont('hztxt', 'hztxt.shx', 'shx', 'gbk'))
    const amgdt = await loadFont('amgdt', 'amgdt.shx')
    registerFont('amgdt', amgdt)

    const size = 10
    const degree = FontManager.instance.getCodeShapeFromSymbolFonts(0xb0, size)
    const pm = FontManager.instance.getCodeShapeFromSymbolFonts(0xb1, size)

    expect(degree?.width).toBe(amgdt.getCodeShape(0xb0, size)!.width)
    expect(pm?.width).toBe(amgdt.getCodeShape(0xb1, size)!.width)
    expect(degree?.width).toBeGreaterThan(0)
  }, 120_000)
})
