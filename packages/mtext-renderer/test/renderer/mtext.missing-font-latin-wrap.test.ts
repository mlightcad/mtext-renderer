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

async function loadFont(
  name: string,
  file: string,
  encoding?: string
): Promise<void> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
  const type = file.endsWith('.shx') ? 'shx' : 'mesh'
  const fontData: FontData = {
    name,
    type,
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

const styleManager = {
  unsupportedTextStyles: {},
  getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
  getLineBasicMaterial: () => new THREE.LineBasicMaterial()
}

/**
 * Regression for drawings whose text style font name is missing from the CDN
 * (common Chinese styles such as "标准"). Falling back to hztxt BIGFONT mapped
 * ASCII to fullwidth cells and made Latin MTEXT wrap incorrectly.
 */
describe('missing style font Latin wrap width', () => {
  const style: TextStyle = {
    name: '标准',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 0.667,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 3,
    font: '标准',
    bigFont: ''
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'keeps FYA/G-AE-01-01-2018 on one line inside AutoCAD defined width',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('modern')
      await loadFont('hztxt', 'hztxt.shx', 'gbk')
      await loadFont('simsun', 'simsun.woff')

      expect(FontManager.instance.findAndReplaceFont('标准')).toBe('simsun')

      const wrapWidth = 31.945271
      const autocadExtents = 29.527606

      const unconstrained = new MText(
        {
          text: '{\\W0.667;\\T1.1;FYA/G-AE-01-01-2018}',
          height: 3,
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
      expect(contentWidth).toBeCloseTo(autocadExtents, 1)
      expect(contentWidth).toBeLessThan(wrapWidth)

      const wrapped = new MText(
        {
          text: '{\\W0.667;\\T1.1;FYA/G-AE-01-01-2018}',
          height: 3,
          width: wrapWidth,
          position: { x: 0, y: 0, z: 0 },
          attachmentPoint: MTextAttachmentPoint.MiddleRight,
          collectCharBoxes: true
        },
        style,
        styleManager as any,
        FontManager.instance as any,
        createDefaultColorSettings()
      )
      wrapped.syncDraw()

      const height = wrapped.box.max.y - wrapped.box.min.y
      // Single visual line: height stays near one cap-height, not ~2× after wrap.
      expect(height).toBeLessThan(5)
    },
    120_000
  )

  it(
    'prefers simsun over hztxt even when hztxt is listed first in defaults',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts(['hztxt', 'simsun'])
      await loadFont('hztxt', 'hztxt.shx', 'gbk')
      await loadFont('simsun', 'simsun.woff')

      expect(FontManager.instance.findAndReplaceFont('标准')).toBe('simsun')
    },
    120_000
  )
})
