import { Shape, ShapePath, ShapeUtils, Vector2 } from 'three'
import { Font, FontData } from 'three/examples/jsm/loaders/FontLoader.js'

type Direction = 'ltr' | 'rtl' | 'tb'

interface PathResult {
  offsetX: number
  path: ShapePath
}

/**
 * Extended Font that fixes inner holes for problematic fonts like SimSun.
 * For example, shapes created for characters 面, 限, 用, 色, 8 are wrong.
 */
export class ThreeFont extends Font {
  /**
   * Generates geometry shapes from the given text and size.
   * Fixes winding of inner contours so holes render correctly.
   */
  generateShapes(text: string, size = 100, direction: Direction = 'ltr'): Shape[] {
    const shapes: Shape[] = []
    const paths = createPaths(text, size, this.data, direction)
    paths.forEach(path => {
      shapes.push(...convertPathToShapes(path))
    })
    return shapes
  }
}

/**
 * Creates shapes for a string of text.
 */
function createPaths(
  text: string,
  size: number,
  data: FontData,
  direction: Direction = 'ltr'
): ShapePath[] {
  const chars = Array.from(text)
  const scale = size / data.resolution
  const lineHeight =
    (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) *
    scale

  const paths: ShapePath[] = []
  let offsetX = 0,
    offsetY = 0

  if (direction === 'rtl' || direction === 'tb') {
    chars.reverse()
  }

  for (const char of chars) {
    if (char === '\n') {
      offsetX = 0
      offsetY -= lineHeight
    } else {
      const ret = createPath(char, scale, offsetX, offsetY, data)
      if (!ret) continue // skip invalid glyphs

      if (direction === 'tb') {
        offsetX = 0
        offsetY += data.ascender * scale
      } else {
        offsetX += ret.offsetX
      }

      paths.push(ret.path)
    }
  }

  return paths
}

/**
 * Creates a ShapePath for a single character.
 */
function createPath(
  char: string,
  scale: number,
  offsetX: number,
  offsetY: number,
  data: FontData
): PathResult | undefined {
  const glyph = data.glyphs[char] || data.glyphs['?']
  if (!glyph) {
    console.error(
      `THREE.Font: character "${char}" does not exist in font family ${data.familyName}.`
    )
    return undefined
  }

  const path = new ShapePath()
  if (glyph.o) {
    const outline = glyph.o.split(' ')
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
        case 'b': // bezierCurveTo
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

  return { offsetX: glyph.ha * scale, path }
}


/**
 * Returns true if the point is inside the polygon (ray-casting method)
 * @param point Vector2
 * @param polygon Array<Vector2>
 */
function isPointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  let inside = false
  const x = point.x
  const y = point.y
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y

    const intersect = ((yi > y) !== (yj > y)) &&
                      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }

  return inside
}

function convertPathToShapes(path: ShapePath): Shape[] {
  const subPaths = path.subPaths
  if (!subPaths || subPaths.length === 0) return []

  // Get points of all subpaths
  const subPathPoints = subPaths.map(sp => sp.getPoints())

  // Sort by absolute area descending
  const indices = subPathPoints.map((pts, i) => i)
  indices.sort((a, b) => Math.abs(ShapeUtils.area(subPathPoints[b])) - Math.abs(ShapeUtils.area(subPathPoints[a])))

  const shapes: Shape[] = []

  // Track which subpaths are already assigned
  const assigned = new Set<number>()

  indices.forEach(i => {
    if (assigned.has(i)) return

    const outerPoints = subPathPoints[i]
    const shape = new Shape()
    subPaths[i].curves.forEach(curve => shape.curves.push(curve))
    assigned.add(i)

    // Find inner contours fully inside this outer contour
    indices.forEach(j => {
      if (i === j || assigned.has(j)) return

      const innerPoints = subPathPoints[j]
      if (isPointInPolygon(innerPoints[0], outerPoints)) {
        const hole = new Shape()
        subPaths[j].curves.forEach(curve => hole.curves.push(curve))
        shape.holes.push(hole)
        assigned.add(j)
      }
    })

    shapes.push(shape)
  })

  return shapes
}