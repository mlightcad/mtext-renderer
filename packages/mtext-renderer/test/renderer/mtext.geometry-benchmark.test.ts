import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { ShxFont } from '../../src/font/shxFont'
import { MText } from '../../src/renderer/mtext'
import { createDefaultColorSettings } from '../../src/renderer/types'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'
const BENCHMARK_CHAR_COUNT = 500
const BENCHMARK_FONT_SIZE = 16

const styleManager = {
  unsupportedTextStyles: {} as Record<string, number>,
  getMeshBasicMaterial: vi
    .fn()
    .mockReturnValue(new THREE.MeshBasicMaterial({ color: 0xffffff })),
  getLineBasicMaterial: vi
    .fn()
    .mockReturnValue(new THREE.LineBasicMaterial({ color: 0xffffff }))
}

let cachedTxtFontData: FontData | undefined

async function loadTxtFont(): Promise<ShxFont> {
  if (!cachedTxtFontData) {
    const response = await fetch(FONT_BASE + 'txt.shx')
    if (!response.ok) {
      throw new Error(`Failed to fetch txt.shx: ${response.status}`)
    }
    cachedTxtFontData = {
      name: 'txt',
      type: 'shx',
      data: await response.arrayBuffer(),
      alias: ['txt']
    }
  }

  FontManager.instance.release()
  FontManager.instance.enableFontCache = false
  const font = FontFactory.instance.createFont(cachedTxtFontData) as ShxFont
  font.names.add('txt')
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set('txt', font)
  return font
}

function buildSampleText(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
  let text = ''
  for (let i = 0; i < length; i++) {
    text += alphabet[i % alphabet.length]
  }
  return text
}

function countLineVertices(object: THREE.Object3D): number {
  let count = 0
  object.traverse(node => {
    if ('geometry' in node) {
      const geometry = (node as THREE.LineSegments).geometry as THREE.BufferGeometry
      const position = geometry?.getAttribute('position')
      if (position) {
        count += position.count
      }
    }
  })
  return count
}

beforeEach(() => loadTxtFont(), 120_000)

afterEach(() => {
  FontManager.instance.release()
})

describe('MText geometry render benchmark', () => {
  it(
    'renders repeated ASCII text with warm geometry cache faster than cold cache',
    async () => {
      const text = buildSampleText(BENCHMARK_CHAR_COUNT)
      const textStyle = {
        name: 'Standard',
        standardFlag: 0,
        fixedTextHeight: BENCHMARK_FONT_SIZE,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: BENCHMARK_FONT_SIZE,
        font: 'txt',
        bigFont: ''
      }

      const coldFont = await loadTxtFont()
      coldFont.cache.dispose()

      const mtext = new MText(
        {
          text,
          height: BENCHMARK_FONT_SIZE,
          width: 10_000,
          collectCharBoxes: false
        },
        textStyle,
        styleManager as any,
        FontManager.instance,
        createDefaultColorSettings()
      )

      const coldStart = performance.now()
      mtext.syncDraw()
      const coldMs = performance.now() - coldStart

      const warmStart = performance.now()
      mtext.syncDraw()
      const warmMs = performance.now() - warmStart

      expect(countLineVertices(mtext)).toBeGreaterThan(0)
      expect(warmMs).toBeLessThanOrEqual(coldMs * 1.05)

      // eslint-disable-next-line no-console
      console.info(
        `[benchmark] ${BENCHMARK_CHAR_COUNT} chars @ ${BENCHMARK_FONT_SIZE}: cold=${coldMs.toFixed(2)}ms warm=${warmMs.toFixed(2)}ms`
      )
    },
    120_000
  )

  it('caches SHX glyph geometry on the shape instance after first toGeometry call', async () => {
    const font = await loadTxtFont()
    const shape = font.getCodeShape('A'.charCodeAt(0), BENCHMARK_FONT_SIZE)!

    const first = shape.toGeometry()
    const second = shape.toGeometry()
    expect(second).toBe(first)
  })
})
