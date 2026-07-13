import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  estimateGeometryBytes,
  estimateStringBytes,
  formatBytes,
  getSourceByteLength
} from '../../src/memory/estimateGeometryBytes'

describe('estimateGeometryBytes', () => {
  it('returns 0 for missing geometry', () => {
    expect(estimateGeometryBytes(undefined)).toBe(0)
    expect(estimateGeometryBytes(null)).toBe(0)
  })

  it('sums attribute and index TypedArray byte lengths', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3)
    )
    geometry.setIndex([0, 1])

    // 6 floats * 4 bytes + 2 uint16 * 2 bytes (Three may use Uint16Array)
    const expected =
      geometry.getAttribute('position').array.byteLength +
      (geometry.index?.array.byteLength ?? 0)
    expect(estimateGeometryBytes(geometry)).toBe(expected)
  })
  it('returns 0 for disposed geometries', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3)
    )
    geometry.dispose()
    // Simulate Three.js marking / clearing after dispose when attributes remain
    ;(geometry as THREE.BufferGeometry & { disposed?: boolean }).disposed = true
    expect(estimateGeometryBytes(geometry)).toBe(0)
  })
})

describe('estimateStringBytes', () => {
  it('counts UTF-16 code units as 2 bytes each', () => {
    expect(estimateStringBytes(undefined)).toBe(0)
    expect(estimateStringBytes('ab')).toBe(4)
    expect(estimateStringBytes('中')).toBe(2)
  })
})

describe('getSourceByteLength', () => {
  it('reads ArrayBuffer and TypedArray sizes', () => {
    expect(getSourceByteLength(new ArrayBuffer(100))).toBe(100)
    expect(getSourceByteLength(new Uint8Array(50))).toBe(50)
    expect(getSourceByteLength({})).toBe(0)
  })
})

describe('formatBytes', () => {
  it('formats common magnitudes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})
