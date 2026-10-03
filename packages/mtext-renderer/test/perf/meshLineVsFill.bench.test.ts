/**
 * Compares TrueType meshFontRenderMode `mesh` (filled triangulation) vs `line`
 * (contour strokes) for geometry-build time and GPU-buffer memory.
 *
 * Run: `pnpm bench -- test/perf/meshLineVsFill.bench.test.ts`
 */
import * as THREE from 'three'
import { afterEach, beforeAll, describe, it } from 'vitest'

import { FontManager } from '../../src/font/fontManager'
import { MeshFont } from '../../src/font/meshFont'
import { estimateGeometryBytes, formatBytes } from '../../src/memory/estimateGeometryBytes'
import { MText } from '../../src/renderer/mtext'
import type { MeshFontRenderMode } from '../../src/renderer/types'
import {
  CJK_ANNOTATION_LINE,
  CJK_UNIQUE_CHARS,
  createColorSettings,
  makeTextStyle,
  mockStyleManager,
  registerBenchmarkFont,
  repeatText,
  resetFontManager
} from './helpers/benchFonts'
import { formatMs, measureMs, printReport } from './helpers/measure'

let simsun: MeshFont

beforeAll(async () => {
  resetFontManager()
  simsun = (await registerBenchmarkFont({
    name: 'simsun',
    fileName: 'simsun.woff'
  })) as MeshFont
}, 180_000)

afterEach(() => {
  simsun.cache.dispose()
})

interface DrawnGeometryStats {
  objectBytes: number
  cacheBytes: number
  vertices: number
  indexCount: number
  meshNodes: number
  lineNodes: number
}

function collectDrawnGeometry(object: THREE.Object3D): DrawnGeometryStats {
  let objectBytes = 0
  let vertices = 0
  let indexCount = 0
  let meshNodes = 0
  let lineNodes = 0
  object.traverse(node => {
    if (node instanceof THREE.Mesh) meshNodes++
    if (node instanceof THREE.LineSegments) lineNodes++
    const geometry = (node as THREE.Mesh).geometry as
      | THREE.BufferGeometry
      | undefined
    if (!geometry?.getAttribute) return
    objectBytes += estimateGeometryBytes(geometry)
    vertices += geometry.getAttribute('position')?.count ?? 0
    indexCount += geometry.getIndex()?.count ?? 0
  })
  return {
    objectBytes,
    cacheBytes: simsun.cache.getStats().estimatedBytes,
    vertices,
    indexCount,
    meshNodes,
    lineNodes
  }
}

function buildUniqueGlyphs(mode: MeshFontRenderMode, chars: string[]): void {
  simsun.cache.dispose()
  for (const char of chars) {
    const shape = simsun.getCharShape(char, 5)
    if (!shape) continue
    if (mode === 'line') {
      shape.toStrokeGeometry()
    } else {
      shape.toGeometry()
    }
  }
}

function drawMText(
  text: string,
  mode: MeshFontRenderMode,
  height = 5
): { mtext: MText; stats: DrawnGeometryStats } {
  const mtext = new MText(
    {
      text,
      height,
      width: 50_000,
      collectCharBoxes: false,
      meshFontRenderMode: mode
    },
    makeTextStyle('simsun', height),
    mockStyleManager as never,
    FontManager.instance,
    createColorSettings()
  )
  mtext.syncDraw()
  return { mtext, stats: collectDrawnGeometry(mtext) }
}

function ratio(line: number, fill: number): string {
  if (fill <= 0) return 'n/a'
  const value = line / fill
  return `${value.toFixed(2)}× fill`
}

