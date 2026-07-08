import { Point, resolveAdvanceWidth, ShxShape } from '@mlightcad/shx-parser'
import * as THREE from 'three'

import { BaseTextShape } from './baseTextShape'
import { ShxFont } from './shxFont'

/**
 * Represents a text shape for SHX fonts.
 * This class extends BaseTextShape to provide specific functionality for SHX fonts,
 * including shape data management and dimension calculations.
 */
export class ShxTextShape extends BaseTextShape {
  /** The shape data for this character */
  private readonly code: number
  private readonly shape: ShxShape
  private readonly font: ShxFont
  private readonly fontSize: number
  /** Lazily built geometry for this layout-ready shape instance. */
  private geometry?: THREE.BufferGeometry

  /**
   * Creates a new SHX text shape wrapper.
   * @param code - The character code represented by this shape.
   * @param fontSize - The font size used to resolve the shape advance width.
   * @param shape - The parsed SHX shape data.
   * @param font - The SHX font instance that owns the shape.
   */
  constructor(code: number, fontSize: number, shape: ShxShape, font: ShxFont) {
    super()
    this.fontSize = fontSize
    this.shape = shape
    this.font = font
    this.code = code
    this.width = resolveAdvanceWidth(shape, font.data, fontSize)
  }

  /**
   * Computes the width of the shape from its bounding box.
   * @returns The width of the shape's bounding box.
   */
  protected calcWidth() {
    const box = this.shape.bbox
    return box.maxX - box.minX
  }

  /**
   * Returns a translated copy of this shape.
   * @param offset - The offset to apply to the shape.
   * @returns A new shape shifted by the given offset.
   */
  offset(offset: Point) {
    return new ShxTextShape(this.code, this.fontSize, this.shape.offset(offset), this.font)
  }

  /**
   * Converts the text shape to a THREE.js geometry.
   * @returns A BufferGeometry representing the text shape.
   */
  toGeometry() {
    if (this.geometry != null) {
      return this.geometry
    }

    const polylines = this.shape.polylines
    const positions = []
    const indices = []
    let index = 0

    const geometry = new THREE.BufferGeometry()
    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i]

      for (let j = 0; j < line.length; j++) {
        const coord = line[j]
        positions.push(coord.x, coord.y, 0)
        if (j === line.length - 1) {
          index++
        } else {
          indices.push(index, index + 1)
          index++
        }
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    this.geometry = geometry
    return geometry
  }

  /** @inheritdoc */
  hasStrokeGeometry(): boolean {
    if (this.shape.polylines.some(line => line.length >= 2)) {
      return true
    }
    return this.width > 0
  }
}
