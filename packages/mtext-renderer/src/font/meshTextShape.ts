import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BaseTextShape } from './baseTextShape'
import { MeshFont } from './meshFont'

const _tmp = new THREE.Vector2()

/**
 * Represents a text shape for mesh-based fonts (e.g., TTF, OTF, WOFF).
 * This class extends BaseTextShape to provide specific functionality for mesh fonts,
 * including 3D geometry generation and character width calculation.
 */
export class MeshTextShape extends BaseTextShape {
  /**
   * Flag to indicate whether the character is found in the font.
   * Used to track if the character exists in the font's glyph set.
   */
  public isFound = false
  private readonly char: string
  private readonly font: MeshFont
  private readonly fontSize: number

  constructor(char: string, fontSize: number, font: MeshFont) {
    super()
    this.char = char
    this.fontSize = fontSize
    this.font = font
    this.width = this.getCharWidth(char, fontSize, font)
  }

  /**
   * Converts the text shape to a THREE.js geometry.
   * This is used for 3D rendering of the text.
   * @returns A THREE.js BufferGeometry representing the text shape
   */
  toGeometry(): THREE.BufferGeometry {
    let geometry = this.font.cache.getGeometry(
      this.char.charCodeAt(0),
      this.fontSize
    )
    if (geometry == null) {
      const shapes = this.font.generateShapes(this.char, this.fontSize)
      geometry = new THREE.ShapeGeometry(shapes)
      return mergeVertices(geometry, 1e-6)
    }
    return geometry
  }

  /**
   * Calculates the width of a character in the font.
   * @param char - The character to calculate width for
   * @param fontSize - The size of the font in pixels
   * @param font - The mesh font to use
   * @returns The width of the character in pixels
   */
  private getCharWidth(char: string, fontSize: number, font: MeshFont) {
    const glyph = font.data.glyphs[char]
    if (!glyph) {
      this.isFound = false
      return 0
    }
    this.isFound = true
    return (glyph.ha * fontSize) / font.data.resolution
  }
}
