import {
  Point,
  ShxFont as ShxFontInternal,
  ShxFontData,
  ShxFontType
} from '@mlightcad/shx-parser'
import iconv from 'iconv-lite'

import { BaseFont } from './baseFont'
import { FontData } from './font'
import { ShxTextShape } from './shxTextShape'

/**
 * ShxFont is a class that extends BaseFont and represents a SHX font.
 * It provides methods to generate shapes for text and retrieve character shapes.
 */
export class ShxFont extends BaseFont {
  /** Internal shx font instance */
  private readonly font: ShxFontInternal
  public readonly type = 'shx'
  public readonly data: ShxFontData

  constructor(fontData: FontData) {
    super(fontData)
    this.font = new ShxFontInternal(fontData.data as ShxFontData | ArrayBuffer)
    this.data = this.font.fontData
  }

  /**
   * Return true if this font contains glyph of the specified character. Otherwise, return false.
   * @param char - The character to check
   * @returns True if this font contains glyph of the specified character. Otherwise, return false.
   */
  hasChar(char: string): boolean {
    const code = this.getCode(char)
    return this.font.hasChar(code)
  }

  /**
   * Return true if this font contains glyph of the specified character code. Otherwise, return false.
   * @param code - The character code to check
   * @returns True if this font contains glyph of the specified character code. Otherwise, return false.
   */
  hasCode(code: number): boolean {
    return this.font.hasChar(code)
  }

  generateShapes(text: string, size: number) {
    const shapes: ShxTextShape[] = []
    let hOffset = 0.0
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === ' ') {
        hOffset += size
        continue
      }
      const shape = this.getCharShape(char, size)
      if (!shape) {
        hOffset += size
        this.addUnsupportedChar(char)
        // const notFund = this.getNotFoundTextShape(size);
        // notFund && shapes.push(notFund);
        continue
      }
      shapes.push(shape.offset(new Point(hOffset, 0)))
      hOffset += shape.width
    }
    return shapes
  }

  /**
   * SHX font always has fixed scale factor 1.
   * @returns Always return value 1
   */
  getScaleFactor() {
    return 1
  }

  /**
   * Gets the shape data for a specific character at a given size.
   * If the font type is BIGFONT, please use getCodeShape to get the shape data
   * because the character code for BIGFONT isn't unicode.
   * @param char - The character to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character, or undefined if not found
   */
  public getCharShape(char: string, size: number) {
    return this.getCodeShape(this.getCode(char), size)
  }

  /**
   * Gets the shape data for a specific character code at a given size.
   * The passed code must the code stored in font instead of unicode.
   * - Unicode shx font uses unicode as character code.
   * - Bigfont uses a custom encoding for double-byte characters.
   * @param code - The character code to get the shape for
   * @param size - The desired size of the character
   * @returns The shape data for the character code, or undefined if not found
   */
  public getCodeShape(code: number, size: number) {
    const shape = this.font.getCharShape(code, size)
    return shape ? new ShxTextShape(code, size, shape, this) : undefined
  }

  /**
   * For an unsupported char, use "？" as a replacement.
   */
  public getNotFoundTextShape(size: number) {
    const char =
      this.font.fontData.header.fontType === ShxFontType.BIGFONT ? '？' : '?'
    return this.getCharShape(char, size)
  }

  /**
   * Gets encoded code of the specified character according to font character encoding
   * @param char - The character to get its code
   * @returns Returns encoded code of the specified character
   */
  private getCode(char: string) {
    const fontType = this.font.fontData.header.fontType
    if (fontType === ShxFontType.BIGFONT && this.encoding) {
      const buffer = iconv.encode(char[0], this.encoding)
      if (buffer.length === 1) {
        return buffer[0]
      } else {
        return (buffer[0] << 8) | buffer[1]
      }
    } else {
      return char.charCodeAt(0)
    }
  }
}
