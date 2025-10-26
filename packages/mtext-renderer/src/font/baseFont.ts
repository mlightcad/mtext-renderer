import { BaseTextShape } from './baseTextShape'
import { CharGeometryCache } from './charGeometryCache'
import { FontData, FontType } from './font'

/**
 * Abstract base class for font implementations.
 * Provides common functionality and interface for font handling.
 * This class defines the core interface that all font types must implement.
 */
export abstract class BaseFont {
  /** The type of font (shx or mesh) */
  public abstract readonly type: FontType
  /**
   * The parsed font data. Different types of fonts have different data structures.
   * This data is used to render characters and calculate metrics.
   */
  public abstract readonly data: unknown
  /**
   * Font names. One font may have multiple names.
   */
  public names: Set<string> = new Set()
  /**
   * Encoding used by character code. Please refer to the following link for encoding name.
   * https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings
   */
  public encoding?: string;
  /**
   * Caching of font character geometries to improve text rendering performance.
   */
  public cache: CharGeometryCache

  constructor(fontData: FontData) {
    this.encoding = fontData.encoding
    fontData.alias.forEach(name => this.names.add(name))
    this.cache = new CharGeometryCache()
  }

  /**
   * Return true if this font contains glyph of the specified character. Otherwise, return false.
   * @param char - The character to check
   * @returns True if this font contains glyph of the specified character. Otherwise, return false.
   */
  abstract hasChar(char: string): boolean

  /**
   * Return true if this font contains glyph of the specified character code. Otherwise, return false.
   * @param code - The character code to check
   * @returns True if this font contains glyph of the specified character code. Otherwise, return false.
   */
  abstract hasCode(code: number): boolean

  /**
   * Record of characters that are not supported by this font.
   * Maps character strings to their occurrence count.
   * Used for tracking and reporting unsupported characters.
   */
  public unsupportedChars: Record<string, number> = {}

  /**
   * Gets the shape data for a specific character at a given size.
   * @param char - The character to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character, or undefined if not found
   */
  abstract getCharShape(char: string, size: number): BaseTextShape | undefined

  /**
   * Gets the shape data for a specific character code at a given size.
   * @param code - The character code to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character code, or undefined if not found
   */
  abstract getCodeShape(code: number, size: number): BaseTextShape | undefined

  /**
   * Gets the scale factor for this font.
   * This is used to adjust the size of characters when rendering.
   * @returns The scale factor as a number
   */
  abstract getScaleFactor(): number

  /**
   * Gets the shape to display when a character is not found in the font.
   * @param size - The desired size of the not found shape
   * @returns The shape data for the not found indicator, or undefined if not available
   */
  abstract getNotFoundTextShape(size: number): BaseTextShape | undefined

  /**
   * Records an unsupported character in the font.
   * Increments the count for the given character in unsupportedChars.
   * @param char - The unsupported character to record
   */
  protected addUnsupportedChar(char: string) {
    if (!this.unsupportedChars[char]) {
      this.unsupportedChars[char] = 0
    }
    this.unsupportedChars[char]++
  }
}
