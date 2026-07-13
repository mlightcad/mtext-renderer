import type { FontManager } from '../font/fontManager'
import type { StyleManager } from '../renderer/styleManager'
import {
  emptyMaterialStats,
  type IsolateMemoryStats,
  type MaterialMemoryStats,
  type MemoryUsageReport
} from './types'

/**
 * Reads material stats from a style manager when it exposes `getMaterialStats`.
 */
export function getMaterialStatsFromStyleManager(
  styleManager?: StyleManager | null
): MaterialMemoryStats {
  if (
    styleManager &&
    'getMaterialStats' in styleManager &&
    typeof (styleManager as { getMaterialStats?: () => MaterialMemoryStats })
      .getMaterialStats === 'function'
  ) {
    return (
      styleManager as { getMaterialStats: () => MaterialMemoryStats }
    ).getMaterialStats()
  }
  return emptyMaterialStats()
}

/**
 * Builds isolate stats from a FontManager and optional style manager.
 */
export function collectIsolateMemoryStats(
  fontManager: FontManager,
  options: {
    id: string
    styleManager?: StyleManager | null
    materials?: MaterialMemoryStats
    inFlightRequests?: number
  }
): IsolateMemoryStats {
  const materials =
    options.materials ?? getMaterialStatsFromStyleManager(options.styleManager)
  return fontManager.estimateMemoryUsage({
    id: options.id,
    materials,
    inFlightRequests: options.inFlightRequests
  })
}

/**
 * Reads Chrome `performance.memory` when available.
 */
export function readJsHeapStats(): MemoryUsageReport['jsHeap'] | undefined {
  const perf = globalThis.performance as
    | (Performance & {
        memory?: {
          usedJSHeapSize: number
          totalJSHeapSize: number
          jsHeapSizeLimit: number
        }
      })
    | undefined
  const memory = perf?.memory
  if (!memory) {
    return undefined
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit
  }
}
