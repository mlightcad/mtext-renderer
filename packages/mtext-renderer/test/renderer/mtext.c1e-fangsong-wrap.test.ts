import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MText } from '../../src/renderer/mtext'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  TextStyle
} from '../../src/renderer/types'

const LOCAL_SIMFANG_CANDIDATES = [
  path.resolve(
    '../../../cad-viewer-nextjs-demo/cad-data/fonts/simfang.woff'
  ),
  path.resolve('D:/code/cad-data/fonts/simfang.woff')
]
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadSimfangFont(): Promise<void> {
  let data: ArrayBuffer | undefined
  for (const candidate of LOCAL_SIMFANG_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      const buffer = fs.readFileSync(candidate)
      data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )
      break
    }
  }
  if (!data) {
    const response = await fetch(FONT_BASE + 'simfang.woff')
    if (!response.ok) throw new Error('Failed to fetch simfang.woff')
    data = await response.arrayBuffer()
  }

  const aliases = ['simfang', 'SIMFANG', '仿宋体', '仿宋']
  const fontData: FontData = {
    name: 'simfang',
    type: 'mesh',
    data,
    alias: aliases
  }
  const font = FontFactory.instance.createFont(fontData)
  for (const alias of aliases) {
    font.names.add(alias)
    ;(
      FontManager.instance as unknown as {
        loadedFontMap: Map<string, unknown>
      }
    ).loadedFontMap.set(alias.toLowerCase(), font)
  }
}

const styleManager = {
  unsupportedTextStyles: {},
  getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
  getLineBasicMaterial: () => new THREE.LineBasicMaterial()
}

describe('C1E fangsong title cells keep four CJK on one line', () => {
  const style: TextStyle = {
    name: '仿宋',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 35,
    font: 'simfang',
    bigFont: ''
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it('does not wrap 上一版本 / 图纸类型 inside AutoCAD defined width', async () => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = false
    FontManager.instance.setDefaultFonts('modern')
    await loadSimfangFont()

    // From INSERT C1E / block zw$A52F in 自动分料阀-分料板垫板-…0051.dwg.
    // Capital-A SimFang advances sum to ~12.873 while the defined width is
    // ~12.837; AutoCAD still keeps one line (stored extentsWidth ≤ width).
    const height = 2.199999999999996
    const width = 12.836692434746901
    expect(FontManager.instance.getFontScaleFactor('simfang')).toBeGreaterThan(
      1.2
    )

    for (const text of ['上一版本', '图纸类型'] as const) {
      const unconstrained = new MText(
        {
          text,
          height,
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
      unconstrained.syncDraw()
      const contentWidth =
        unconstrained.box.max.x - unconstrained.box.min.x
      // Ink fits the cell; only full-em advances slightly overshoot.
      expect(contentWidth).toBeLessThan(width)

      const wrapped = new MText(
        {
          text,
          height,
          width,
          position: { x: 0, y: 0, z: 0 },
          attachmentPoint: MTextAttachmentPoint.TopLeft,
          collectCharBoxes: true
        },
        style,
        styleManager as any,
        FontManager.instance as any,
        createDefaultColorSettings()
      )
      wrapped.syncDraw()

      let lines = 0
      wrapped.traverse(obj => {
        const layouts = obj.userData?.lineLayouts as unknown[] | undefined
        if (layouts?.length) lines = Math.max(lines, layouts.length)
      })
      const wrappedHeight = wrapped.box.max.y - wrapped.box.min.y

      expect(lines).toBe(1)
      expect(wrappedHeight).toBeLessThan(height * 1.5)
    }
  }, 120_000)
})
