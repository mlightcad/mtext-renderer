import * as THREE from 'three'

/**
 * One cached glyph geometry plus the world transform to apply at merge time.
 */
export interface TransformedLineGeometryEntry {
  /** The source line-segment geometry for a single glyph. */
  geometry: THREE.BufferGeometry
  /** The 4×4 transform matrix applied to each vertex before merging. */
  matrix: THREE.Matrix4
}

/** Reusable scratch vector for transforming vertices during geometry merge. */
const _vertex = /*@__PURE__*/ new THREE.Vector3()

/**
 * Builds a single line-segment {@link THREE.BufferGeometry} from many transformed glyph sources.
 * Avoids per-character geometry allocation before merge.
 */
export class TextGeometryBuilder {
  /**
   * Merges indexed or non-indexed line geometries into one non-indexed {@link THREE.BufferGeometry}
   * suitable for {@link THREE.LineSegments}.
   * @param entries Glyph geometries paired with their world transforms.
   * @returns A single non-indexed line geometry containing all transformed segments.
   */
  static mergeLineGeometries(
    entries: TransformedLineGeometryEntry[]
  ): THREE.BufferGeometry {
    if (entries.length === 0) {
      return new THREE.BufferGeometry()
    }

    if (entries.length === 1) {
      return TextGeometryBuilder.applyMatrixToLineGeometry(
        entries[0].geometry,
        entries[0].matrix
      )
    }

    let segmentCount = 0
    for (const entry of entries) {
      segmentCount += TextGeometryBuilder.countLineSegments(entry.geometry)
    }

    const positions = new Float32Array(segmentCount * 6)
    let writeOffset = 0

    for (const entry of entries) {
      writeOffset = TextGeometryBuilder.writeTransformedLineSegments(
        entry.geometry,
        entry.matrix,
        positions,
        writeOffset
      )
    }

    const merged = new THREE.BufferGeometry()
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return merged
  }

  /**
   * Counts how many line segments a geometry represents.
   * Indexed geometries use index pairs; non-indexed geometries use consecutive position pairs.
   * @param geometry The line geometry to inspect.
   * @returns The number of line segments (each segment is two vertices).
   */
  private static countLineSegments(geometry: THREE.BufferGeometry): number {
    const index = geometry.getIndex()
    if (index) {
      return index.count / 2
    }
    const position = geometry.getAttribute('position')
    return position ? position.count / 2 : 0
  }

  /**
   * Applies a transform matrix to a single line geometry and returns a new non-indexed copy.
   * @param geometry The source line geometry.
   * @param matrix The transform applied to every vertex.
   * @returns A new non-indexed line geometry with transformed positions.
   */
  private static applyMatrixToLineGeometry(
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4
  ): THREE.BufferGeometry {
    const segmentCount = TextGeometryBuilder.countLineSegments(geometry)
    const positions = new Float32Array(segmentCount * 6)
    TextGeometryBuilder.writeTransformedLineSegments(
      geometry,
      matrix,
      positions,
      0
    )

    const output = new THREE.BufferGeometry()
    output.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return output
  }

  /**
   * Writes transformed line-segment vertices from a source geometry into a flat position buffer.
   * Supports both indexed and non-indexed source geometries.
   * @param geometry The source line geometry.
   * @param matrix The transform applied to each vertex before writing.
   * @param output The destination `Float32Array` (xyz per vertex).
   * @param outputOffset The index in `output` at which writing begins.
   * @returns The next write offset after all segments have been written.
   */
  private static writeTransformedLineSegments(
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    output: Float32Array,
    outputOffset: number
  ): number {
    const position = geometry.getAttribute('position')
    if (!position || position.count === 0) {
      return outputOffset
    }

    const index = geometry.getIndex()
    let offset = outputOffset

    const writeVertex = (vertexIndex: number) => {
      _vertex.fromBufferAttribute(position, vertexIndex)
      _vertex.applyMatrix4(matrix)
      output[offset++] = _vertex.x
      output[offset++] = _vertex.y
      output[offset++] = _vertex.z
    }

    if (index) {
      for (let i = 0; i < index.count; i += 2) {
        writeVertex(index.getX(i))
        writeVertex(index.getX(i + 1))
      }
      return offset
    }

    for (let i = 0; i < position.count; i += 2) {
      writeVertex(i)
      writeVertex(i + 1)
    }
    return offset
  }

