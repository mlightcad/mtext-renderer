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

function averageMinY(
  boxes: Array<{ char: string; box: THREE.Box3 }>,
  pattern: RegExp
) {
  const matched = boxes.filter(entry => pattern.test(entry.char))
  expect(matched.length).toBeGreaterThan(0)
  const sum = matched.reduce((total, entry) => total + entry.box.min.y, 0)
  return sum / matched.length
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

describe('TSSD_Dimension mixed CJK and ASCII baseline', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  const style: TextStyle = {
    name: 'TSSD_Dimension',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 0.7,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 300,
    font: 'tssdeng',
    bigFont: 'hztxt'
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'keeps CJK and trailing elevation digits on the same baseline for {\\W0.7;四层楼面~55.350}',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      await loadShx('tssdeng', 'tssdeng.shx')
      await loadShx('hztxt', 'hztxt.shx', 'gbk')

      const mtext = new MText(
        {
          text: '{\\W0.7;四层楼面~55.350}',
          height: 300,
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
      expect(boxes.map(entry => entry.char).join('')).toBe('四层楼面~55.350')

      // tssdeng elevation digits share one baseline (exclude ~ which sits higher in-cell).
      expect(spreadMinY(boxes, /[0-9.]/)).toBeLessThan(5)

      // hztxt CJK glyphs sit on a consistent baseline band (allow per-glyph ink variance).
      expect(spreadMinY(boxes, /[\u4e00-\u9fff]/)).toBeLessThan(25)

      const cjkBaseline = averageMinY(boxes, /[\u4e00-\u9fff]/)
      const digitBaseline = averageMinY(boxes, /[0-9.]/)
      const baselineGap = Math.abs(cjkBaseline - digitBaseline)
      // tssdeng elevation digits sit slightly lower than hztxt CJK ink boxes at large heights.
      expect(baselineGap).toBeLessThan(300 * 0.07)
    },
    120_000
  )
})
