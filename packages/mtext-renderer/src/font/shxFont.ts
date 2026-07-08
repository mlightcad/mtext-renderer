import {
  Point,
  ShxFont as ShxFontInternal,
  ShxFontData,
  type ShxFontMetrics,
  ShxFontType,
  ShxShape
} from '@mlightcad/shx-parser'
import iconv from 'iconv-lite'

import { LRUCache } from '../common/lruCache'
import { BaseFont } from './baseFont'
import { FontData } from './font'
import { ShxTextShape } from './shxTextShape'

/** Scaled SHX font layout metrics (cap height, cell width, etc.) from `@mlightcad/shx-parser`. */
export type { ShxFontMetrics } from '@mlightcad/shx-parser'

/**
 * ShxFont is a class that extends BaseFont and represents a SHX font.
 * It provides methods to generate shapes for text and retrieve character shapes.
 */
export class ShxFont extends BaseFont {
  /** Internal shx font instance */
  private readonly font: ShxFontInternal

  /** The type of font; always `'shx'`. */
  public readonly type = 'shx'

  /** Parsed SHX font data used for glyph lookup and layout metrics. */
  public readonly data: ShxFontData

  /** Cached layout-ready {@link ShxTextShape} instances keyed by code and size. */
  private readonly layoutShapeCache = new LRUCache<string, ShxTextShape>(4096)

  /** Cached BIGFONT character encodings keyed by input character. */
  private readonly codeCache = new Map<string, number>()

  /**
   * Creates a new SHX font wrapper.
   * @param fontData - Font metadata and binary SHX data used to initialize the font.
   */
  constructor(fontData: FontData) {
    super(fontData)

    this.font = new ShxFontInternal(fontData.data as ShxFontData | ArrayBuffer)
    this.data = this.font.fontData
  }

  /**
   * Returns whether the font contains a glyph for the given character.
   * @param char - The character to look up.
   * @returns True if the font contains the character; otherwise, false.
   */
  hasChar(char: string): boolean {
    const code = this.getCode(char)
    return this.font.hasChar(code)
  }

  /**
   * Returns whether the font contains a glyph for the given character code.
   * @param code - The character code to look up.
   * @returns True if the font contains the code point; otherwise, false.
   */
  hasCode(code: number): boolean {
    return this.font.hasChar(code)
  }

  /**
   * Computes the horizontal advance for a space at the requested size.
   * @param size - The requested font size.
   * @returns The width of the space advance.
   */
  getSpaceAdvance(size: number): number {
    const spaceShape = this.getCharShape(' ', size)
    if (spaceShape) {
      return spaceShape.width
    }
    return size * 0.5
  }

  /**
   * Converts a text string into a list of SHX text shapes.
   * @param text - The text to convert.
   * @param size - The requested font size.
   * @returns An array of generated SHX text shapes.
   */
  generateShapes(text: string, size: number): ShxTextShape[] {
    const shapes: ShxTextShape[] = []
    let hOffset = 0.0

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === ' ') {
        hOffset += this.getSpaceAdvance(size)
        continue
      }

      const shape = this.getCharShape(char, size)

      if (!shape) {
        hOffset += this.getSpaceAdvance(size)
        this.addUnsupportedChar(char)
        continue
      }

      shapes.push(shape.offset(new Point(hOffset, 0)))
      hOffset += shape.width
    }

    return shapes
  }

  /**
   * Returns the scale factor used by the SHX font implementation.
   * @returns Always returns 1 for SHX fonts.
   */
  getScaleFactor(): number {
    return 1
  }

  /**
   * Gets the scaled layout metrics for the font at the requested size.
   * @param size - The requested font size.
   * @returns The SHX font metrics for the given size.
   */
  getFontMetrics(size: number): ShxFontMetrics {
    return this.font.getFontMetrics(size)
  }

  /**
   * Gets the shape data for a specific character at a given size.
   * @param char - The character to look up.
   * @param size - The requested font size.
   * @returns The shape data for the character, or undefined if not found.
   */
  public getCharShape(char: string, size: number): ShxTextShape | undefined {
    const code = this.getCode(char)
    return this.getCodeShape(code, size)
  }

  /**
   * Gets the shape data for a specific character code at a given size.
   * @param code - The character code to look up.
   * @param size - The requested font size.
   * @returns The shape data for the code, or undefined if not found.
   */
  public getCodeShape(code: number, size: number): ShxTextShape | undefined {
    const cacheKey = `${code}_${size}`
    const cached = this.layoutShapeCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const layout = this.font.getLayoutCharShape(code, size)
    if (!layout || !ShxFont.hasRenderableStrokes(layout)) {
      return undefined
    }

    const shape = new ShxTextShape(code, size, layout, this)
    this.layoutShapeCache.set(cacheKey, shape)
    return shape
  }

  /**
   * Gets the shape data for a named SHX shape at the requested size.
   * @param name - The SHX shape name to look up.
   * @param size - The requested font size.
   * @returns The matching shape, or undefined if unavailable.
   */
  public getShapeByName(name: string, size: number): ShxTextShape | undefined {
    const code = this.font.getShapeCode(name)
    if (code === undefined) {
      return undefined
    }
    return this.getCodeShape(code, size)
  }

  /**
   * Checks whether a parsed SHX shape contains renderable strokes.
   * @param shape - The shape to inspect.
   * @returns True when the shape has at least one renderable segment.
   */
  private static hasRenderableStrokes(shape: ShxShape): boolean {
    if (shape.polylines.some(line => line.length >= 2)) {
      return true
    }
    return (shape.lastPoint?.x ?? 0) > 0
  }

  /**
   * Gets the fallback text shape used for missing characters.
   * @param size - The requested font size.
   * @returns The fallback shape, or undefined if it cannot be built.
   */
  public getNotFoundTextShape(size: number): ShxTextShape | undefined {
    const char = this.font.fontData.header.fontType === ShxFontType.BIGFONT ? '？' : '?'
    return this.getCharShape(char, size)
  }

  /**
   * Resolves the internal SHX character code for a given Unicode character.
   * @param char - The input character.
   * @returns The internal SHX code used for lookup.
   */
  private getCode(char: string): number {
    const cached = this.codeCache.get(char)
    if (cached !== undefined) {
      return cached
    }

    const fontType = this.font.fontData.header.fontType
    let code: number

    if (fontType === ShxFontType.BIGFONT && this.encoding) {
      const buffer = iconv.encode(char[0], this.encoding)
      code = buffer.length === 1 ? buffer[0] : (buffer[0] << 8) | buffer[1]
    } else {
      code = char.charCodeAt(0)
    }

    if (fontType === ShxFontType.BIGFONT && code >= 0x20 && code <= 0x7e) {
      const halfwidth = 0xa380 + code
      if (this.font.hasChar(halfwidth)) {
        code = halfwidth
      }
    }

    this.codeCache.set(char, code)
    return code
  }
}

