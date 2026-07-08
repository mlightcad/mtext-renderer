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
})
