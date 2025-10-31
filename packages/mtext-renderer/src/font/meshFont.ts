import { Font as OpenTypeFont,parse } from 'opentype.js'
import {
  Font,
  FontData as ThreeFontData
} from 'three/examples/jsm/loaders/FontLoader.js'

import { BaseFont } from './baseFont'
import { FontData } from './font'
import { MeshTextShape } from './meshTextShape'

interface MeshGlyph {
  ha: number
  x_min: number
  x_max: number
  o?: string | undefined
}

/**
 * Represents the data structure for mesh-based fonts.
 * Extends the base ThreeFontData interface with additional properties specific to mesh fonts.
 */
export interface MeshFontData extends ThreeFontData {
  /** A map of glyphs keyed by character */
  glyphs: Record<string, MeshGlyph>
  /** The full font family name */
  familyName: string
  /** The font ascender */
  ascender: number
  /** The font descender */
  descender: number
  /** Underline position in font units */
  underlinePosition: number
  /** Underline thickness in font units */
  underlineThickness: number
  /** Font bounding box */
  boundingBox: { xMin: number; xMax: number; yMin: number; yMax: number }
  /** Font resolution (usually unitsPerEm) */
  resolution: number
  /** Scale factor used to adjust the size of characters when rendering */
  scaleFactor: number
  /** Original font information table */
  original_font_information: Record<string, string>
}

/**
 * Simple Least Recently Used (LRU) cache for glyphs.
 * Prevents unbounded memory growth when many glyphs are loaded lazily.
 */
class LRUCache<K, V> {
  private maxSize: number
  private map: Map<K, V>

  constructor(maxSize = 512) {
    this.maxSize = maxSize
    this.map = new Map()
  }

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value) {
      // Refresh the key’s position to mark it as recently used
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      // Evict least recently used entry
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey)
      }
    }
    this.map.set(key, value)
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  clear() {
    this.map.clear()
  }
}

/**
 * Represents a mesh-based font (e.g., TTF, OTF, WOFF).
 * This class extends BaseFont to provide specific functionality for mesh fonts,
 * including character shape generation, scale factor management, and
 * **lazy glyph loading** to reduce memory consumption.
 */
export class MeshFont extends BaseFont {
  /** Scale factor used to adjust the size of characters */
  protected scaleFactor?: number
  /** Three.js font instance used for rendering */
  public readonly font: Font
  /** The type of font (always 'mesh' for this class) */
  public readonly type = 'mesh'
  /** The parsed font data */
  public readonly data: MeshFontData

  /** Internal opentype.js font instance used for on-demand glyph parsing */
  private readonly opentypeFont: OpenTypeFont
  /** Glyph cache to limit memory usage */
  private readonly glyphCache = new LRUCache<string, MeshGlyph>(512)

  /**
   * Creates a new instance of MeshFont.
   * @param fontData - Either a MeshFontData object containing font information or an ArrayBuffer containing raw font data
   */
  constructor(fontData: FontData) {
    super(fontData)
    const data = fontData.data as ArrayBuffer
    if (data instanceof ArrayBuffer) {
      const parsed = this.parseMeshFont(data)
      this.data = parsed.data
      this.opentypeFont = parsed.font
    } else {
      throw new Error(
        'Invalid font cache data. Please remove font cache database named \'mlightcad\' in IndexedDB and try again!'
      )
    }

    this.font = new Font(this.data)
  }

  /**
   * Parses a mesh font from raw binary data.
   * This function converts raw font data (e.g., TTF, OTF, WOFF) into a MeshFontData object
   * that can be used by the MeshFont class.
   *
   * @param data - The raw font data as an ArrayBuffer
   * @returns An object containing the opentype font and parsed metadata
   */
  private parseMeshFont(data: ArrayBuffer) {
    const font = parse(data)
    const round = Math.round

    // Use character 'A' to calculate scale factor
    const scaleGlyph = font.charToGlyph('A')
    const scaleFactor = scaleGlyph
      ? font.unitsPerEm / (scaleGlyph.yMax || font.unitsPerEm)
      : 1

    const meshData: MeshFontData = {
      glyphs: {}, // Lazy loaded later
      familyName: font.getEnglishName('fullName'),
      ascender: round(font.ascender),
      descender: round(font.descender),
      underlinePosition: font.tables.post.underlinePosition,
      underlineThickness: font.tables.post.underlineThickness,
      boundingBox: {
        xMin: font.tables.head.xMin,
        xMax: font.tables.head.xMax,
        yMin: font.tables.head.yMin,
        yMax: font.tables.head.yMax
      },
      resolution: font.unitsPerEm || 1000,
      scaleFactor: scaleFactor,
      original_font_information: font.tables.name
    }

    return { font, data: meshData }
  }

