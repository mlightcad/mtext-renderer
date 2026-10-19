import { BufferGeometry, Float32BufferAttribute, ShapePath } from 'three'
import { Font, FontData } from 'three/examples/jsm/loaders/FontLoader.js'

import { MESH_GLYPH_CURVE_SEGMENTS } from './meshGlyphGeometry'

type Direction = 'ltr' | 'rtl' | 'tb' // text layout direction

interface PathResult {
  offsetX: number // horizontal advance after drawing the character
  path: ShapePath // ShapePath for this character
}

/**
 * Font used for mesh glyphs.
 *
 * Filled outlines come from {@link Font.generateShapes}, which delegates to
 * `ShapePath.toShapes()`. That path correctly classifies holes for fonts such
 * as SimSun (面, 限, 用, 色, 8) starting with three.js r185 (0.185.1).
 *
 * Stroke geometry is still built here: it only needs sampled contours, not
 * hole classification.
 */
export class ThreeFont extends Font {
  /**
   * Samples glyph contours into line-segment geometry without hole detection
   * or triangulation.
   *
   * @param text - input string to convert to strokes
   * @param size - font size in units (default 100)
   * @param direction - text direction ('ltr', 'rtl', 'tb')
   * @param curveSegments - samples per curve (same meaning as ShapeGeometry)
   * @returns a BufferGeometry of indexed line pairs suitable for LineSegments
   */
  generateStrokeGeometry(
    text: string,
    size = 100,
    direction: Direction = 'ltr',
    curveSegments = MESH_GLYPH_CURVE_SEGMENTS
  ): BufferGeometry {
    const paths = createPaths(text, size, this.data, direction)
    return shapePathsToLineGeometry(paths, curveSegments)
  }
}

/**
 * Converts ShapePath contours into indexed line-segment geometry.
 * Each sub-path is sampled and closed if the first and last points differ.
 */
function shapePathsToLineGeometry(
  paths: ShapePath[],
  curveSegments: number
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let vertex = 0
  const closeEps = 1e-8

  for (const path of paths) {
    for (const subPath of path.subPaths) {
      const pts = subPath.getPoints(curveSegments)
      if (pts.length < 2) continue
      const start = vertex
      for (const p of pts) {
        positions.push(p.x, p.y, 0)
        vertex++
      }
      const first = pts[0]
      const last = pts[pts.length - 1]
      const alreadyClosed =
        Math.abs(first.x - last.x) <= closeEps &&
        Math.abs(first.y - last.y) <= closeEps
      for (let i = 0; i < pts.length - 1; i++) {
        indices.push(start + i, start + i + 1)
      }
      if (!alreadyClosed) {
        indices.push(vertex - 1, start)
      }
    }
  }

  const geometry = new BufferGeometry()
  if (positions.length === 0) {
    return geometry
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/**
 * Creates ShapePath objects for a string of text.
 * Handles text layout direction and line breaks.
 */
function createPaths(
  text: string,
  size: number,
  data: FontData,
  direction: Direction = 'ltr'
): ShapePath[] {
  const chars = Array.from(text) // split text into individual characters
  const scale = size / data.resolution // scale glyphs to requested size
  const lineHeight =
    (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) *
    scale // compute line height based on font metrics

  const paths: ShapePath[] = []
  let offsetX = 0,
    offsetY = 0

  // Reverse character order for RTL or vertical text
  if (direction === 'rtl' || direction === 'tb') {
    chars.reverse()
  }

  for (const char of chars) {
    if (char === '\n') {
      // line break: reset X and move Y
      offsetX = 0
      offsetY -= lineHeight
    } else {
      // create ShapePath for this character
      const ret = createPath(char, scale, offsetX, offsetY, data)
      if (!ret) continue // skip invalid glyphs

      if (direction === 'tb') {
        // vertical text: move down by ascender
        offsetX = 0
        offsetY += data.ascender * scale
      } else {
        // horizontal text: move forward by glyph advance
        offsetX += ret.offsetX
      }

      paths.push(ret.path)
    }
  }

  return paths
}

/**
 * Creates a ShapePath for a single character.
 * Parses the glyph outline commands and builds a ShapePath.
 */
function createPath(
  char: string,
  scale: number,
  offsetX: number,
  offsetY: number,
  data: FontData
): PathResult | undefined {
  const glyph = data.glyphs[char] || data.glyphs['?'] // fallback to '?'
  if (!glyph) {
    console.error(
      `THREE.Font: character "${char}" does not exist in font family ${data.familyName}.`
    )
    return undefined
  }

  const path = new ShapePath()

  if (glyph.o) {
    const outline = glyph.o.split(' ') // outline commands separated by space
    let i = 0
    while (i < outline.length) {
      const action = outline[i++]
      let x: number,
        y: number,
        cpx: number,
        cpy: number,
        cpx1: number,
        cpy1: number,
        cpx2: number,
        cpy2: number

      switch (action) {
        case 'm': // moveTo
          x = parseFloat(outline[i++]) * scale + offsetX
          y = parseFloat(outline[i++]) * scale + offsetY
          path.moveTo(x, y)
          break
        case 'l': // lineTo
          x = parseFloat(outline[i++]) * scale + offsetX
          y = parseFloat(outline[i++]) * scale + offsetY
          path.lineTo(x, y)
          break
        case 'q': // quadraticCurveTo
          cpx = parseFloat(outline[i++]) * scale + offsetX
          cpy = parseFloat(outline[i++]) * scale + offsetY
          cpx1 = parseFloat(outline[i++]) * scale + offsetX
          cpy1 = parseFloat(outline[i++]) * scale + offsetY
          path.quadraticCurveTo(cpx1, cpy1, cpx, cpy)
          break
        case 'b': // cubic Bezier curve
          cpx = parseFloat(outline[i++]) * scale + offsetX
          cpy = parseFloat(outline[i++]) * scale + offsetY
          cpx1 = parseFloat(outline[i++]) * scale + offsetX
          cpy1 = parseFloat(outline[i++]) * scale + offsetY
          cpx2 = parseFloat(outline[i++]) * scale + offsetX
          cpy2 = parseFloat(outline[i++]) * scale + offsetY
          path.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, cpx, cpy)
          break
      }
    }
  }

  return { offsetX: glyph.ha * scale, path } // return glyph advance and path
}
