import * as THREE from 'three'

import { BaseTextShape } from './baseTextShape'
import { MeshFont } from './meshFont'
import {
  markMeshGlyphGeometry,
  MESH_GLYPH_CACHE_SIZE
} from './meshGlyphGeometry'

/**
 * Copies position and index into a plain BufferGeometry and drops the source.
 *
 * {@link THREE.ShapeGeometry} also allocates normals and uvs, and keeps the
 * source {@link THREE.Shape} graph alive. Vertex welding does not pay for
 * itself here: outline vertices are already unique, and the hash walk dominated
 * first-seen glyph cost.
 */
function bakeMeshPositions(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const baked = new THREE.BufferGeometry()
  const position = source.getAttribute('position')
  if (position) {
    baked.setAttribute('position', position.clone())
  }
  const index = source.getIndex()
  if (index) {
    baked.setIndex(index.clone())
  }
  source.dispose()
  return baked
}

function hasFinitePositions(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  if (!position || position.count === 0) {
    return true
  }
  const array = position.array as ArrayLike<number>
  for (let index = 0; index < array.length; index++) {
    if (!Number.isFinite(array[index])) {
      return false
    }
  }
  return true
}

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
   * Scale from the unit-size cached outline to the requested drawing height.
   */
  override get geometryScale(): number {
    return this.fontSize / MESH_GLYPH_CACHE_SIZE
  }

  /**
   * Converts the text shape to a THREE.js geometry.
   * Outlines are cached once at {@link MESH_GLYPH_CACHE_SIZE}; callers must
   * apply {@link geometryScale} when placing the glyph.
   * @returns A THREE.js BufferGeometry representing the text shape
   */
  toGeometry(): THREE.BufferGeometry {
    const code = this.char.codePointAt(0) ?? this.char.charCodeAt(0)
    let geometry = this.font.cache.getGeometry(code, MESH_GLYPH_CACHE_SIZE)
    if (geometry == null) {
      const shapes = this.font.generateShapes(this.char, MESH_GLYPH_CACHE_SIZE)
      geometry = new THREE.ShapeGeometry(shapes, 4)
      if (!hasFinitePositions(geometry)) {
        geometry.dispose()
        return new THREE.BufferGeometry()
      }
      // ShapeGeometry always builds uv and normal. Drop them before the copy
      // so the cached glyph and later merges stay position+index only.
      if (geometry.hasAttribute('uv')) {
        geometry.deleteAttribute('uv')
      }
      if (geometry.hasAttribute('normal')) {
        geometry.deleteAttribute('normal')
      }
      geometry = bakeMeshPositions(geometry)
      markMeshGlyphGeometry(geometry)
      this.font.cache.setGeometry(code, MESH_GLYPH_CACHE_SIZE, geometry)
    }
    return geometry
  }

  /** @inheritdoc */
  hasStrokeGeometry(): boolean {
    return this.isFound && this.width > 0
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
