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

describe('MeshFont Symbol encoding (AIGDT.ttf)', () => {
  it(
    'resolves ISO GDT shorthand letters via 0xF000 + ASCII cmap',
    async () => {
      const aigdt = await loadMeshFont('aigdt', 'AIGDT.ttf')

      for (const char of ['n', 'v', 'x', 'w']) {
        expect(aigdt.hasChar(char)).toBe(true)
        const shape = aigdt.getCharShape(char, 5)
        expect(shape).toBeDefined()
        expect(shape!.width).toBeGreaterThan(0)
        const geometry = shape!.toGeometry()
        expect((geometry.attributes.position?.count ?? 0) > 0).toBe(true)
      }
    },
    120_000
  )
})
