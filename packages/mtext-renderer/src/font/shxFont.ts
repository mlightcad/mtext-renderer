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
import {
  type FontMemoryStats,
  SHX_PARSED_FONT_OVERHEAD} from '../memory/types'
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
    if (code === ShxFont.NOT_ENCODABLE) {
      return false
    }
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

    // Iterate by Unicode code point so supplementary-plane characters stay intact.
    for (const char of text) {
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
    if (code === ShxFont.NOT_ENCODABLE) {
      return undefined
    }
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
   * Estimates memory used by this SHX font (parsed tables + layout/geometry caches).
   */
  estimateMemoryUsage(): FontMemoryStats {
    const charGeometryCache = this.cache.getStats()
    let layoutBytes = 0
    for (const shape of this.layoutShapeCache.values()) {
      layoutBytes += shape.estimateMemoryBytes()
    }
    const shxLayoutCache = {
      entries: this.layoutShapeCache.size,
      maxEntries: this.layoutShapeCache.capacity,
      estimatedBytes: layoutBytes
    }
    const parsedFontEstimatedBytes = Math.round(
      this.sourceByteLength * SHX_PARSED_FONT_OVERHEAD
    )
    const estimatedBytes =
      parsedFontEstimatedBytes +
      charGeometryCache.estimatedBytes +
      shxLayoutCache.estimatedBytes

    return {
      names: Array.from(this.names),
      type: 'shx',
      sourceByteLength: this.sourceByteLength,
      parsedFontEstimatedBytes,
      charGeometryCache,
      shxLayoutCache,
      estimatedBytes
    }
  }

  /**
   * Clears layout/code caches and disposes retained shape geometries.
   */
  dispose(): void {
    for (const shape of this.layoutShapeCache.values()) {
      shape.dispose()
    }
    this.layoutShapeCache.clear()
    this.codeCache.clear()
    super.dispose()
  }

  /**
   * Sentinel returned by {@link getCode} when `char` has no representation
   * in this BIGFONT's legacy encoding. Never a real SHX/BIGFONT code point
   * (those are non-negative), so callers can distinguish "cannot encode"
   * from "encodes to some rarely-used code".
   */
  private static readonly NOT_ENCODABLE = -1

  /**
   * Resolves the internal SHX character code for a given Unicode character.
   *
   * For BIGFONT fonts, `char` is converted through a legacy encoding (e.g.
   * GBK) via `iconv-lite`. Characters outside that encoding's repertoire
   * (math/symbol glyphs like the diameter sign, U+2205) are not rejected by
   * `iconv.encode` — it silently substitutes a replacement byte (commonly
   * ASCII `?`, 0x3F). Left unchecked, that byte resolves to the BIGFONT's
   * own, perfectly valid `?` glyph, so `hasChar`/`getCharShape` report a
   * false positive: the caller believes this font renders the character,
   * when it actually renders an unrelated question mark. That masked the
   * real GDT/symbol-font fallback for diameter dimension text stored as a
   * literal U+2205 (mlightcad/cad-viewer#473) — the correct glyph exists in
   * `amgdt.shx`, but the fallback chain in {@link FontManager} never got a
   * chance because this font's bogus "yes" won first.
   *
   * A decode-of-the-encoded-bytes round trip catches this: encoding is lossy
   * exactly when it can't recover the original character.
   *
   * @param char - The input character.
   * @returns The internal SHX code used for lookup, or {@link NOT_ENCODABLE}
   * when `char` cannot be represented in this font's encoding.
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
      if (iconv.decode(buffer, this.encoding) !== char[0]) {
        this.codeCache.set(char, ShxFont.NOT_ENCODABLE)
        return ShxFont.NOT_ENCODABLE
      }
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
