import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { MTextColor } from '@mlightcad/mtext-parser'

vi.mock('@mlightcad/mtext-parser', () => {
  class FakeColor {
    isAci = false
    isRgb = true
    rgbValue: number | null = 0xffffff
    private _aci: number | null = null
    private _rgb: [number, number, number] = [255, 255, 255]

    get aci() {
      return this._aci
    }

    set aci(value: number | null) {
      this._aci = value
      this.isAci = value !== null
      if (value !== null) {
        this.isRgb = false
      }
    }

    get rgb() {
      return this._rgb
    }

    set rgb(value: [number, number, number]) {
      this._rgb = value
      this.isRgb = true
      this.isAci = false
      this.rgbValue =
        ((value[0] & 0xff) << 16) | ((value[1] & 0xff) << 8) | (value[2] & 0xff)
      this._aci = null
    }

    copy() {
      const out = new FakeColor()
      out.isAci = this.isAci
      out.isRgb = this.isRgb
      out.rgbValue = this.rgbValue
      out._aci = this._aci
      out._rgb = [...this._rgb] as [number, number, number]
      return out
    }
  }

  class MTextContext {
    continueStroke = false
    color = new FakeColor()
    align = 0
    fontFace = { family: '', style: 'Regular', weight: 400 }
    capHeight = { value: 1, isRelative: true }
    widthFactor = { value: 1, isRelative: true }
    charTrackingFactor = { value: 1, isRelative: true }
    oblique = 0
    paragraph = { align: 1 }
  }

  return {
    MTextColor: FakeColor,
    MTextContext,
    MTextParagraphAlignment: {
      DEFAULT: 0,
      LEFT: 1,
      CENTER: 2,
      RIGHT: 3,
      DISTRIBUTED: 5
    }
  }
})

vi.mock('../../src/font', () => ({
  FontManager: class FontManager {}
}))

import {
  MTextFormatOptions,
  MTextProcessor
} from '../../src/renderer/mtextProcessor'
import { MTextFlowDirection, TextStyle } from '../../src/renderer/types'

type GlyphShape = { width: number }

function createShape(width: number): GlyphShape {
  return { width }
}

function createGlyphFallbackProcessor(
  style: Pick<TextStyle, 'font' | 'bigFont'>,
  fontManager: Record<string, unknown>
) {
  const textStyle: TextStyle = {
    name: 'standard',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 10,
    font: style.font,
    bigFont: style.bigFont ?? ''
  }

  const options: MTextFormatOptions = {
    fontSize: 10,
    widthFactor: 1,
    lineSpaceFactor: 0.3,
    horizontalAlignment: 1,
    maxWidth: 0,
    flowDirection: MTextFlowDirection.LEFT_TO_RIGHT,
    byBlockColor: 0x123456,
    byLayerColor: 0xabcdef,
    removeFontExtension: true
  }

  const processor = new MTextProcessor(
    textStyle,
    {
      byBlockColor: options.byBlockColor,
      byLayerColor: options.byLayerColor,
      layer: '0',
      color: new MTextColor(256)
    } as any,
    {
      getMeshBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      getLineBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.LineBasicMaterial({ color: 0xffffff }))
    } as any,
    fontManager as any,
    options
  )

  return processor
}

function resolveCharShape(
  char: string,
  fontName: string,
  glyphs: Record<string, Record<string, GlyphShape | undefined>>
): GlyphShape | undefined {
  const fontGlyphs = glyphs[fontName]
  return fontGlyphs?.[char]
}

function resolveCodeShape(
  code: number,
  fontName: string,
  glyphs: Record<string, Record<number, GlyphShape | undefined>>
): GlyphShape | undefined {
  const fontGlyphs = glyphs[fontName]
  return fontGlyphs?.[code]
}

