import { BaseFont } from './baseFont'
import { FontData } from './font'
import { MeshFont } from './meshFont'
import { ShxFont } from './shxFont'

/**
 * A singleton factory class for creating font instances.
 * This factory can create both ShxFont and MeshFont instances based on the provided font data.
 * It handles the creation of appropriate font objects based on the font type and data format.
 *
 * @example
 * ```typescript
 * const fontFactory = FontFactory.getInstance();
 * const font = fontFactory.createFont(fontData);
 * ```
 */
export class FontFactory {
  private static _instance: FontFactory

  private constructor() {}

  /**
   * Gets the singleton instance of the FontFactory
   * @returns The FontFactory instance
   */
  public static get instance(): FontFactory {
    if (!FontFactory._instance) {
      FontFactory._instance = new FontFactory()
    }
    return FontFactory._instance
  }

  /**
   * Creates a font instance based on the provided font data.
   * The type of font created (ShxFont or MeshFont) is determined by the font type.
   *
   * @param data - The font data to create the font instance from
   * @returns A new instance of either ShxFont or MeshFont
   * @throws {Error} If the font data type is not supported
   */
  public createFont(data: FontData): BaseFont {
    if (data.type === 'shx') {
      return new ShxFont(data)
    } else if (data.type === 'mesh') {
      return new MeshFont(data)
    }
    throw new Error('Unsupported font data type')
  }
}
