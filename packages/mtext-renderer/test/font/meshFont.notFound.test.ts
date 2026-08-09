import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { MeshFont } from '../../src/font/meshFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadMeshFont(name: string, file: string): Promise<MeshFont> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file}`)
  }
  const fontData: FontData = {
    name,
    type: 'mesh',
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as MeshFont
}

describe('MeshFont getNotFoundTextShape', () => {
  it(
    'returns a "?" placeholder with non-zero advance (no overlap with next char)',
    async () => {
      const simsun = await loadMeshFont('simsun', 'simsun.ttf')

      // Fresh mesh fonts lazily load glyphs; the not-found path must load "?"
      // before measuring width, otherwise advance stays 0 while geometry still
      // draws "?" and the following character stacks on top of it.
      expect(simsun.data.glyphs['?']).toBeUndefined()

      const notFound = simsun.getNotFoundTextShape(10)
      expect(notFound).toBeDefined()
      expect(notFound!.width).toBeGreaterThan(0)
      expect(notFound!.hasStrokeGeometry()).toBe(true)
    },
    120_000
  )
})