  /**
   * Merges indexed mesh glyphs into one indexed triangle geometry, applying each
   * glyph matrix while copying vertices.
   *
   * One write pass replaces per-glyph `clone` + `applyMatrix4` followed by a
   * second copy inside `mergeGeometries`.
   *
   * @param entries Cached glyph geometries paired with their placement matrices.
   * @returns A single indexed mesh geometry. Empty when `entries` is empty.
   */
  static mergeMeshGeometries(
    entries: TransformedLineGeometryEntry[]
  ): THREE.BufferGeometry {
    if (entries.length === 0) {
      return new THREE.BufferGeometry()
    }

    let vertexCount = 0
    let indexCount = 0
    for (const entry of entries) {
      const position = entry.geometry.getAttribute('position')
      if (!position || position.count === 0) {
        continue
      }
      vertexCount += position.count
      const index = entry.geometry.getIndex()
      indexCount += index ? index.count : position.count
    }

    if (vertexCount === 0) {
      return new THREE.BufferGeometry()
    }

    const positions = new Float32Array(vertexCount * 3)
    const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array
    const indices = new IndexArray(indexCount)

    let vertexBase = 0
    let indexWrite = 0
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity

    for (const entry of entries) {
      const position = entry.geometry.getAttribute('position')
      if (!position || position.count === 0) {
        continue
      }

      const written = TextGeometryBuilder.writeTransformedMeshPositions(
        position,
        entry.matrix,
        positions,
        vertexBase,
        (x, y, z) => {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (z < minZ) minZ = z
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
          if (z > maxZ) maxZ = z
        }
      )

      const index = entry.geometry.getIndex()
      if (index) {
        const source = index.array as ArrayLike<number>
        for (let i = 0; i < index.count; i++) {
          indices[indexWrite++] = source[i] + vertexBase
        }
      } else {
        for (let i = 0; i < position.count; i++) {
          indices[indexWrite++] = vertexBase + i
        }
      }

      vertexBase += written
    }

    const merged = new THREE.BufferGeometry()
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    merged.setIndex(new THREE.BufferAttribute(indices, 1))
    merged.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    )
    return merged
  }

  /**
   * Writes `position` transformed by `matrix` into `output` at `vertexBase`.
   * Affine placement matrices keep `w` at 1; the perspective term matches
   * {@link THREE.Vector3.applyMatrix4} for any other matrix.
   */
  private static writeTransformedMeshPositions(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    matrix: THREE.Matrix4,
    output: Float32Array,
    vertexBase: number,
    expandBounds: (x: number, y: number, z: number) => void
  ): number {
    const e = matrix.elements
    const count = position.count
    const base = vertexBase * 3
    const fast =
      position instanceof THREE.BufferAttribute &&
      position.itemSize === 3 &&
      !position.normalized &&
      position.array instanceof Float32Array

    if (fast) {
      const src = position.array as Float32Array
      for (let i = 0; i < count; i++) {
        const s = i * 3
        const x = src[s]
        const y = src[s + 1]
        const z = src[s + 2]
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
        const ox = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
        const oy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
        const oz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
        const d = base + s
        output[d] = ox
        output[d + 1] = oy
        output[d + 2] = oz
        expandBounds(ox, oy, oz)
      }
      return count
    }

    for (let i = 0; i < count; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
      const ox = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
      const oy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
      const oz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
      const d = base + i * 3
      output[d] = ox
      output[d + 1] = oy
      output[d + 2] = oz
      expandBounds(ox, oy, oz)
    }
    return count
  }
}
