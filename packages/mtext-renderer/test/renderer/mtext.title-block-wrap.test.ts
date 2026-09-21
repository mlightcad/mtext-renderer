import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MText } from '../../src/renderer/mtext'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  TextStyle
} from '../../src/renderer/types'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'
const LOCAL_SIMFANG = path.resolve('D:/code/cad-data/fonts/simfang.woff')

async function loadSimfangFont(): Promise<void> {
  let data: ArrayBuffer
  if (fs.existsSync(LOCAL_SIMFANG)) {
    const buffer = fs.readFileSync(LOCAL_SIMFANG)
    data = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  } else {
    const response = await fetch(FONT_BASE + 'simfang.woff')
    if (!response.ok) throw new Error(`Failed to fetch simfang.woff`)
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

/**
 * Regression for title-block MTEXT that uses a CJK TrueType face (SimFang).
 * Capital-A height mapping widens advances; soft wraps inside the defined
 * width are expected when unconstrained content exceeds that width.
 */
describe('title-block MTEXT wrap (问题四)', () => {
  const style: TextStyle = {
    name: '仿宋体',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 67.5,
    font: 'SIMFANG',
    bigFont: ''
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'applies capital-A scale and soft-wraps when content exceeds defined width',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('modern')
      await loadSimfangFont()

      const scale = FontManager.instance.getFontScaleFactor('SIMFANG')
      expect(scale).toBeGreaterThan(1.2)

      const text =
        '{\\T1.45;  熊集镇赵庙等6个村高标准农田建设项目规划图\\P（枣阳市2017年农业综合开发高标准农田建设项目）}'
      const width = 2252.7342659142396
      const height = 67.5

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

      let unconstrainedLines = 0
      let wrappedLines = 0
      unconstrained.traverse(obj => {
        const lines = obj.userData?.lineLayouts as unknown[] | undefined
        if (lines?.length) unconstrainedLines = Math.max(unconstrainedLines, lines.length)
      })
      wrapped.traverse(obj => {
        const lines = obj.userData?.lineLayouts as unknown[] | undefined
        if (lines?.length) wrappedLines = Math.max(wrappedLines, lines.length)
      })

      const unconstrainedWidth = unconstrained.box.max.x - unconstrained.box.min.x
      // Capital-A scale makes unconstrained content wider than the title-block cell.
      expect(unconstrainedWidth).toBeGreaterThan(width)
      // Explicit \\P yields two paragraphs; each may soft-wrap inside the cell.
      expect(unconstrainedLines).toBe(2)
      expect(wrappedLines).toBeGreaterThan(unconstrainedLines)
    },
    120_000
  )
})
