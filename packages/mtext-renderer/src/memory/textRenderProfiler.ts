/**
 * Session-scoped CPU timing for MText / mesh glyph draws.
 *
 * Disabled by default so production paths pay only a boolean check.
 * Enable via {@link TextRenderProfiler.setEnabled} (cad-viewer OPENPROF)
 * or `globalThis.__MTEXTPROF__ = true`.
 */

export interface TextRenderProfileSnapshot {
  enabled: boolean
  /** `asyncDraw` awaiting content/style fonts. */
  requestFontsMs: number
  /**
   * Tokenize + layout residual inside `processText` after nested glyph/merge
   * leaf timers are subtracted.
   */
  parseLayoutMs: number
  /** opentype path → outline string (`_loadGlyphIfNeeded`). */
  glyphLoadMs: number
  /** `generateShapes` / ShapePath construction. */
  shapeBuildMs: number
  /** `new ShapeGeometry(...)` triangulation. */
  triangulateMs: number
  /** Contour stroke sampling (`toStrokeGeometry`). */
  strokeSampleMs: number
  /** Bake position+index + cache insert. */
  bakeCacheMs: number
  cacheHit: number
  cacheMiss: number
  mergeMeshMs: number
  mergeLineMs: number
  /** Number of `mergeMeshGeometries` calls. */
  mergeMeshCalls: number
  /** Sum of glyph entries across all mesh merges (≈ placed mesh glyphs). */
  mergeMeshEntries: number
  /** Largest single mesh-merge batch size. */
  mergeMeshEntriesMax: number
  /** Merges with exactly 1 glyph entry. */
  mergeMeshBucket1: number
  /** Merges with 2–8 glyph entries. */
  mergeMeshBucket2to8: number
  /** Merges with 9–32 glyph entries. */
  mergeMeshBucket9to32: number
  /** Merges with 33+ glyph entries. */
  mergeMeshBucket33plus: number
  /** Distinct code points that missed the geometry cache. */
  uniqueChars: number
  /**
   * Code points represented by {@link uniqueChars} (present on worker deltas so
   * the main thread can merge sets accurately).
   */
  uniqueCharCodes?: number[]
  /** Glyph placements (instances) during draws. */
  placedChars: number
  vertexCount: number
  indexCount: number
  /** Worker-side `asyncDraw` wall (from worker delta). */
  workerBuildMs: number
  /** Worker-side `serializeMText`. */
  serializeMs: number
  /** Main-thread wait for worker render response (includes build+serialize+IPC). */
  transferWaitMs: number
  /** Main-thread `reconstructMText`. */
  reconstructMs: number
  /** Number of `syncDraw` / worker builds counted. */
  drawCount: number
}

/** Leaf geometry buckets subtracted from `processText` wall for layout residual. */
const GEOMETRY_LEAF_KEYS = [
  'glyphLoadMs',
  'shapeBuildMs',
  'triangulateMs',
  'strokeSampleMs',
  'bakeCacheMs',
  'mergeMeshMs',
  'mergeLineMs'
] as const

type GeometryLeafKey = (typeof GEOMETRY_LEAF_KEYS)[number]

type MutableStats = {
  requestFontsMs: number
  parseLayoutMs: number
  glyphLoadMs: number
  shapeBuildMs: number
  triangulateMs: number
  strokeSampleMs: number
  bakeCacheMs: number
  cacheHit: number
  cacheMiss: number
  mergeMeshMs: number
  mergeLineMs: number
  mergeMeshCalls: number
  mergeMeshEntries: number
  mergeMeshEntriesMax: number
  mergeMeshBucket1: number
  mergeMeshBucket2to8: number
  mergeMeshBucket9to32: number
  mergeMeshBucket33plus: number
  uniqueCharCodes: Set<number>
  placedChars: number
  vertexCount: number
  indexCount: number
  workerBuildMs: number
  serializeMs: number
  transferWaitMs: number
  reconstructMs: number
  drawCount: number
}

