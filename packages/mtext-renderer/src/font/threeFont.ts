import {
  CubicBezierCurve,
  Curve,
  EllipseCurve,
  LineCurve,
  Path,
  QuadraticBezierCurve,
  Shape,
  ShapePath,
  ShapeUtils,
  Vector2
} from 'three'
import { Font, FontData } from 'three/examples/jsm/loaders/FontLoader.js'

type Direction = 'ltr' | 'rtl' | 'tb' // text layout direction

interface PathResult {
  offsetX: number // horizontal advance after drawing the character
  path: ShapePath // ShapePath for this character
}

/**
 * Extended Font that fixes inner holes for problematic fonts like SimSun.
 * Certain characters have incorrect inner contours (holes), e.g., 面, 限, 用, 色, 8.
 */
export class ThreeFont extends Font {
  /**
   * Generates geometry shapes from the given text and size.
   *
   * Algorithm overview:
   * 1. Split the input text into individual characters.
   * 2. For each character:
   *    a. Retrieve the glyph data from the font.
   *    b. Convert the glyph outline commands into a ShapePath.
   *       - 'm' → moveTo
   *       - 'l' → lineTo
   *       - 'q' → quadraticCurveTo
   *       - 'b' → cubic bezierCurveTo
   *    c. Apply scaling to match the requested font size.
   *    d. Apply offsets for proper placement (supports multiple lines and directions).
   * 3. Handle text direction:
   *    - 'ltr': left-to-right
   *    - 'rtl': right-to-left (characters reversed)
   *    - 'tb': top-to-bottom (vertical layout)
   * 4. Collect all ShapePaths for the text.
   * 5. Convert each ShapePath into one or more Shape objects:
   *    a. Sample points along each subPath to approximate geometry.
   *    b. Determine which subPaths are outer contours and which are holes:
   *       - For each subPath, check if it is fully contained inside another polygon.
   *       - Assign the smallest containing polygon as its parent.
   *    c. Compute the relative depth of each subPath to handle nested holes.
   *    d. Reverse curves if necessary to maintain correct clockwise/counterclockwise winding:
   *       - Outer contours: CCW
   *       - Holes: CW
   *    e. Build Shape objects with holes properly assigned.
   * 6. Return the final array of Shape objects ready for geometry creation.
   *
   * This algorithm ensures that complex characters with multiple independent contours
   * (including intersecting subpaths or holes) are rendered correctly.
   *
   * @param text - input string to convert to shapes
   * @param size - font size in units (default 100)
   * @param direction - text direction ('ltr', 'rtl', 'tb')
   * @returns array of Shape objects with proper holes and contours
   */
  generateShapes(
    text: string,
    size = 100,
    direction: Direction = 'ltr'
  ): Shape[] {
    const shapes: Shape[] = []

    // Step 1: Create ShapePath objects for each character in the text
    const paths = createPaths(text, size, this.data, direction)

    // Step 2: Convert each ShapePath into Shape objects with correct holes
    paths.forEach(path => {
      shapes.push(...convertShapePath(path))
    })

    // Step 3: Return the final list of shapes
    return shapes
  }
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

/**
 * Utility function: point-in-polygon test using ray casting.
 * Determines if a point is inside a polygon.
 */
function isPointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  let inside = false
  const { x, y } = point
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y
    const xj = polygon[j].x,
      yj = polygon[j].y
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Find the smallest containing parent for each polygon/subPath.
 * Used to detect which subPaths are holes inside another contour.
 */
function findParentIndices(polys: Vector2[][]): (number | null)[] {
  const n = polys.length
  const parent: (number | null)[] = Array(n).fill(null)

  for (let i = 0; i < n; i++) {
    let bestParent: number | null = null
    let bestArea = Infinity

    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (polys[i].every(pt => isPointInPolygon(pt, polys[j]))) {
        const absArea = Math.abs(ShapeUtils.area(polys[j]))
        if (absArea < bestArea) {
          bestArea = absArea
          bestParent = j
        }
      }
    }

    parent[i] = bestParent
  }

  return parent
}

/**
 * Build a map of children subPaths for each parent.
 */
function buildChildrenMap(parent: (number | null)[]): number[][] {
  const n = parent.length
  const children: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    const p = parent[i]
    if (p !== null) children[p].push(i)
  }
  return children
}

