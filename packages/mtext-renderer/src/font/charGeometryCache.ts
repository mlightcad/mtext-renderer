import * as THREE from 'three'

import { LRUCache } from '../common/lruCache'
import { estimateGeometryBytes } from '../memory/estimateGeometryBytes'
import type { CacheBucketStats } from '../memory/types'

const DEFAULT_MAX_CACHE_SIZE = 4096

/**
 * Manages caching of font character geometries to improve text rendering performance.
 * Uses an LRU policy so memory stays bounded when many (code, size) pairs are loaded.
 */
export class CharGeometryCache {
  private readonly cache: LRUCache<string, THREE.BufferGeometry>
  private readonly maxSize: number

  constructor(maxSize = DEFAULT_MAX_CACHE_SIZE) {
    this.maxSize = maxSize
    this.cache = new LRUCache(maxSize, (_key, geometry) => {
      geometry.dispose()
    })
  }

  /**
   * Returns true if the geometry of the specified character code exists in the cache.
   * Otherwise, returns false.
   * @param code One character code.
   * @param size The font size.
   * @returns True if the geometry of the specified character code exists in the cache.
   * Otherwise, returns false.
   */
  hasGeometry(code: number, size: number) {
    const key = this.generateKey(code, size)
    return this.cache.has(key)
  }

  /**
   * Get the geometry for a single character from cache if available.
   * The cache key includes both character codeand size.
   * @param code The character code to get geometry from cache.
   * @param size The font size.
   * @returns The geometry for a single character from cache if avaiable.
   * Return undefined if the character not found in cache.
   */
  getGeometry(code: number, size: number): THREE.BufferGeometry | undefined {
    const key = this.generateKey(code, size)
    return this.cache.get(key)
  }

  /**
   * Set the geometry to cache for a single character.
   * @param char The character to set geometry for.
   * @param size The font size.
   * @param geometry The geometry to set.
   */
  setGeometry(code: number, size: number, geometry: THREE.BufferGeometry) {
    const key = this.generateKey(code, size)
    this.cache.set(key, geometry)
  }

  /**
   * Estimates memory used by cached BufferGeometry attribute/index buffers.
   */
  getStats(): CacheBucketStats {
    let estimatedBytes = 0
    for (const geometry of this.cache.values()) {
      estimatedBytes += estimateGeometryBytes(geometry)
    }
    return {
      entries: this.cache.size,
      maxEntries: this.maxSize,
      estimatedBytes
    }
  }

  /**
   * Dispose all cached geometries.
   */
  dispose(): void {
    this.cache.clear()
  }

  /**
   * Generates cache key by character and font size.
   * @param char One character code.
   * @param size The font size.
   */
  private generateKey(char: number, size: number) {
    return `${char}_${size}`
  }
}
