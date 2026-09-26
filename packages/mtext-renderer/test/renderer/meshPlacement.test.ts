import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MeshFont } from '../../src/font/meshFont'
import { MText } from '../../src/renderer/mtext'
import {
  CharBoxType,
  createDefaultColorSettings,
  TextStyle
} from '../../src/renderer/types'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

const styleManager = {
  unsupportedTextStyles: {},
  getMeshBasicMaterial: vi
    .fn()
    .mockReturnValue(new THREE.MeshBasicMaterial()),
  getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
}

async function loadAigdt(): Promise<MeshFont> {
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
  const font = FontFactory.instance.createFont(fontData) as MeshFont
  font.names.add('aigdt')
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set('aigdt', font)
  return font
}

function textStyle(): TextStyle {
  return {
    name: 'Standard',
    standardFlag: 0,
    fixedTextHeight: 5,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 5,
    font: 'aigdt',
    bigFont: ''
  }
}

afterEach(() => {
  FontManager.instance.release()
  FontManager.instance.enableFontCache = false
})

describe('mesh glyph placement', () => {
  it(
    'draws repeated mesh glyphs without cloning the cached geometry',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      const font = await loadAigdt()
      font.getCharShape('n', 5)?.toGeometry()

      const text = 'n'.repeat(40)
      const mtext = new MText(
        {
          text,
          height: 5,
          width: 10_000,
          collectCharBoxes: true
        },
        textStyle(),
        styleManager as never,
        FontManager.instance,
        createDefaultColorSettings()
      )

      const originalClone = THREE.BufferGeometry.prototype.clone
      let clones = 0
      THREE.BufferGeometry.prototype.clone = function (
        this: THREE.BufferGeometry
      ) {
        clones++
        return originalClone.call(this)
      }
      try {
        mtext.syncDraw()
      } finally {
        THREE.BufferGeometry.prototype.clone = originalClone
      }

      expect(clones).toBe(0)

      let positionCount = 0
      const boxes: THREE.Box3[] = []
      mtext.traverse(node => {
        const geometry = (node as THREE.Mesh).geometry as
          | THREE.BufferGeometry
          | undefined
        positionCount += geometry?.getAttribute?.('position')?.count ?? 0
        const chars = node.userData?.layout?.chars as
          | Array<{ type: CharBoxType; box: THREE.Box3 }>
          | undefined
        if (!chars) return
        for (const entry of chars) {
          if (entry.type === CharBoxType.CHAR) boxes.push(entry.box)
        }
      })

      expect(positionCount).toBeGreaterThan(0)
      expect(boxes).toHaveLength(text.length)
      const union = boxes[0]!.clone()
      for (const box of boxes.slice(1)) union.union(box)

      let meshBox: THREE.Box3 | undefined
      mtext.traverse(node => {
        const geometry = (node as THREE.Mesh).geometry as
          | THREE.BufferGeometry
          | undefined
        if (!geometry?.getAttribute?.('position')?.count) return
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        meshBox = geometry.boundingBox ?? undefined
      })
      expect(meshBox).toBeDefined()
      expect(union.min.x).toBeCloseTo(meshBox!.min.x, 3)
      expect(union.min.y).toBeCloseTo(meshBox!.min.y, 3)
      expect(union.max.x).toBeCloseTo(meshBox!.max.x, 3)
      expect(union.max.y).toBeCloseTo(meshBox!.max.y, 3)
      mtext.dispose()
    },
    120_000
  )
})