describe('perf: mesh fill vs contour lines', () => {
  it(
    'compares unique-CJK glyph cache and MText.syncDraw',
    () => {
      const chars = [...new Set(Array.from(CJK_UNIQUE_CHARS))]
      for (const char of chars) {
        simsun.getCharShape(char, 5)
      }

      const fillGlyph = measureMs(
        () => {
          buildUniqueGlyphs('mesh', chars)
        },
        { warmup: 1, runs: 3 }
      )
      buildUniqueGlyphs('mesh', chars)
      const fillCacheBytes = simsun.cache.getStats().estimatedBytes
      const fillCacheEntries = simsun.cache.getStats().entries

      const lineGlyph = measureMs(
        () => {
          buildUniqueGlyphs('line', chars)
        },
        { warmup: 1, runs: 3 }
      )
      buildUniqueGlyphs('line', chars)
      const lineCacheBytes = simsun.cache.getStats().estimatedBytes
      const lineCacheEntries = simsun.cache.getStats().entries

      printReport('unique CJK glyph cache (simsun)', [
        {
          mode: 'filled mesh',
          build: formatMs(fillGlyph.medianMs),
          cache: formatBytes(fillCacheBytes),
          entries: fillCacheEntries
        },
        {
          mode: 'contour lines',
          build: formatMs(lineGlyph.medianMs),
          cache: formatBytes(lineCacheBytes),
          entries: lineCacheEntries
        },
        {
          mode: 'line / fill',
          build: ratio(lineGlyph.medianMs, fillGlyph.medianMs),
          cache: ratio(lineCacheBytes, fillCacheBytes),
          entries: `${lineCacheEntries} / ${fillCacheEntries}`
        }
      ])

      const longText = repeatText(CJK_ANNOTATION_LINE + ' ', 800)
      const styleHeight = 5

      const measureDraw = (mode: MeshFontRenderMode) =>
        measureMs(
          () => {
            simsun.cache.dispose()
            const { mtext } = drawMText(longText, mode, styleHeight)
            mtext.dispose()
          },
          { warmup: 1, runs: 3 }
        )

      const fillDraw = measureDraw('mesh')
      simsun.cache.dispose()
      const fillDrawn = drawMText(longText, 'mesh', styleHeight)
      const fillStats = fillDrawn.stats
      fillDrawn.mtext.dispose()

      const lineDraw = measureDraw('line')
      simsun.cache.dispose()
      const lineDrawn = drawMText(longText, 'line', styleHeight)
      const lineStats = lineDrawn.stats
      lineDrawn.mtext.dispose()

      printReport(`MText.syncDraw long CJK (${longText.length} chars @ h=${styleHeight})`, [
        {
          mode: 'filled mesh',
          syncDraw: formatMs(fillDraw.medianMs),
          drawnGeom: formatBytes(fillStats.objectBytes),
          glyphCache: formatBytes(fillStats.cacheBytes),
          verts: fillStats.vertices,
          indices: fillStats.indexCount,
          nodes: `mesh=${fillStats.meshNodes} line=${fillStats.lineNodes}`
        },
        {
          mode: 'contour lines',
          syncDraw: formatMs(lineDraw.medianMs),
          drawnGeom: formatBytes(lineStats.objectBytes),
          glyphCache: formatBytes(lineStats.cacheBytes),
          verts: lineStats.vertices,
          indices: lineStats.indexCount,
          nodes: `mesh=${lineStats.meshNodes} line=${lineStats.lineNodes}`
        },
        {
          mode: 'line / fill',
          syncDraw: ratio(lineDraw.medianMs, fillDraw.medianMs),
          drawnGeom: ratio(lineStats.objectBytes, fillStats.objectBytes),
          glyphCache: ratio(lineStats.cacheBytes, fillStats.cacheBytes),
          verts: ratio(lineStats.vertices, fillStats.vertices),
          indices: ratio(lineStats.indexCount, fillStats.indexCount),
          nodes: ''
        }
      ])

      // Keep the test as a measurement vehicle; fail only if line mode produced nothing.
      if (lineStats.vertices <= 0 || fillStats.vertices <= 0) {
        throw new Error('Expected both modes to produce drawable vertices')
      }
    },
    180_000
  )
})
