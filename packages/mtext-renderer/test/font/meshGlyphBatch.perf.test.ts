import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { describe, expect, it } from 'vitest'

import { TextGeometryBuilder } from '../../src/font/textGeometryBuilder'

function makeGlyph(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.2, 0.8, 0.8, 0.9, 1, 0.2)
  shape.bezierCurveTo(1.2, -0.4, 0.4, -0.2, 0, 0)
  const hole = new THREE.Path()
  hole.moveTo(0.35, 0.2)
  hole.bezierCurveTo(0.45, 0.45, 0.7, 0.45, 0.75, 0.2)
  hole.bezierCurveTo(0.7, 0.05, 0.4, 0.05, 0.35, 0.2)
  shape.holes.push(hole)

  const geometry = new THREE.ShapeGeometry(shape, 8)
  geometry.deleteAttribute('uv')
  geometry.deleteAttribute('normal')
  return geometry
}

function placeEntries(geometry: THREE.BufferGeometry, copies: number) {
  const entries = []
  for (let i = 0; i < copies; i++) {
    const matrix = new THREE.Matrix4()
    matrix.makeScale(2.5, 2.5, 1)
    matrix.setPosition((i % 40) * 1.2, -Math.floor(i / 40) * 3, 0)
    if (i % 5 === 0) {
      const shear = new THREE.Matrix4().set(
        1, 0.2, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      )
      matrix.multiply(shear)
    }
    entries.push({ geometry, matrix })
  }
  return entries
}

function mergeByClone(
  entries: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>
) {
  const clones = entries.map(entry => {
    const geometry = entry.geometry.clone()
    geometry.applyMatrix4(entry.matrix)
    return geometry
  })
  const merged = mergeGeometries(clones)
  for (const geometry of clones) geometry.dispose()
  if (!merged) {
    throw new Error('mergeGeometries returned null')
  }
  return merged
}

function medianMs(fn: () => void, runs = 5) {
  fn()
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]!
}

describe('mesh glyph batch', () => {
  it('matches clone-and-merge vertex positions', () => {
    const glyph = makeGlyph()
    const entries = placeEntries(glyph, 12)
    const expected = mergeByClone(entries)
    const actual = TextGeometryBuilder.mergeMeshGeometries(entries)

    const expectedPosition = expected.getAttribute('position')
    const actualPosition = actual.getAttribute('position')
    expect(actualPosition.count).toBe(expectedPosition.count)
    expect(actual.getIndex()?.count).toBe(expected.getIndex()?.count)

    const expectedArray = expectedPosition.array as Float32Array
    const actualArray = actualPosition.array as Float32Array
    for (let i = 0; i < expectedArray.length; i++) {
      expect(actualArray[i]).toBeCloseTo(expectedArray[i], 4)
    }

    expected.dispose()
    actual.dispose()
    glyph.dispose()
  })

  it('uses Uint32 indices once a batch exceeds 65535 vertices', () => {
    const count = 40_000
    const positions = new Float32Array(count * 3)
    const indices = new Uint32Array(count)
    for (let i = 0; i < count; i++) indices[i] = i

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    const merged = TextGeometryBuilder.mergeMeshGeometries([
      { geometry, matrix: new THREE.Matrix4() },
      {
        geometry,
        matrix: new THREE.Matrix4().makeTranslation(1, 0, 0)
      }
    ])

    expect(merged.getAttribute('position').count).toBe(count * 2)
    expect(merged.getIndex()?.array).toBeInstanceOf(Uint32Array)
    expect(merged.getIndex()?.getX(count)).toBe(count)
    merged.dispose()
    geometry.dispose()
  })

  it('stays faster than cloning every glyph before mergeGeometries', () => {
    const glyph = makeGlyph()
    expect(glyph.getAttribute('position').count).toBeGreaterThan(20)
    const entries = placeEntries(glyph, 800)

    const clonedMs = medianMs(() => {
      mergeByClone(entries).dispose()
    })
    const batchedMs = medianMs(() => {
      TextGeometryBuilder.mergeMeshGeometries(entries).dispose()
    })

    console.log(
      `[mesh-batch] clone+merge ${clonedMs.toFixed(1)} ms, single pass ${batchedMs.toFixed(1)} ms`
    )
    expect(batchedMs).toBeLessThan(clonedMs * 0.8)

    glyph.dispose()
  })
})