function emptyStats(): MutableStats {
  return {
    requestFontsMs: 0,
    parseLayoutMs: 0,
    glyphLoadMs: 0,
    shapeBuildMs: 0,
    triangulateMs: 0,
    strokeSampleMs: 0,
    bakeCacheMs: 0,
    cacheHit: 0,
    cacheMiss: 0,
    mergeMeshMs: 0,
    mergeLineMs: 0,
    mergeMeshCalls: 0,
    mergeMeshEntries: 0,
    mergeMeshEntriesMax: 0,
    mergeMeshBucket1: 0,
    mergeMeshBucket2to8: 0,
    mergeMeshBucket9to32: 0,
    mergeMeshBucket33plus: 0,
    uniqueCharCodes: new Set(),
    placedChars: 0,
    vertexCount: 0,
    indexCount: 0,
    workerBuildMs: 0,
    serializeMs: 0,
    transferWaitMs: 0,
    reconstructMs: 0,
    drawCount: 0
  }
}

function readGlobalFlag(): boolean {
  try {
    const g = globalThis as { __MTEXTPROF__?: unknown }
    return g.__MTEXTPROF__ === true || g.__MTEXTPROF__ === 1
  } catch {
    return false
  }
}

/**
 * Process-wide (per isolate) accumulator for text-render CPU buckets.
 */
export class TextRenderProfiler {
  private static _explicitEnabled: boolean | null = null
  private static _stats: MutableStats = emptyStats()

  /** True when profiling is active in this isolate. */
  static get enabled(): boolean {
    // globalThis wins so duplicate module copies / late setEnabled(false) cannot
    // silently disable OPENPROF sessions that set `__MTEXTPROF__`.
    if (readGlobalFlag()) {
      return true
    }
    return this._explicitEnabled === true
  }

  /**
   * Forces profiling on/off. Pass `null` to fall back to `globalThis.__MTEXTPROF__`.
   */
  static setEnabled(enabled: boolean | null): void {
    this._explicitEnabled = enabled
  }

  /** Clears all counters for a new open / benchmark run. */
  static reset(): void {
    this._stats = emptyStats()
  }

  /** Immutable snapshot of current counters. */
  static snapshot(includeCodes = false): TextRenderProfileSnapshot {
    const s = this._stats
    const snap: TextRenderProfileSnapshot = {
      enabled: this.enabled,
      requestFontsMs: s.requestFontsMs,
      parseLayoutMs: s.parseLayoutMs,
      glyphLoadMs: s.glyphLoadMs,
      shapeBuildMs: s.shapeBuildMs,
      triangulateMs: s.triangulateMs,
      strokeSampleMs: s.strokeSampleMs,
      bakeCacheMs: s.bakeCacheMs,
      cacheHit: s.cacheHit,
      cacheMiss: s.cacheMiss,
      mergeMeshMs: s.mergeMeshMs,
      mergeLineMs: s.mergeLineMs,
      mergeMeshCalls: s.mergeMeshCalls,
      mergeMeshEntries: s.mergeMeshEntries,
      mergeMeshEntriesMax: s.mergeMeshEntriesMax,
      mergeMeshBucket1: s.mergeMeshBucket1,
      mergeMeshBucket2to8: s.mergeMeshBucket2to8,
      mergeMeshBucket9to32: s.mergeMeshBucket9to32,
      mergeMeshBucket33plus: s.mergeMeshBucket33plus,
      uniqueChars: s.uniqueCharCodes.size,
      placedChars: s.placedChars,
      vertexCount: s.vertexCount,
      indexCount: s.indexCount,
      workerBuildMs: s.workerBuildMs,
      serializeMs: s.serializeMs,
      transferWaitMs: s.transferWaitMs,
      reconstructMs: s.reconstructMs,
      drawCount: s.drawCount
    }
    if (includeCodes && s.uniqueCharCodes.size > 0) {
      snap.uniqueCharCodes = Array.from(s.uniqueCharCodes)
    }
    return snap
  }

  /**
   * Snapshot suitable for `postMessage`. Used as a per-render delta from
   * workers and merged on the main thread.
   */
  static takeDelta(): TextRenderProfileSnapshot {
    const snap = this.snapshot(true)
    this.reset()
    return snap
  }

