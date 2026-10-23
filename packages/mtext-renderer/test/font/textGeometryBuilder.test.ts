import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { TextGeometryBuilder } from '../../src/font/textGeometryBuilder'

function makeIndexedLineGeometry(
  points: Array<[number, number]>
): THREE.BufferGeometry {
  const positions = new Float32Array(points.length * 3)
  const indices: number[] = []

  for (let i = 0; i < points.length; i++) {
    positions[i * 3] = points[i][0]
    positions[i * 3 + 1] = points[i][1]
    if (i < points.length - 1) {
      indices.push(i, i + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

describe('TextGeometryBuilder', () => {
  it('merges transformed indexed line geometries into one segment buffer', () => {
    const source = makeIndexedLineGeometry([
      [0, 0],
      [1, 0],
      [1, 1]
    ])
    const matrix = new THREE.Matrix4().makeTranslation(10, 20, 0)

    const merged = TextGeometryBuilder.mergeLineGeometries([
      { geometry: source, matrix }
    ])

    const positions = merged.getAttribute('position').array as Float32Array
    expect(positions).toEqual(
      new Float32Array([10, 20, 0, 11, 20, 0, 11, 20, 0, 11, 21, 0])
    )
  })

  it('merges multiple glyph entries in order', () => {
    const left = makeIndexedLineGeometry([
      [0, 0],
      [1, 0]
    ])
    const right = makeIndexedLineGeometry([
      [0, 0],
      [0, 1]
    ])

    const merged = TextGeometryBuilder.mergeLineGeometries([
      { geometry: left, matrix: new THREE.Matrix4().makeTranslation(0, 0, 0) },
      { geometry: right, matrix: new THREE.Matrix4().makeTranslation(5, 0, 0) }
    ])

    expect(merged.getAttribute('position').count).toBe(4)
  })

  it('merges mesh glyphs with affine placement and offset indices', () => {
    const tri = new THREE.BufferGeometry()
    tri.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        3
      )
    )
    tri.setIndex([0, 1, 2])

    const merged = TextGeometryBuilder.mergeMeshGeometries([
      { geometry: tri, matrix: new THREE.Matrix4().makeTranslation(10, 0, 0) },
      { geometry: tri, matrix: new THREE.Matrix4().makeTranslation(20, 0, 0) }
    ])

    const pos = merged.getAttribute('position').array as Float32Array
    expect(Array.from(pos.slice(0, 3))).toEqual([10, 0, 0])
    expect(Array.from(pos.slice(9, 12))).toEqual([20, 0, 0])
    const index = merged.getIndex()!.array as ArrayLike<number>
    expect(index[0]).toBe(0)
    expect(index[3]).toBe(3)
    expect(merged.boundingBox?.min.x).toBe(10)
    expect(merged.boundingBox?.max.x).toBe(21)
  })
})
