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
}
