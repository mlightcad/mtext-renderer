import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MText } from '../../src/renderer/mtext'
import {
  CharBoxType,
  createDefaultColorSettings,
  MTextAttachmentPoint,
  TextStyle
} from '../../src/renderer/types'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadShx(
  name: string,
  file: string,
  encoding?: string
): Promise<void> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
  const fontData: FontData = {
    name,
    type: 'shx',
    data: await response.arrayBuffer(),
    encoding,
    alias: [name]
  }
  const font = FontFactory.instance.createFont(fontData)
  font.names.add(name)
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set(name, font)
}

function collectCharBoxes(object: THREE.Object3D) {
  const out: Array<{ char: string; box: THREE.Box3 }> = []
  object.traverse(node => {
    const boxes = node.userData?.layout?.chars as
      | Array<{ type: CharBoxType; char: string; box: THREE.Box3 }>
      | undefined
    if (boxes) {
      for (const entry of boxes) {
        if (entry.type === CharBoxType.CHAR && entry.char) {
          out.push({ char: entry.char, box: entry.box })
        }
      }
    }
  })
  return out
}

describe('isocp hyphen placement', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  const style: TextStyle = {
    name: 'PC_TEXTSTYLE',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 0.667,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 7.5,
    font: 'isocp',
    bigFont: 'hztxt'
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'keeps hyphen vertically between digit bounds in 0.2-0.3 ranges',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      await loadShx('isocp', 'isocp.shx')
      await loadShx('hztxt', 'hztxt.shx', 'gbk')

      const mtext = new MText(
        {
          text: '喷涂深度0.2-0.3,硬度HRC65-71',
          height: 7.5,
          width: 0,
          position: { x: 0, y: 0, z: 0 },
          attachmentPoint: MTextAttachmentPoint.TopLeft,
          collectCharBoxes: true
        },
        style,
        styleManager as any,
        FontManager.instance as any,
        createDefaultColorSettings()
      )

      mtext.syncDraw()

      const boxes = collectCharBoxes(mtext)
      const hyphens = boxes.filter(entry => entry.char === '-')
      const zeros = boxes.filter(entry => entry.char === '0')
      expect(hyphens.length).toBe(2)
      expect(zeros.length).toBeGreaterThan(0)

      const digitMinY = Math.min(...zeros.map(entry => entry.box.min.y))
      const digitMaxY = Math.max(...zeros.map(entry => entry.box.max.y))
      for (const hyphen of hyphens) {
        expect(hyphen.box.min.y).toBeGreaterThan(digitMinY)
        expect(hyphen.box.max.y).toBeLessThan(digitMaxY)
      }
    },
    120_000
  )
})
