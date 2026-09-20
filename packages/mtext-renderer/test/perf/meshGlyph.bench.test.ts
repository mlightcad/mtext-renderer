/**
 * Mesh / CJK glyph geometry benchmarks.
 *
 * These scenarios target the open-drawing text path that uses TTF/OTF faces
 * (e.g. simsun). The multi-size case is the main regression check for the
 * unit-size CharGeometryCache: one outline should serve every text height.
 *
 * Run: `pnpm bench`
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { MeshFont } from '../../src/font/meshFont'
import { MESH_GLYPH_CACHE_SIZE } from '../../src/font/meshGlyphGeometry'
import { MText } from '../../src/renderer/mtext'
import { FontManager } from '../../src/font/fontManager'
import {
  CJK_ANNOTATION_LINE,
  CJK_UNIQUE_CHARS,
  countGeometryVertices,
  createColorSettings,
  makeTextStyle,
  mockStyleManager,
  registerBenchmarkFont,
  repeatText,
  resetFontManager
} from './helpers/benchFonts'
import { formatMs, measureMs, saveAndCompare } from './helpers/measure'

const SIZES = [2.5, 3.5, 5, 7.5, 10, 12, 16, 25]
const MULTI_SIZE_RUNS = 3

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

describe('perf: mesh glyph geometry', () => {
  it(
    'reports cold unique-CJK toGeometry cost and multi-size reuse',
    async () => {
      const chars = [...new Set(Array.from(CJK_UNIQUE_CHARS))]
      expect(chars.length).toBeGreaterThan(20)

      // Prime glyph tokens (opentype parse) so the timed section measures geometry.
      for (const char of chars) {
        simsun.getCharShape(char, SIZES[0]!)
      }
      simsun.cache.dispose()

      // Controlled single-pass: first height builds outlines; remaining heights
      // should mostly hit the unit-size CharGeometryCache.
      const firstSizeSamples: number[] = []
      const extraSizesSamples: number[] = []
      for (let run = 0; run < MULTI_SIZE_RUNS; run++) {
        simsun.cache.dispose()

        const t0 = performance.now()
        for (const char of chars) {
          simsun.getCharShape(char, SIZES[0]!)?.toGeometry()
        }
        firstSizeSamples.push(performance.now() - t0)

        const t1 = performance.now()
        for (const size of SIZES.slice(1)) {
          for (const char of chars) {
            simsun.getCharShape(char, size)?.toGeometry()
          }
        }
        extraSizesSamples.push(performance.now() - t1)
      }

      const median = (samples: number[]) => {
        const sorted = [...samples].sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]!
      }
      const firstSizeMs = median(firstSizeSamples)
      const extraSizesMs = median(extraSizesSamples)
      const allSizesMs = firstSizeMs + extraSizesMs
      const naiveAllSizesMs = firstSizeMs * SIZES.length
      const speedup = allSizesMs > 0 ? naiveAllSizesMs / allSizesMs : 0

      const cacheEntries = simsun.cache.getStats().entries
      // After last multi-size run the cache should hold ~unique chars, not chars×sizes.
      expect(cacheEntries).toBeLessThanOrEqual(chars.length + 2)
      expect(
        simsun.cache.hasGeometry(
          chars[0]!.codePointAt(0)!,
          MESH_GLYPH_CACHE_SIZE
        )
      ).toBe(true)

      // eslint-disable-next-line no-console
      console.log(
        `\n[bench] mesh unique CJK=${chars.length} sizes=${SIZES.length}\n` +
          `  first height median=${formatMs(firstSizeMs)}\n` +
          `  remaining ${SIZES.length - 1} heights median=${formatMs(extraSizesMs)}\n` +
          `  all heights=${formatMs(allSizesMs)} vs naive ${SIZES.length}×first≈${formatMs(naiveAllSizesMs)} ` +
          `→ speedup≈${speedup.toFixed(2)}×\n` +
          `  cache entries=${cacheEntries} (expect ~${chars.length})`
      )

      await saveAndCompare('mesh-glyph', [
        {
          name: 'first_height_unique_cjk_toGeometry',
          value: firstSizeMs,
          note: `${chars.length} chars @ size ${SIZES[0]}`
        },
        {
          name: 'extra_heights_unique_cjk_toGeometry',
          value: extraSizesMs,
          note: `${chars.length} chars × ${SIZES.length - 1} additional sizes`
        },
        {
          name: 'all_heights_unique_cjk_toGeometry',
          value: allSizesMs,
          note: `${chars.length} chars × ${SIZES.length} sizes`
        },
        {
          name: 'multi_size_vs_naive_speedup',
          value: speedup,
          unit: '×',
          note: 'higher is better; unit cache target ≫ 1'
        },
        {
          name: 'cache_entries_after_multi_size',
          value: cacheEntries,
          unit: 'entries',
          note: `ideal ≤ ${chars.length}`
        }
      ])

      // Soft guard: remaining heights must stay cheap vs rebuilding each size.
      expect(extraSizesMs).toBeLessThan(firstSizeMs * 0.75)
      expect(allSizesMs).toBeLessThan(naiveAllSizesMs * 0.6)
    },
    180_000
  )

  it(
    'reports MText.syncDraw for long CJK and mixed heights',
    async () => {
      resetFontManager()
      simsun = (await registerBenchmarkFont({
        name: 'simsun',
        fileName: 'simsun.woff'
      })) as MeshFont

      const longText = repeatText(CJK_ANNOTATION_LINE + ' ', 800)
      const style = makeTextStyle('simsun', 5)

      const singleHeight = measureMs(
        () => {
          simsun.cache.dispose()
          const mtext = new MText(
            {
              text: longText,
              height: 5,
              width: 50_000,
              collectCharBoxes: false
            },
            style,
            mockStyleManager as never,
            FontManager.instance,
            createColorSettings()
          )
          mtext.syncDraw()
          expect(countGeometryVertices(mtext)).toBeGreaterThan(0)
          mtext.dispose()
        },
        { warmup: 1, runs: 3 }
      )

      const mixedHeights = measureMs(
        () => {
          simsun.cache.dispose()
          for (const height of SIZES) {
            const mtext = new MText(
              {
                text: CJK_ANNOTATION_LINE,
                height,
                width: 50_000,
                collectCharBoxes: false
              },
              makeTextStyle('simsun', height),
              mockStyleManager as never,
              FontManager.instance,
              createColorSettings()
            )
            mtext.syncDraw()
            mtext.dispose()
          }
        },
        { warmup: 1, runs: 3 }
      )

      // Many small entities — closer to opening a drawing with lots of TEXT/MTEXT.
      const entityCount = 120
      const manyEntities = measureMs(
        () => {
          simsun.cache.dispose()
          for (let i = 0; i < entityCount; i++) {
            const height = SIZES[i % SIZES.length]!
            const mtext = new MText(
              {
                text: CJK_ANNOTATION_LINE.slice(0, 24),
                height,
                width: 50_000,
                collectCharBoxes: false
              },
              makeTextStyle('simsun', height),
              mockStyleManager as never,
              FontManager.instance,
              createColorSettings()
            )
            mtext.syncDraw()
            mtext.dispose()
          }
        },
        { warmup: 0, runs: 3 }
      )

      await saveAndCompare('mesh-mtext-draw', [
        {
          name: 'syncDraw_long_cjk_one_height',
          value: singleHeight.medianMs,
          note: `${longText.length} chars @ h=5`
        },
        {
          name: 'syncDraw_annotation_mixed_heights',
          value: mixedHeights.medianMs,
          note: `${SIZES.length} heights × annotation line`
        },
        {
          name: 'syncDraw_many_small_entities',
          value: manyEntities.medianMs,
          note: `${entityCount} entities, rotating heights`
        }
      ])
    },
    180_000
  )
})
