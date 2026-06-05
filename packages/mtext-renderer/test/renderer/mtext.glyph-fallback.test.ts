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
      char: 'Ø',
      lookupChars: [String.fromCharCode(129), '\u2205'],
      primaryWidth: 10,
      symbolWidth: 6.78
    },
    {
      label: '%%d degree',
      char: '°',
      lookupChars: [String.fromCharCode(126), String.fromCharCode(176)],
      primaryWidth: 4.6,
      symbolWidth: 2.85
    },
    {
      label: '%%p plus/minus',
      char: '±',
      lookupChars: [String.fromCharCode(177)],
      primaryWidth: 5.4,
      symbolWidth: 9.28
    }
  ])(
    'prefers SHX symbol-font control codes for $label before primary font',
    ({ char, lookupChars, primaryWidth, symbolWidth }) => {
      const primaryShape = createShape(primaryWidth)
      const symbolShape = createShape(symbolWidth)
      const glyphs: Record<string, Record<string, GlyphShape | undefined>> = {
        isocp: { [char]: primaryShape },
        simsun: Object.fromEntries(
          [
            String.fromCharCode(127),
            String.fromCharCode(128),
            String.fromCharCode(126),
            String.fromCharCode(129),
            '°',
            '±',
            '\u2205'
          ].map(ch => [ch, createShape(99)])
        ),
        amgdt: Object.fromEntries(
          lookupChars.map(lookupChar => [lookupChar, symbolShape])
        )
      }

      const getCharShape = vi.fn((lookupChar: string, fontName: string) =>
        resolveCharShape(lookupChar, fontName, glyphs)
      )
      const getCharShapeFromSymbolFonts = vi.fn((lookupChar: string) => {
        for (const fontName of ['amgdt', 'simsun']) {
          const shape = resolveCharShape(lookupChar, fontName, glyphs)
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
          getCharShapeFromSymbolFonts,
          getNotFoundTextShape: () => undefined
        }
      )

      getCharShape.mockClear()
      getCharShapeFromSymbolFonts.mockClear()

      const shape = (processor as any).getCharShape(char)

      expect(shape).toBe(symbolShape)
      expect(getCharShapeFromSymbolFonts).toHaveBeenCalledTimes(1)
      expect(lookupChars).toContain(
        getCharShapeFromSymbolFonts.mock.calls[0][0]
      )
      expect(getCharShape).not.toHaveBeenCalled()
    }
  )

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
    const getCharShapeFromSymbolFonts = vi.fn(() => undefined)
    const getNotFoundTextShape = vi.fn(() => notFoundShape)

    const processor = createGlyphFallbackProcessor(
      { font: primaryFont, bigFont: bigFontName },
      {
        getFontScaleFactor: () => 1,
        getFontType: () => 'shx' as const,
        findAndReplaceFont: (name: string) => name,
        getCharShape,
        getCharShapeFromDefaults,
        getCharShapeFromSymbolFonts,
        getNotFoundTextShape
      }
    )

    getCharShape.mockClear()
    getCharShapeFromDefaults.mockClear()
    getCharShapeFromSymbolFonts.mockClear()
    getNotFoundTextShape.mockClear()

    const shape = (processor as any).getCharShape(cjkChar)

    expect(shape).toBe(notFoundShape)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, primaryFont, 10)
    expect(getCharShape).toHaveBeenCalledWith(cjkChar, bigFontName, 10)
    expect(getCharShapeFromDefaults).toHaveBeenCalledWith(cjkChar, 10)
    expect(getCharShapeFromSymbolFonts).toHaveBeenCalledWith(cjkChar, 10)
    expect(getNotFoundTextShape).toHaveBeenCalledWith(10)
  })
})
