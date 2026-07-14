/**
 * Callback invoked when an entry is removed from the cache, either because it
 * was evicted to make room for a new entry, replaced by a different value, or
 * cleared explicitly.
 *
 * @typeParam K - The cache key type.
 * @typeParam V - The cache value type.
 */
export type LRUCacheEvictHandler<K, V> = (key: K, value: V) => void

/**
 * Simple least-recently-used cache with a fixed maximum size.
 *
 * Entries are ordered by access time: {@link get} and {@link set} move a key to
 * the most-recently-used position. When the cache is full, the oldest entry is
 * evicted before inserting a new one.
 *
 * @typeParam K - The cache key type.
 * @typeParam V - The cache value type.
 */
export class LRUCache<K, V> {
  private readonly maxSize: number
  private readonly onEvict?: LRUCacheEvictHandler<K, V>
  private readonly map = new Map<K, V>()

  /**
   * Creates an LRU cache with the given capacity and optional eviction handler.
   *
   * @param maxSize - Maximum number of entries to retain. Defaults to 4096.
   * @param onEvict - Optional callback invoked for each evicted or replaced value.
   */
  constructor(maxSize = 4096, onEvict?: LRUCacheEvictHandler<K, V>) {
    this.maxSize = maxSize
    this.onEvict = onEvict
  }

  /**
   * Returns the value for `key` and marks it as most recently used.
   *
   * @param key - The cache key to look up.
   * @returns The cached value, or `undefined` if the key is not present.
   */
  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  /**
   * Stores `value` under `key` and marks it as most recently used.
   *
   * If the key already exists, its previous value is passed to {@link onEvict}
   * when the new value differs. If the cache is at capacity, the least recently
   * used entry is evicted before the new entry is inserted.
   *
   * @param key - The cache key to set.
   * @param value - The value to store.
   */
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const previous = this.map.get(key)!
      this.map.delete(key)
      if (previous !== value) {
        this.onEvict?.(key, previous)
      }
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) {
        const evicted = this.map.get(oldestKey)!
        this.map.delete(oldestKey)
        this.onEvict?.(oldestKey, evicted)
      }
    }
    this.map.set(key, value)
  }

  /**
   * Returns whether `key` exists in the cache without updating its recency.
   *
   * @param key - The cache key to test.
   * @returns True if the key is present; otherwise, false.
   */
  has(key: K): boolean {
    return this.map.has(key)
  }

  /**
   * Number of entries currently stored in the cache.
   */
  get size(): number {
    return this.map.size
  }

  /**
   * Maximum number of entries this cache may retain.
   */
  get capacity(): number {
    return this.maxSize
  }

  /**
   * Iterates over cached values without updating recency order.
   */
  values(): IterableIterator<V> {
    return this.map.values()
  }

  /**
   * Removes all entries from the cache.
   *
   * If an {@link onEvict} handler was provided, it is invoked once per entry
   * before the internal map is cleared.
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.map) {
        this.onEvict(key, value)
      }
    }
    this.map.clear()
  }
}