/**
 * Find root nodes (subPaths without a parent)
 */
function findRoots(parent: (number | null)[]): number[] {
  return parent.map((p, i) => (p === null ? i : -1)).filter(i => i >= 0)
}

/**
 * Reverse curves while preserving their types.
 * Needed to fix orientation for correct hole rendering.
 */
function reverseCurvesPreserve(curves: Curve<Vector2>[]): Curve<Vector2>[] {
  const rev: Curve<Vector2>[] = []

  for (let k = curves.length - 1; k >= 0; k--) {
    const c = curves[k]
    if (c instanceof LineCurve)
      rev.push(new LineCurve(c.v2.clone(), c.v1.clone()))
    else if (c instanceof QuadraticBezierCurve)
      rev.push(
        new QuadraticBezierCurve(c.v2.clone(), c.v1.clone(), c.v0.clone())
      )
    else if (c instanceof CubicBezierCurve)
      rev.push(
        new CubicBezierCurve(
          c.v3.clone(),
          c.v2.clone(),
          c.v1.clone(),
          c.v0.clone()
        )
      )
    else if (c instanceof EllipseCurve)
      rev.push(
        new EllipseCurve(
          c.aX,
          c.aY,
          c.xRadius,
          c.yRadius,
          c.aEndAngle,
          c.aStartAngle,
          !c.aClockwise,
          c.aRotation
        )
      )
    else if (typeof c.getPoints === 'function') {
      // fallback for unknown curve type: approximate as lines
      const pts = c.getPoints(8)
      for (let p = pts.length - 1; p > 0; p--)
        rev.push(new LineCurve(pts[p].clone(), pts[p - 1].clone()))
    }
  }

  return rev
}

/**
 * Build a Shape from a Path/ShapePath, ensuring desired clockwise/counterclockwise orientation.
 * Pushes curves into the Shape.curves array.
 */
function buildShape(sp: Path, wantCCW: boolean): Shape {
  const isCCW = ShapeUtils.area(sp.getPoints(32)) > 0 // compute orientation
  const curves =
    wantCCW === isCCW ? sp.curves.slice() : reverseCurvesPreserve(sp.curves)

  const shape = new Shape()
  shape.curves.push(...curves) // push curves into the Shape
  return shape
}

/**
 * Converts a ShapePath into an array of Shape(s), correctly handling holes.
 * Works for complex paths with multiple subPaths.
 */
function convertShapePath(path: ShapePath, samplePoints = 32): Shape[] {
  const subPaths = path.subPaths
  if (!subPaths || subPaths.length === 0) return []

  // Sample points from each subPath for geometry calculations
  const polys = subPaths.map(sp => sp.getPoints(samplePoints))
  // Determine smallest containing parent for each subPath
  const parent = findParentIndices(polys)
  const children = buildChildrenMap(parent)
  const roots = findRoots(parent)

  const n = subPaths.length
  const relDepth = Array(n).fill(-1) // relative depth from root
  const rootOf = Array(n).fill(-1) // index of root for each node

  // Compute depth for each node using DFS from roots
  for (const r of roots) {
    const stack = [{ idx: r, d: 0 }]
    while (stack.length) {
      const cur = stack.pop()!
      relDepth[cur.idx] = cur.d
      rootOf[cur.idx] = r
      for (const c of children[cur.idx]) stack.push({ idx: c, d: cur.d + 1 })
    }
  }

  const shapes: Shape[] = []
  const created = new Set<number>() // track which subPaths have been processed

  // Helper: create an outer Shape with its holes
  function createOuterWithHoles(idx: number) {
    const outer = buildShape(subPaths[idx], true) // outer contour is CCW
    created.add(idx)

    // Add children as holes (CW)
    for (const ch of children[idx]) {
      if (!created.has(ch) && relDepth[ch] === relDepth[idx] + 1) {
        const hole = buildShape(subPaths[ch], false)
        outer.holes.push(hole)
        created.add(ch)
      }
    }

    shapes.push(outer)
  }

  // Create shapes starting from root subPaths
  for (const r of roots) createOuterWithHoles(r)

  // Handle remaining subPaths not yet processed
  for (let i = 0; i < n; i++) {
    if (!created.has(i)) createOuterWithHoles(i)
  }

  return shapes
}