  /**
   * Merges a worker (or prior) delta into this isolate's accumulator.
   * Does not merge `enabled`.
   */
  static mergeDelta(delta: Partial<TextRenderProfileSnapshot> | null | undefined): void {
    if (!delta) return
    const s = this._stats
    s.requestFontsMs += delta.requestFontsMs ?? 0
    s.parseLayoutMs += delta.parseLayoutMs ?? 0
    s.glyphLoadMs += delta.glyphLoadMs ?? 0
    s.shapeBuildMs += delta.shapeBuildMs ?? 0
    s.triangulateMs += delta.triangulateMs ?? 0
    s.strokeSampleMs += delta.strokeSampleMs ?? 0
    s.bakeCacheMs += delta.bakeCacheMs ?? 0
    s.cacheHit += delta.cacheHit ?? 0
    s.cacheMiss += delta.cacheMiss ?? 0
    s.mergeMeshMs += delta.mergeMeshMs ?? 0
    s.mergeLineMs += delta.mergeLineMs ?? 0
    s.mergeMeshCalls += delta.mergeMeshCalls ?? 0
    s.mergeMeshEntries += delta.mergeMeshEntries ?? 0
    if ((delta.mergeMeshEntriesMax ?? 0) > s.mergeMeshEntriesMax) {
      s.mergeMeshEntriesMax = delta.mergeMeshEntriesMax ?? 0
    }
    s.mergeMeshBucket1 += delta.mergeMeshBucket1 ?? 0
    s.mergeMeshBucket2to8 += delta.mergeMeshBucket2to8 ?? 0
    s.mergeMeshBucket9to32 += delta.mergeMeshBucket9to32 ?? 0
    s.mergeMeshBucket33plus += delta.mergeMeshBucket33plus ?? 0
    s.placedChars += delta.placedChars ?? 0
    s.vertexCount += delta.vertexCount ?? 0
    s.indexCount += delta.indexCount ?? 0
    s.workerBuildMs += delta.workerBuildMs ?? 0
    s.serializeMs += delta.serializeMs ?? 0
    s.transferWaitMs += delta.transferWaitMs ?? 0
    s.reconstructMs += delta.reconstructMs ?? 0
    s.drawCount += delta.drawCount ?? 0
    if (delta.uniqueCharCodes) {
      for (const code of delta.uniqueCharCodes) {
        s.uniqueCharCodes.add(code)
      }
    }
  }

  static addMs(
    key:
      | 'requestFontsMs'
      | 'parseLayoutMs'
      | 'glyphLoadMs'
      | 'shapeBuildMs'
      | 'triangulateMs'
      | 'strokeSampleMs'
      | 'bakeCacheMs'
      | 'mergeMeshMs'
      | 'mergeLineMs'
      | 'workerBuildMs'
      | 'serializeMs'
      | 'transferWaitMs'
      | 'reconstructMs',
    ms: number
  ): void {
    if (!this.enabled || !(ms > 0)) return
    this._stats[key] += ms
  }

  static timeSync<T>(
    key: Parameters<typeof TextRenderProfiler.addMs>[0],
    fn: () => T
  ): T {
    if (!this.enabled) {
      return fn()
    }
    const t0 = performance.now()
    try {
      return fn()
    } finally {
      this.addMs(key, performance.now() - t0)
    }
  }

