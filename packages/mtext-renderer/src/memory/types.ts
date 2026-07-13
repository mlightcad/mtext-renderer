/**
 * Approximate byte size of one cached Three.js material entry.
 * Materials are small compared to fonts; this is a fixed heuristic.
 */
export const MATERIAL_ESTIMATED_BYTES = 512

/**
 * Estimates material cache bytes from counts.
 */
export function estimateMaterialBytes(
  meshCount: number,
  lineCount: number
): number {
  return (meshCount + lineCount) * MATERIAL_ESTIMATED_BYTES
}

/**
 * Multiplier applied to mesh font source bytes to estimate opentype.js parse overhead.
 * Aligned with the documented ~40MB resident cost for large CJK mesh fonts.
 */
export const MESH_PARSED_FONT_OVERHEAD = 2.5

/**
 * Multiplier applied to SHX font source bytes to estimate parsed SHX tables.
 */
export const SHX_PARSED_FONT_OVERHEAD = 1.5

/**
 * Entry-count and estimated byte size for one cache bucket.
 */
export interface CacheBucketStats {
  entries: number
  maxEntries: number
  estimatedBytes: number
}

/**
 * Material cache occupancy for a style manager.
 */
export interface MaterialMemoryStats {
  meshCount: number
  lineCount: number
  estimatedBytes: number
}

/**
 * Empty material stats when no style manager is available.
 */
export function emptyMaterialStats(): MaterialMemoryStats {
  return {
    meshCount: 0,
    lineCount: 0,
    estimatedBytes: 0
  }
}

/**
 * Per-font memory estimate (parsed font + caches).
 *
 * @remarks
 * `parsedFontEstimatedBytes` is heuristic (source size × overhead). Geometry
 * buffers and outline strings are measured from TypedArrays / string lengths.
 */
export interface FontMemoryStats {
  names: string[]
  type: 'mesh' | 'shx'
  sourceByteLength: number
  parsedFontEstimatedBytes: number
  charGeometryCache: CacheBucketStats
  meshGlyphs?: {
    glyphCount: number
    outlineStringBytes: number
  }
  shxLayoutCache?: CacheBucketStats
  estimatedBytes: number
}

/**
 * Memory estimate for one JS isolate (main thread or a single worker).
 */
export interface IsolateMemoryStats {
  id: string
  inFlightRequests?: number
  fonts: FontMemoryStats[]
  materials: MaterialMemoryStats
  totalEstimatedBytes: number
}

/**
 * IndexedDB persistent font-blob storage stats.
 *
 * @remarks
 * Collecting these stats loads font blobs into the JS heap temporarily.
 */
export interface IndexedDbFontCacheStats {
  fontCount: number
  totalBytes: number
  fonts: Array<{
    name: string
    type: string
    bytes: number
  }>
}

/**
 * Aggregated memory usage report for mtext-renderer.
 *
 * @remarks
 * This is an estimate, not a heap snapshot.
 * {@link MemoryUsageReport.totalEstimatedBytes} counts live isolate memory only
 * (still-loaded fonts and caches). IndexedDB storage is listed separately and
 * is not part of the total. Scene-held MText objects created by the application
 * are not included. Released / disposed font caches are excluded.
 */
export interface MemoryUsageReport {
  collectedAt: number
  /** Live isolate memory only; excludes IndexedDB and disposed resources. */
  totalEstimatedBytes: number
  mainThread: IsolateMemoryStats
  workers: IsolateMemoryStats[]
  /** Persistent disk/IDB cache; not included in {@link totalEstimatedBytes}. */
  indexedDbFontCache: IndexedDbFontCacheStats
  jsHeap?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}