  /**
   * Return true if this font contains glyph of the specified character. Otherwise, return false.
   * @param char - The character to check
   * @returns True if this font contains glyph of the specified character. Otherwise, return false.
   */
  hasChar(char: string): boolean {
    return this.opentypeFont.hasChar(char)
  }

  /**
   * Return true if this font contains glyph of the specified character code. Otherwise, return false.
   * @param code - The character code to check
   * @returns True if this font contains glyph of the specified character code. Otherwise, return false.
   */
  hasCode(code: number): boolean {
    return this.hasChar(String.fromCodePoint(code))
  }

  /**
   * Loads glyph data lazily when requested.
   * Parsed glyphs are cached in an LRU cache to limit memory usage.
   * @param char - The character whose glyph should be loaded
   */
  private _loadGlyphIfNeeded(char: string) {
    if (this.data.glyphs[char] || !this.opentypeFont) return

    const cached = this.glyphCache.get(char)
    if (cached) {
      this.data.glyphs[char] = cached
      return
    }

    const glyph = this.opentypeFont.charToGlyph(char)
    if (!glyph || !glyph.path) return

    const round = Math.round
    const token = {
      ha: round(glyph.advanceWidth ?? 0),
      x_min: round(glyph.xMin ?? 0),
      x_max: round(glyph.xMax ?? 0),
      o: ''
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    glyph.path.commands.forEach((command: any) => {
      let t = command.type.toLowerCase()
      if (t === 'c') t = 'b'
      token.o += t + ' '
      if (command.x !== undefined && command.y !== undefined)
        token.o += round(command.x) + ' ' + round(command.y) + ' '
      if (command.x1 !== undefined && command.y1 !== undefined)
        token.o += round(command.x1) + ' ' + round(command.y1) + ' '
      if (command.x2 !== undefined && command.y2 !== undefined)
        token.o += round(command.x2) + ' ' + round(command.y2) + ' '
    })

    this.data.glyphs[char] = token
    this.glyphCache.set(char, token)
  }

  /**
   * Generates shapes for a text string
   * @param text - The text to generate shapes for
   * @param size - The size of the text
   * @returns Array of shapes representing the text
   */
  generateShapes(text: string, size: number) {
    for (const char of text) {
      this._loadGlyphIfNeeded(char)
    }
    return this.font.generateShapes(text, size)
  }

  /**
   * Gets the shape data for a specific character at a given size.
   * @param char - The character to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character, or undefined if not found
   */
  getCharShape(char: string, size: number) {
    this._loadGlyphIfNeeded(char)
    const glyph = this.data.glyphs[char]
    if (!glyph) {
      this.addUnsupportedChar(char)
      return undefined
    }
    return new MeshTextShape(char, size, this)
  }

  /**
   * Gets the shape data for a specific character unicode at a given size.
   * @param code - The character unicode to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character unicode, or undefined if not found
   */
  public getCodeShape(code: number, size: number) {
    return this.getCharShape(String.fromCodePoint(code), size)
  }

  /**
   * Gets the scale factor for this font.
   * This is used to adjust the size of characters when rendering.
   * @returns The scale factor as a number
   */
  getScaleFactor() {
    if (this.scaleFactor == null) {
      this.scaleFactor = this.data.scaleFactor
      return this.scaleFactor
    }
    return this.scaleFactor
  }

  /**
   * Gets the shape to display when a character is not found in the font.
   * Uses "?" as a replacement character.
   * @param size - The desired size of the not found shape
   * @returns The shape data for the not found indicator
   */
  getNotFoundTextShape(size: number) {
    return new MeshTextShape('?', size, this)
  }
}
