/**
 * SHX stroke-font benchmarks (ASCII / line-font path).
 *
 * Complements the mesh/CJK suite so SHX regressions are visible separately.
 *
 * Run: `pnpm bench`
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { FontManager } from '../../src/font/fontManager'
import { ShxFont } from '../../src/font/shxFont'
import { MText } from '../../src/renderer/mtext'
import {
  countGeometryVertices,
  createColorSettings,
  makeTextStyle,
  mockStyleManager,
  registerBenchmarkFont,
  repeatText,
  resetFontManager
} from './helpers/benchFonts'
import { measureMs, saveAndCompare } from './helpers/measure'

const SIZES = [2.5, 3.5, 5, 7.5, 10, 12, 16, 25]
const ASCII = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

async function loadTxt(): Promise<ShxFont> {
  resetFontManager()
  return (await registerBenchmarkFont({
    name: 'txt',
    fileName: 'txt.shx'
  })) as ShxFont
}

beforeAll(async () => {
  await loadTxt()
}, 120_000)

describe('perf: SHX glyph geometry', () => {
  it(
    'reports cold ASCII toGeometry and multi-size cost',
    async () => {
      const chars = Array.from(ASCII)

      // Fresh font so layoutShapeCache starts empty.
      let font = await loadTxt()
      const coldUnique = measureMs(
        () => {
          for (const char of chars) {
            font.getCharShape(char, 16)?.toGeometry()
          }
        },
        { warmup: 0, runs: 1 }
      )

      // Warm: same size, cache should hit.
      const warmUnique = measureMs(
        () => {
          for (const char of chars) {
            font.getCharShape(char, 16)?.toGeometry()
          }
        },
        { warmup: 0, runs: 5 }
      )

      // Multi-size on a fresh font: SHX still keys layout by size, so cost grows
      // with distinct heights (unlike mesh unit-size cache).
      font.dispose()
      font = await loadTxt()
      const multiSize = measureMs(
        () => {
          for (const size of SIZES) {
            for (const char of chars) {
              font.getCharShape(char, size)?.toGeometry()
            }
          }
        },
        { warmup: 0, runs: 3 }
      )

      await saveAndCompare('shx-glyph', [
        {
          name: 'cold_ascii_toGeometry',
          value: coldUnique.medianMs,
          note: `${chars.length} chars @ size 16`
        },
        {
          name: 'warm_ascii_toGeometry',
          value: warmUnique.medianMs,
          note: 'same size, layoutShapeCache hits'
        },
        {
          name: 'multi_size_ascii_toGeometry',
          value: multiSize.medianMs,
          note: `${chars.length} chars × ${SIZES.length} sizes`
        }
      ])

      expect(warmUnique.medianMs).toBeLessThanOrEqual(coldUnique.medianMs * 1.2)
    },
    120_000
  )

  it(
    'reports MText.syncDraw for long ASCII and many small entities',
    async () => {
      await loadTxt()
      const longText = repeatText(ASCII + ' ', 500)

      const singleHeight = measureMs(
        () => {
          const mtext = new MText(
            {
              text: longText,
              height: 16,
              width: 50_000,
              collectCharBoxes: false
            },
            makeTextStyle('txt', 16),
            mockStyleManager as never,
            FontManager.instance,
            createColorSettings()
          )
          mtext.syncDraw()
          expect(countGeometryVertices(mtext)).toBeGreaterThan(0)
          mtext.dispose()
        },
        { warmup: 1, runs: 5 }
      )

      const entityCount = 200
      const manyEntities = measureMs(
        () => {
          for (let i = 0; i < entityCount; i++) {
            const height = SIZES[i % SIZES.length]!
            const mtext = new MText(
              {
                text: ASCII.slice(0, 12),
                height,
                width: 50_000,
                collectCharBoxes: false
              },
              makeTextStyle('txt', height),
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

      await saveAndCompare('shx-mtext-draw', [
        {
          name: 'syncDraw_long_ascii_one_height',
          value: singleHeight.medianMs,
          note: `${longText.length} chars @ h=16`
        },
        {
          name: 'syncDraw_many_small_entities',
          value: manyEntities.medianMs,
          note: `${entityCount} entities, rotating heights`
        }
      ])
    },
    120_000
  )
})
