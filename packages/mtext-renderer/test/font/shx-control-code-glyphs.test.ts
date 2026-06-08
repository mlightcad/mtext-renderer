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
  type: 'shx' | 'mesh' = 'shx'
): Promise<ShxFont | MeshFont> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
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

describe('AutoCAD percent symbols with isocp primary font (integration)', () => {
  it(
    'resolves %%c, %%d, and %%p through amgdt control codes instead of isocp Unicode glyphs',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('modern')

      registerFont('isocp', await loadFont('isocp', 'isocp.shx'))
      registerFont('amgdt', await loadFont('amgdt', 'amgdt.shx'))

      const cases = [
        {
          label: '%%c',
          unicodeChar: 'Ø',
          symbolCode: 0x2205,
          isocpWidth: 12.230769230769234,
          symbolWidth: 6.785714285714286
        },
        {
          label: '%%d',
          unicodeChar: '°',
          controlCode: 176,
          isocpWidth: 4.615384615384616,
          symbolWidth: 2.857142857142857
        },
        {
          label: '%%p',
          unicodeChar: '±',
          controlCode: 177,
          isocpWidth: 5.384615384615385,
          symbolWidth: 9.285714285714286
        }
      ] as const

      for (const testCase of cases) {
        const isocpShape = FontManager.instance.getCharShape(
          testCase.unicodeChar,
          'isocp',
          10
        )
        const symbolLookupCode =
          'symbolCode' in testCase
            ? testCase.symbolCode
            : testCase.controlCode
        const symbolShape = FontManager.instance.getCodeShapeFromSymbolFonts(
          symbolLookupCode,
          10
        )

        expect(isocpShape, testCase.label).toBeDefined()
        expect(symbolShape, testCase.label).toBeDefined()
        expect(isocpShape!.width, testCase.label).toBe(testCase.isocpWidth)
        expect(symbolShape!.width, testCase.label).toBeCloseTo(
          testCase.symbolWidth,
          5
        )
        expect(isocpShape!.width, testCase.label).not.toBe(symbolShape!.width)
      }
    },
    60_000
  )
})

describe('%%130 %%131 glyph fallback (integration)', () => {
  const ch130 = String.fromCharCode(130)
  const ch131 = String.fromCharCode(131)
  const ch132 = String.fromCharCode(132)

  it(
    'resolves %%130/%%131 from amgdt.shx; gdt.ttf has no real glyph at those code points',
    async () => {
      const txt = await loadFont('txt', 'txt.shx')
      const amgdt = await loadFont('amgdt', 'amgdt.shx')
      const gdt = await loadFont('gdt', 'gdt.ttf', 'mesh')

      expect(txt.hasChar(ch130)).toBe(false)
      // MeshFont: index 0 (.notdef) must not count as a glyph (opentype.js #330).
      expect(gdt.hasChar(ch130)).toBe(false)
      expect(gdt.getCharShape(ch130, 10)).toBeUndefined()
      expect(amgdt.getCharShape(ch130, 10)).toBeDefined()
      expect(amgdt.getCharShape(ch131, 10)).toBeDefined()

      const shape132 = amgdt.getCharShape(ch132, 10)
      expect(shape132).toBeDefined()
      expect(shape132!.toGeometry().attributes.position?.count ?? 0).toBeGreaterThan(
        0
      )
    },
    60_000
  )

  it(
    'getCodeShapeFromSymbolFonts skips gdt.ttf and uses amgdt when configured',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('minimal')

      registerFont('txt', await loadFont('txt', 'txt.shx'))
      registerFont('amgdt', await loadFont('amgdt', 'amgdt.shx'))
      registerFont('gdt', await loadFont('gdt', 'gdt.ttf', 'mesh'))

      const shape130 = FontManager.instance.getCodeShapeFromSymbolFonts(130, 10)
      const shape131 = FontManager.instance.getCodeShapeFromSymbolFonts(131, 10)

      expect(shape130).toBeDefined()
      expect(shape131).toBeDefined()
    },
    60_000
  )
})