  static async timeAsync<T>(
    key: Parameters<typeof TextRenderProfiler.addMs>[0],
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      return fn()
    }
    const t0 = performance.now()
    try {
      return await fn()
    } finally {
      this.addMs(key, performance.now() - t0)
    }
  }

  /** Sum of leaf geometry timers (for layout residual). */
  static geometryLeafTotalMs(): number {
    const s = this._stats
    let total = 0
    for (const key of GEOMETRY_LEAF_KEYS) {
      total += s[key as GeometryLeafKey]
    }
    return total
  }

  /**
   * Records `processText` wall minus nested leaf geometry time as layout residual.
   */
  static addProcessTextResidual(wallMs: number, leafMsBefore: number): void {
    if (!this.enabled || !(wallMs > 0)) return
    const leafDelta = this.geometryLeafTotalMs() - leafMsBefore
    this._stats.parseLayoutMs += Math.max(0, wallMs - leafDelta)
  }

  static noteCacheHit(): void {
    if (!this.enabled) return
    this._stats.cacheHit++
  }

  static noteCacheMiss(code?: number): void {
    if (!this.enabled) return
    this._stats.cacheMiss++
    if (code != null) {
      this._stats.uniqueCharCodes.add(code)
    }
  }

  static notePlacedChar(): void {
    if (!this.enabled) return
    this._stats.placedChars++
  }

  static addGeometryCounts(vertexCount: number, indexCount: number): void {
    if (!this.enabled) return
    if (vertexCount > 0) this._stats.vertexCount += vertexCount
    if (indexCount > 0) this._stats.indexCount += indexCount
  }

  /**
   * Records one `mergeMeshGeometries` batch size for distribution analysis.
   * Cheap counters only — used to decide merge-opt vs scene-level instancing.
   */
  static noteMergeMeshBatch(entryCount: number): void {
    if (!this.enabled || entryCount < 0) return
    const s = this._stats
    s.mergeMeshCalls++
    s.mergeMeshEntries += entryCount
    if (entryCount > s.mergeMeshEntriesMax) {
      s.mergeMeshEntriesMax = entryCount
    }
    if (entryCount <= 1) {
      s.mergeMeshBucket1++
    } else if (entryCount <= 8) {
      s.mergeMeshBucket2to8++
    } else if (entryCount <= 32) {
      s.mergeMeshBucket9to32++
    } else {
      s.mergeMeshBucket33plus++
    }
  }

  static noteDraw(): void {
    if (!this.enabled) return
    this._stats.drawCount++
  }

  /**
   * Formats a snapshot for OPENPROF / console (Chinese-friendly labels kept short).
   */
  static formatReport(
    snap: TextRenderProfileSnapshot = TextRenderProfiler.snapshot()
  ): string[] {
    const leafTotal =
      snap.requestFontsMs +
      snap.parseLayoutMs +
      snap.glyphLoadMs +
      snap.shapeBuildMs +
      snap.triangulateMs +
      snap.strokeSampleMs +
      snap.bakeCacheMs +
      snap.mergeMeshMs +
      snap.mergeLineMs

    const transportTotal =
      snap.serializeMs + snap.transferWaitMs + snap.reconstructMs

    const pct = (ms: number, base: number) =>
      base <= 0 ? '0%' : `${((ms / base) * 100).toFixed(1)}%`
    const row = (label: string, ms: number, base: number) =>
      `    ${label.padEnd(18)} ${ms.toFixed(1)} ms  (${pct(ms, base)})`

    return [
      '  mtext-renderer profile (cumulative; worker+main merged):',
      `    draws=${snap.drawCount} cacheHit=${snap.cacheHit} cacheMiss=${snap.cacheMiss}` +
        ` uniqueChars=${snap.uniqueChars} placedChars=${snap.placedChars}` +
        ` verts=${snap.vertexCount} indices=${snap.indexCount}`,
      '  -- geometry / layout leaf (worker or main) --',
      row('requestFonts', snap.requestFontsMs, leafTotal),
      row('parseLayout', snap.parseLayoutMs, leafTotal),
      row('glyphLoad', snap.glyphLoadMs, leafTotal),
      row('shapeBuild', snap.shapeBuildMs, leafTotal),
      row('triangulate', snap.triangulateMs, leafTotal),
      row('strokeSample', snap.strokeSampleMs, leafTotal),
      row('bakeCache', snap.bakeCacheMs, leafTotal),
      row('mergeMesh', snap.mergeMeshMs, leafTotal),
      row('mergeLine', snap.mergeLineMs, leafTotal),
      `    mergeMeshDist     calls=${snap.mergeMeshCalls}` +
        ` entries=${snap.mergeMeshEntries}` +
        ` avg=${
          snap.mergeMeshCalls > 0
            ? (snap.mergeMeshEntries / snap.mergeMeshCalls).toFixed(1)
            : '0'
        }` +
        ` max=${snap.mergeMeshEntriesMax}` +
        ` buckets[1|2-8|9-32|33+]=` +
        `${snap.mergeMeshBucket1}|${snap.mergeMeshBucket2to8}|` +
        `${snap.mergeMeshBucket9to32}|${snap.mergeMeshBucket33plus}`,
      `    leafTotal≈${leafTotal.toFixed(1)} ms`,
      '  -- worker transport (main-thread measured except workerBuild/serialize) --',
      `    workerBuild       ${snap.workerBuildMs.toFixed(1)} ms  (worker asyncDraw wall; overlaps leaf)`,
      row('serialize', snap.serializeMs, transportTotal),
      row('transferWait', snap.transferWaitMs, transportTotal),
      row('reconstruct', snap.reconstructMs, transportTotal),
      `    transportTotal≈${transportTotal.toFixed(1)} ms` +
        ` (transferWait includes workerBuild+serialize+IPC; sums may exceed wall under concurrency)`
    ]
  }
}
