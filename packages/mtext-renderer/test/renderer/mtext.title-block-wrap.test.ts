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
 * Regression for title-block MTEXT that AutoCAD keeps as two explicit \\P lines
 * when the style uses a CJK TrueType face (SimFang). Latin-'A'-based mesh scale
 * previously inflated advances (~1.4×) and forced soft wraps inside the defined
 * width.
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
    'keeps each explicit paragraph line unwrapped inside AutoCAD defined width',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('modern')
      await loadSimfangFont()

      expect(FontManager.instance.getFontScaleFactor('SIMFANG')).toBe(1)

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

      const softBreaks: number[] = []
      let lineCount = 0
      wrapped.traverse(obj => {
        const lines = obj.userData?.lineLayouts as
          | Array<{ breakIndex?: number }>
          | undefined
        if (!lines?.length) return
        lineCount = Math.max(lineCount, lines.length)
        lines.forEach(line => {
          if (line.breakIndex != null) softBreaks.push(line.breakIndex)
        })
      })

      const uBox = unconstrained.box
      const wBox = wrapped.box
      const unconstrainedWidth = uBox.max.x - uBox.min.x
      const wrappedHeight = wBox.max.y - wBox.min.y
      const unconstrainedHeight = uBox.max.y - uBox.min.y

      expect(FontManager.instance.getFontScaleFactor('SIMFANG')).toBe(1)
      expect(unconstrainedWidth).toBeLessThanOrEqual(width + 1)
      // Two explicit \\P lines only — soft wrap would add more height/lines.
      expect(lineCount).toBe(2)
      expect(wrappedHeight).toBeLessThanOrEqual(unconstrainedHeight + 1)
      // One breakIndex for the explicit \\P between the two visual lines.
      expect(softBreaks.length).toBe(1)
    },
    120_000
  )
})
