import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { CharGeometryCache } from '../../src/font/charGeometryCache'

function makeLineGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3)
  )
  geometry.setIndex([0, 1])
  return geometry
}

describe('CharGeometryCache', () => {
  it('stores and retrieves geometry by code and size', () => {
    const cache = new CharGeometryCache()
    const geometry = makeLineGeometry()

    cache.setGeometry(65, 16, geometry)
    expect(cache.getGeometry(65, 16)).toBe(geometry)
    expect(cache.hasGeometry(65, 16)).toBe(true)
  })

  it('disposes evicted geometries when the LRU capacity is exceeded', () => {
    const cache = new CharGeometryCache(1)
    const first = makeLineGeometry()
    const second = makeLineGeometry()
    const disposeSpy = vi.spyOn(first, 'dispose')

    cache.setGeometry(65, 16, first)
    cache.setGeometry(66, 16, second)

    expect(disposeSpy).toHaveBeenCalledOnce()
    expect(cache.hasGeometry(65, 16)).toBe(false)
    expect(cache.getGeometry(66, 16)).toBe(second)
  })

  it('disposes all geometries on dispose()', () => {
    const cache = new CharGeometryCache()
    const geometry = makeLineGeometry()
    const disposeSpy = vi.spyOn(geometry, 'dispose')

    cache.setGeometry(65, 16, geometry)
    cache.dispose()

    expect(disposeSpy).toHaveBeenCalledOnce()
    expect(cache.hasGeometry(65, 16)).toBe(false)
  })

  it('reports entry counts and estimated buffer bytes via getStats()', () => {
    const cache = new CharGeometryCache()
    const geometry = makeLineGeometry()
    cache.setGeometry(65, 16, geometry)

    const stats = cache.getStats()
    expect(stats.entries).toBe(1)
    expect(stats.maxEntries).toBe(4096)
    expect(stats.estimatedBytes).toBeGreaterThan(0)
  })
})
