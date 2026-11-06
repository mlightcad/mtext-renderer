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

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'
const LOCAL_FONT_DIRS = [
  path.resolve('/Users/leaf/Documents/code/cad-data/fonts'),
  path.resolve(
    '/Users/leaf/Documents/code/cad-viewer-nextjs-demo/cad-data/fonts'
  ),
  path.resolve(process.cwd(), '../../../cad-data/fonts'),
  path.resolve(process.cwd(), '../../../../cad-data/fonts'),
  path.resolve('D:/code/cad-data/fonts')
]

function findLocalFont(fileName: string): string | undefined {
  for (const dir of LOCAL_FONT_DIRS) {
    for (const candidate of [
      fileName,
      fileName.toUpperCase(),
      fileName.toLowerCase()
    ]) {
      const full = path.join(dir, candidate)
      if (fs.existsSync(full)) return full
    }
  }
  return undefined
}

async function loadFontBuffer(fileName: string): Promise<ArrayBuffer> {
  const local = findLocalFont(fileName)
  if (local) {
    const buffer = fs.readFileSync(local)
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  }
  const response = await fetch(FONT_BASE + fileName)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`)
  }
  return response.arrayBuffer()
}

async function loadShx(
  fileName: string,
  aliases: string[],
  encoding?: string
): Promise<string> {
  const data = await loadFontBuffer(fileName)
  const baseName = path.parse(fileName).name
  const fontData: FontData = {
    name: baseName,
    type: 'shx',
    data,
    alias: aliases,
    encoding
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
  return baseName
}

const styleManager = {
  unsupportedTextStyles: {},
  getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
  getLineBasicMaterial: () => new THREE.LineBasicMaterial()
}

/**
 * Title-block labels from (A)调速器安装座.dwg use TXT + Japanese `bigfont`
 * (Shift-JIS). Simplified ideographs (图/审/编/标) are not in that code page.
 * Resolution must fall through to another loaded BIGFONT (`gbcbig` / GBK) —
 * not a half-width mesh substitute — so following glyphs keep their column.
 */
describe('title-block TopLeft bigfont code-page fallback', () => {
  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'resolves simplified CJK via loaded gbcbig when style bigfont is Japanese',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts(['gbcbig', 'simsun'])
      await loadShx('txt.shx', ['txt', 'TXT'])
      await loadShx('bigfont.shx', ['bigfont', 'BIGFONT'], 'shift-jis')
      await loadShx('gbcbig.shx', ['gbcbig', 'GBCBIG'], 'gbk')

      const height = 3.5
      const widthFactor = 0.7
      const style: TextStyle = {
        name: 'SLDTEXTSTYLE0',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: height,
        font: 'TXT',
        bigFont: 'bigfont'
      }

      const cases: Array<{ label: string; text: string }> = [
        { label: 'AF', text: '图\\M+18D86' },
        { label: '9C', text: '审\\M+18A6A' },
        { label: 'AC', text: '图\\M+196BC' },
        { label: 'AE', text: '编\\M+18D86' },
        { label: 'B8', text: '标\\M+18F79\\M+189BB' }
      ]

      for (const { label, text } of cases) {
        const mtext = new MText(
          {
            text,
            height,
            width: 0,
            widthFactor,
            position: { x: 0, y: 0, z: 0 },
            attachmentPoint: MTextAttachmentPoint.TopLeft,
            collectCharBoxes: true
          },
          style,
          styleManager as any,
          FontManager.instance as any,
          createDefaultColorSettings()
        )
        await mtext.asyncDraw()

        const advance = mtext.children[0]?.userData
          ?.logicalAdvanceWidth as number
        const layout = mtext.createLayoutData()
        const inkWidths = layout.chars.map(c => c.box.max.x - c.box.min.x)

        // Broken path used a ~1.225-wide substitute; gbcbig CJK ink at
        // height 3.5 × widthFactor 0.7 is typically ~1.6–2.7 (strokes do not
        // fill the whole cell). Require first glyph comparable to the last.
        expect(inkWidths[0], `${label} first glyph`).toBeGreaterThan(1.5)
        expect(
          inkWidths[0] / inkWidths[inkWidths.length - 1],
          `${label} first/last ink ratio`
        ).toBeGreaterThan(0.55)

        // Pen advances by BIGFONT cell × widthFactor (≈2.45), not ink width.
        expect(advance, `${label} advance`).toBeGreaterThan(
          2.2 * layout.chars.length
        )
      }
    },
    120_000
  )
})