describe('MTextProcessor TextStyle glyph fallback (AutoCAD semantics)', () => {
  const primaryFont = 'txt'
  const bigFontName = 'hztxt'
  const defaultFont = 'simkai'
  const cjkChar = '中'

  it('uses bigFont when primary font lacks the glyph and does not use default fonts', () => {
    const primaryShape = createShape(1)
    const bigShape = createShape(2)
    const defaultShape = createShape(3)

    const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      [primaryFont]: {},
      [bigFontName]: { [cjkChar]: bigShape },
      [defaultFont]: { [cjkChar]: defaultShape }
    }

    const getCharShape = vi.fn((char: string, fontName: string) =>
      resolveCharShape(char, fontName, glyphs)
    )
    const getCharShapeFromDefaults = vi.fn((char: string) =>
      resolveCharShape(char, defaultFont, glyphs)
    )

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: bigFontName },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(bigShape)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, bigFontName, 10)
    expect(getCharShapeFromDefaults).not.toHaveBeenCalled()
  })

  it('uses default fonts when bigFont is empty and primary font lacks the glyph', () => {
    const defaultShape = createShape(3)

    const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      [primaryFont]: {},
      [defaultFont]: { [cjkChar]: defaultShape }
    }

    const getCharShape = vi.fn((char: string, fontName: string) =>
      resolveCharShape(char, fontName, glyphs)
    )
    const getCharShapeFromDefaults = vi.fn((char: string, size: number) => {
      const shape = resolveCharShape(char, defaultFont, glyphs)
      return shape ? { ...shape, width: shape.width * (size / 10) } : undefined
    })

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: '' },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toEqual(defaultShape)
    expect(getCharShape).toHaveBeenCalledTimes(1)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShapeFromDefaults).toHaveBeenCalledWith(cjkChar, 10)
  })

  it('falls back to default fonts when primary and bigFont both lack the glyph', () => {
    const defaultShape = createShape(3)

    const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      [primaryFont]: {},
      [bigFontName]: {},
      [defaultFont]: { [cjkChar]: defaultShape }
    }

    const getCharShape = vi.fn((char: string, fontName: string) =>
      resolveCharShape(char, fontName, glyphs)
    )
    const getCharShapeFromDefaults = vi.fn((char: string) =>
      resolveCharShape(char, defaultFont, glyphs)
    )

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: bigFontName },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(defaultShape)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, bigFontName, 10)
    expect(getCharShapeFromDefaults).toHaveBeenCalledWith(cjkChar, 10)
  })

  it.each([
    {
      label: '%%c diameter',
      symbolData: { kind: 'named', code: 'c', char: 'Ø' },
      char: 'Ø',
      lookupCodes: [129, 0x2205],
      primaryWidth: 10,
      symbolWidth: 6.78
    },
    {
      label: '%%d degree',
      symbolData: { kind: 'named', code: 'd', char: '°' },
      char: '°',
      lookupCodes: [126, 176],
      primaryWidth: 4.6,
      symbolWidth: 2.85
    },
    {
      label: '%%p plus/minus',
      symbolData: { kind: 'named', code: 'p', char: '±' },
      char: '±',
      lookupCodes: [177],
      primaryWidth: 5.4,
      symbolWidth: 9.28
    }
  ] as const)(
    'prefers SHX symbol-font control codes for $label before primary font',
    ({ char, symbolData, lookupCodes, primaryWidth, symbolWidth }) => {
      const primaryShape = createShape(primaryWidth)
      const symbolShape = createShape(symbolWidth)
      const charGlyphs: Record<string, Record<string, GlyphShape | undefined>> = {
        isocp: { [char]: primaryShape }
      }
      const codeGlyphs: Record<string, Record<number, GlyphShape | undefined>> = {
        simsun: Object.fromEntries(
          [127, 128, 126, 129, 0xb0, 0xb1, 0x2205].map(code => [
            code,
            createShape(99)
          ])
        ),
        amgdt: Object.fromEntries(
          lookupCodes.map(lookupCode => [lookupCode, symbolShape])
        )
      }

      const getCharShape = vi.fn((lookupChar: string, fontName: string) =>
        resolveCharShape(lookupChar, fontName, charGlyphs)
      )
      const getCodeShapeFromSymbolFonts = vi.fn((lookupCode: number) => {
        for (const fontName of ['amgdt', 'simsun']) {
          const shape = resolveCodeShape(lookupCode, fontName, codeGlyphs)
          if (shape) return shape
        }
        return undefined
      })

      const processor = createGlyphFallbackProcessor(
        { font: 'isocp', bigFont: 'intecad' },
        {
          getFontScaleFactor: () => 1,
          getFontType: () => 'shx' as const,
          findAndReplaceFont: (name: string) => name,
          getCharShape,
          getCharShapeFromDefaults: vi.fn(),
          getCodeShapeFromSymbolFonts,
          getNotFoundTextShape: () => undefined
        }
      )

      getCharShape.mockClear()
      getCodeShapeFromSymbolFonts.mockClear()

      const shape = (processor as any).resolvePercentSymbolShape(symbolData)

      expect(shape).toBe(symbolShape)
      expect(getCodeShapeFromSymbolFonts).toHaveBeenCalledTimes(1)
      expect(lookupCodes).toContain(
        getCodeShapeFromSymbolFonts.mock.calls[0][0]
      )
      expect(getCharShape).not.toHaveBeenCalled()
    }
  )

  it('prefers SHX symbol-font glyph for %%132 before default-font fallbacks', () => {
    const ch132 = String.fromCharCode(132)
    const defaultShape = createShape(0)
    const symbolShape = createShape(6.5)
    const charGlyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      txt: {},
      simkai: { [ch132]: defaultShape }
    }
    const codeGlyphs: Record<string, Record<number, GlyphShape | undefined>> = {
      amgdt: { 132: symbolShape }
    }

    const getCharShape = vi.fn((lookupChar: string, fontName: string) =>
      resolveCharShape(lookupChar, fontName, charGlyphs)
    )
    const getCharShapeFromDefaults = vi.fn((lookupChar: string) => {
      for (const fontName of ['txt', 'simkai']) {
        const shape = resolveCharShape(lookupChar, fontName, charGlyphs)
        if (shape) return shape
      }
      return undefined
    })
    const getCodeShapeFromSymbolFonts = vi.fn((lookupCode: number) => {
      for (const fontName of ['amgdt']) {
        const shape = resolveCodeShape(lookupCode, fontName, codeGlyphs)
        if (shape) return shape
      }
      return undefined
    })

    const processor = createGlyphFallbackProcessor(
      { font: 'txt', bigFont: '' },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getCodeShapeFromSymbolFonts,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()
    getCodeShapeFromSymbolFonts.mockClear()

    const shape = (processor as any).resolvePercentSymbolShape({
      kind: 'numeric',
      charCode: 132,
      char: ch132
    })

    expect(shape).toBe(symbolShape)
    expect(getCodeShapeFromSymbolFonts).toHaveBeenCalledWith(132, 10)
    expect(getCharShapeFromDefaults).not.toHaveBeenCalled()
    expect(getCharShape).not.toHaveBeenCalled()
  })

  it('prefers SHX symbol-font glyph for %%132 when primary font has a wrong code-132 shape', () => {
    const ch132 = String.fromCharCode(132)
    const primaryShape = createShape(0)
    const symbolShape = createShape(6.5)
    const charGlyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      txt: { [ch132]: primaryShape }
    }
    const codeGlyphs: Record<string, Record<number, GlyphShape | undefined>> = {
      amgdt: { 132: symbolShape }
    }

    const getCharShape = vi.fn((lookupChar: string, fontName: string) =>
      resolveCharShape(lookupChar, fontName, charGlyphs)
    )
    const getCodeShapeFromSymbolFonts = vi.fn((lookupCode: number) => {
      for (const fontName of ['amgdt']) {
        const shape = resolveCodeShape(lookupCode, fontName, codeGlyphs)
        if (shape) return shape
      }
      return undefined
    })

    const processor = createGlyphFallbackProcessor(
      { font: 'txt', bigFont: '' },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults: vi.fn(),
        getCodeShapeFromSymbolFonts,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCodeShapeFromSymbolFonts.mockClear()

    const shape = (processor as any).resolvePercentSymbolShape({
      kind: 'numeric',
      charCode: 132,
      char: ch132
    })

    expect(shape).toBe(symbolShape)
    expect(getCodeShapeFromSymbolFonts).toHaveBeenCalledWith(132, 10)
    expect(getCharShape).not.toHaveBeenCalled()
  })

  it('prefers primary font for superscript ² instead of amgdt symbol fallback', () => {
    const superscriptTwo = '²'
    const primaryShape = createShape(3)
    const symbolShape = createShape(20)
    const charGlyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      'gost common': { [superscriptTwo]: primaryShape }
    }
    const codeGlyphs: Record<string, Record<number, GlyphShape | undefined>> = {
      amgdt: { 0xb2: symbolShape }
    }

    const getCharShape = vi.fn((lookupChar: string, fontName: string) =>
      resolveCharShape(lookupChar, fontName, charGlyphs)
    )
    const getCodeShapeFromSymbolFonts = vi.fn((lookupCode: number) => {
      for (const fontName of ['amgdt']) {
        const shape = resolveCodeShape(lookupCode, fontName, codeGlyphs)
        if (shape) return shape
      }
      return undefined
    })

    const processor = createGlyphFallbackProcessor(
      { font: 'GOST Common', bigFont: '' },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults: vi.fn(),
        getCodeShapeFromSymbolFonts,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCodeShapeFromSymbolFonts.mockClear()

    const shape = (processor as any).getCharShape(superscriptTwo)

    expect(shape).toBe(primaryShape)
    expect(getCharShape).toHaveBeenCalledWith(superscriptTwo, 'gost common', 10)
    expect(getCodeShapeFromSymbolFonts).not.toHaveBeenCalled()
  })

  it('stops at primary font when the glyph is present there', () => {
    const primaryShape = createShape(1)
    const bigShape = createShape(2)

    const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      [primaryFont]: { [cjkChar]: primaryShape },
      [bigFontName]: { [cjkChar]: bigShape }
    }

    const getCharShape = vi.fn((char: string, fontName: string) =>
      resolveCharShape(char, fontName, glyphs)
    )
    const getCharShapeFromDefaults = vi.fn()

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: bigFontName },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(primaryShape)
    expect(getCharShape).toHaveBeenCalledTimes(1)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShapeFromDefaults).not.toHaveBeenCalled()
  })

  it('treats whitespace-only bigFont as empty and skips the bigFont step', () => {
    const defaultShape = createShape(3)

    const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
      [primaryFont]: {},
      [defaultFont]: { [cjkChar]: defaultShape }
    }

    const getCharShape = vi.fn((char: string, fontName: string) =>
      resolveCharShape(char, fontName, glyphs)
    )
    const getCharShapeFromDefaults = vi.fn((char: string) =>
      resolveCharShape(char, defaultFont, glyphs)
    )

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: '   ' },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getNotFoundTextShape: () => undefined
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(defaultShape)
    expect(getCharShape).toHaveBeenCalledTimes(1)
    expect(getCharShapeFromDefaults).toHaveBeenCalledWith(cjkChar, 10)
  })

  it('uses not-found shape when no font provides the glyph', () => {
    const notFoundShape = createShape(99)

    const getCharShape = vi.fn(() => undefined)
    const getCharShapeFromDefaults = vi.fn(() => undefined)
    const getCodeShapeFromSymbolFonts = vi.fn(() => undefined)
    const getNotFoundTextShape = vi.fn(() => notFoundShape)

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: bigFontName },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getCodeShapeFromSymbolFonts,
        getNotFoundTextShape
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()
    getCodeShapeFromSymbolFonts.mockClear()
    getNotFoundTextShape.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(notFoundShape)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, bigFontName, 10)
    expect(getCharShapeFromDefaults).toHaveBeenCalledWith(cjkChar, 10)
    expect(getCodeShapeFromSymbolFonts).toHaveBeenCalledWith(
      cjkChar.codePointAt(0),
      10
    )
    expect(getNotFoundTextShape).toHaveBeenCalledWith(10)
  })
})
