import { beforeAll, describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { MeshFont } from '../../src/font/meshFont'
import {
  isMeshGlyphGeometry,
  MESH_GLYPH_CACHE_SIZE
} from '../../src/font/meshGlyphGeometry'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

let meshFont: MeshFont

beforeAll(async () => {
  // AIGDT is small and already used by other mesh font tests (simsun is too large for CI).
  const response = await fetch(FONT_BASE + 'AIGDT.ttf')
  if (!response.ok) {
    throw new Error(`Failed to fetch AIGDT.ttf: ${response.status}`)
  }
  const fontData: FontData = {
    name: 'aigdt',
    type: 'mesh',
    data: await response.arrayBuffer(),
    alias: ['aigdt']
  }
  meshFont = FontFactory.instance.createFont(fontData) as MeshFont
}, 120_000)

describe('MeshTextShape unit-size geometry cache', () => {
  it('reuses one outline for the same character at different heights', () => {
    meshFont.cache.dispose()

    const small = meshFont.getCharShape('n', 2.5)!
    const large = meshFont.getCharShape('n', 12)!
    expect(small).toBeDefined()
    expect(large).toBeDefined()

    const first = small.toGeometry()
    const second = large.toGeometry()

    expect(second).toBe(first)
    expect(isMeshGlyphGeometry(first)).toBe(true)
    expect(
      meshFont.cache.hasGeometry('n'.codePointAt(0)!, MESH_GLYPH_CACHE_SIZE)
    ).toBe(true)
    expect(small.geometryScale).toBe(2.5)
    expect(large.geometryScale).toBe(12)
  })

  it('marks cached glyph geometry so mesh batching survives BufferGeometry demotion', () => {
    meshFont.cache.dispose()
    const shape = meshFont.getCharShape('n', 5)!
    const geometry = shape.toGeometry()
    expect(isMeshGlyphGeometry(geometry)).toBe(true)
    // Flag must survive even if mergeVertices keeps or drops the ShapeGeometry class.
    expect(geometry.userData.isMeshGlyph).toBe(true)
  })
})
