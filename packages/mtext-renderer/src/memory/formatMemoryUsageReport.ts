import { formatBytes } from './estimateGeometryBytes'
import type { IsolateMemoryStats, MemoryUsageReport } from './types'

function formatIsolate(isolate: IsolateMemoryStats, indent = ''): string[] {
  const lines: string[] = [
    `${indent}${isolate.id}: ${formatBytes(isolate.totalEstimatedBytes)}` +
      (isolate.inFlightRequests != null
        ? ` (in-flight: ${isolate.inFlightRequests})`
        : '')
  ]

  lines.push(
    `${indent}  materials: mesh=${isolate.materials.meshCount}, line=${isolate.materials.lineCount}, ~${formatBytes(isolate.materials.estimatedBytes)}`
  )

  if (isolate.fonts.length === 0) {
    lines.push(`${indent}  fonts: (none)`)
    return lines
  }

  for (const font of isolate.fonts) {
    const primary = font.names[0] ?? '(unnamed)'
    lines.push(
      `${indent}  font "${primary}" [${font.type}]: ~${formatBytes(font.estimatedBytes)}`
    )
    lines.push(
      `${indent}    source=${formatBytes(font.sourceByteLength)}, parsed~=${formatBytes(font.parsedFontEstimatedBytes)}`
    )
    lines.push(
      `${indent}    charGeometry: ${font.charGeometryCache.entries}/${font.charGeometryCache.maxEntries} ~${formatBytes(font.charGeometryCache.estimatedBytes)}`
    )
    if (font.meshGlyphs) {
      lines.push(
        `${indent}    meshGlyphs: ${font.meshGlyphs.glyphCount} glyphs, outlines=${formatBytes(font.meshGlyphs.outlineStringBytes)}`
      )
    }
    if (font.shxLayoutCache) {
      lines.push(
        `${indent}    shxLayout: ${font.shxLayoutCache.entries}/${font.shxLayoutCache.maxEntries} ~${formatBytes(font.shxLayoutCache.estimatedBytes)}`
      )
    }
  }

  return lines
}

/**
 * Formats a {@link MemoryUsageReport} for console logging.
 */
export function formatMemoryUsageReport(report: MemoryUsageReport): string {
  const lines: string[] = [
    `mtext-renderer memory estimate @ ${new Date(report.collectedAt).toISOString()}`,
    `total (live isolates): ${formatBytes(report.totalEstimatedBytes)}`
  ]

  if (report.jsHeap) {
    lines.push(
      `jsHeap: used=${formatBytes(report.jsHeap.usedJSHeapSize)}, total=${formatBytes(report.jsHeap.totalJSHeapSize)}, limit=${formatBytes(report.jsHeap.jsHeapSizeLimit)}`
    )
  }

  lines.push(...formatIsolate(report.mainThread))

  if (report.workers.length === 0) {
    lines.push('workers: (none)')
  } else {
    lines.push(`workers (${report.workers.length}):`)
    for (const worker of report.workers) {
      lines.push(...formatIsolate(worker, '  '))
    }
  }

  const idb = report.indexedDbFontCache
  lines.push(
    `indexedDbFontCache (not in total): ${idb.fontCount} fonts, ${formatBytes(idb.totalBytes)}`
  )
  for (const font of idb.fonts) {
    lines.push(`  ${font.name} [${font.type}]: ${formatBytes(font.bytes)}`)
  }

  return lines.join('\n')
}
