import { InkWidthAdvanceStrategy, Point } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadTxt(): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + 'txt.shx')
  if (!response.ok) throw new Error('Failed to fetch txt.shx')
  const fontData: FontData = {
    name: 'txt',
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: ['txt']
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

describe('txt.shx punctuation alignment in renderer', () => {
  it(
    'lays out comma and hyphen on the baseline band in txt.shx',
    async () => {
      const font = await loadTxt()
      const size = 16
      const metrics = font.getFontMetrics(size)

      const hyphen = font.getCharShape('-', size)!
      const hyphenGeometry = hyphen.toGeometry()
      hyphenGeometry.computeBoundingBox()
      expect(hyphenGeometry.boundingBox!.min.y).toBeCloseTo(metrics.capHeight / 2, 0)
      expect(hyphenGeometry.boundingBox!.max.y).toBeCloseTo(metrics.capHeight / 2, 0)
      expect(hyphen.width).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(hyphen.shape, metrics.cellWidth)
      )

      const comma = font.getCharShape(',', size)!
      const commaGeometry = comma.toGeometry()
      commaGeometry.computeBoundingBox()
      expect(commaGeometry.boundingBox!.max.y).toBeLessThanOrEqual(metrics.descenderHeight)
      expect(comma.width).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(comma.shape, metrics.cellWidth)
      )

      const letterG = font.getCharShape('G', size)!
      const placedG = letterG.offset(new Point(comma.width, 0))
      const gGeometry = placedG.toGeometry()
      gGeometry.computeBoundingBox()
      const gap =
        gGeometry.boundingBox!.min.x - commaGeometry.boundingBox!.max.x
      expect(gap).toBeGreaterThanOrEqual(0)
    },
    120_000
  )
})
