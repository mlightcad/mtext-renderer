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
        if (entry.type === CharBoxType.CHAR && entry.char.trim()) {
          out.push({ char: entry.char, box: entry.box })
        }
      }
    }
  })
  return out.sort((a, b) => a.box.min.x - b.box.min.x)
}

function spreadMinY(
  boxes: Array<{ char: string; box: THREE.Box3 }>,
  pattern: RegExp
) {
  const matched = boxes.filter(entry => pattern.test(entry.char))
  expect(matched.length).toBeGreaterThan(0)
  const minYs = matched.map(entry => entry.box.min.y)
  return Math.max(...minYs) - Math.min(...minYs)
}

describe('PC_TEXTSTYLE isocp + hztxt mixed baseline', () => {
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
    'aligns isocp ASCII and hztxt CJK on one baseline for 1.调质:HB 250～280;',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      await loadShx('isocp', 'isocp.shx')
      await loadShx('hztxt', 'hztxt.shx', 'gbk')

      const mtext = new MText(
        {
          text: '1.调质:HB 250～280;',
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
      const rendered = boxes.map(entry => entry.char).join('')
      expect(rendered.replace(/\s/g, '')).toBe('1.调质:HB250～280;')

      expect(spreadMinY(boxes, /[0-9A-Za-z.:;]/)).toBeLessThan(2)
      expect(spreadMinY(boxes, /[\u4e00-\u9fff～]/)).toBeLessThan(25)

      const asciiMinY = boxes
        .filter(entry => /[0-9A-Za-z.:;]/.test(entry.char))
        .reduce((sum, entry) => sum + entry.box.min.y, 0)
      const cjkMinY = boxes
        .filter(entry => /[\u4e00-\u9fff～]/.test(entry.char))
        .reduce((sum, entry) => sum + entry.box.min.y, 0)
      const asciiCount = boxes.filter(entry => /[0-9A-Za-z.:;]/.test(entry.char)).length
      const cjkCount = boxes.filter(entry => /[\u4e00-\u9fff～]/.test(entry.char)).length

      expect(Math.abs(asciiMinY / asciiCount - cjkMinY / cjkCount)).toBeLessThan(2)
    },
    120_000
  )
})
