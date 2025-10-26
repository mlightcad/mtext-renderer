import { Font, FontData as ThreeFontData } from 'three/examples/jsm/loaders/FontLoader.js'

import { BaseFont } from './baseFont'
import { FontData } from './font'
import { parseMeshFont } from './meshFontParser'
import { MeshTextShape } from './meshTextShape'

/**
 * Represents the data structure for mesh-based fonts.
 * Extends the base ThreeFontData interface with additional properties specific to mesh fonts.
 */
export interface MeshFontData extends ThreeFontData {
  /** Scale factor used to adjust the size of characters when rendering */
  scaleFactor: number
}

/**
 * Represents a mesh-based font (e.g., TTF, OTF, WOFF).
 * This class extends BaseFont to provide specific functionality for mesh fonts,
 * including character shape generation and scale factor management.
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

  /**
   * Creates a new instance of MeshFont.
   * @param data - Either a MeshFontData object containing font information or an ArrayBuffer containing raw font data
   */
  constructor(fontData: FontData) {
    super(fontData)
    const data = fontData.data as MeshFontData | ArrayBuffer
    if (data instanceof ArrayBuffer) {
      this.data = parseMeshFont(data)
    } else {
      this.data = data
    }
    this.font = new Font(this.data)
  }

  /**
   * Return true if this font contains glyph of the specified character. Otherwise, return false.
   * @param char - The character to check
   * @returns True if this font contains glyph of the specified character. Otherwise, return false.
   */
  hasChar(char: string): boolean {
    return this.data.glyphs[char] != null
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
   * Generates shapes for a text string
   * @param text - The text to generate shapes for
   * @param size - The size of the text
   * @returns Array of shapes representing the text
   */
  generateShapes(text: string, size: number) {
    return this.font.generateShapes(text, size)
  }

  /**
   * Gets the shape data for a specific character at a given size.
   * @param char - The character to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character, or undefined if not found
   */
  getCharShape(char: string, size: number) {
    const glyph = this.data.glyphs[char]
    if (!glyph) {
      this.addUnsupportedChar(char)
      return undefined
    }
    const textShape = new MeshTextShape(char, size, this)
    return textShape
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
      this.scaleFactor = this.data.scaleFactor as number
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
