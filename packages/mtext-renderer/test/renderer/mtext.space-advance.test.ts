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

async function loadFont(file: string, type: 'mesh' | 'shx'): Promise<string> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
  const name = file.replace(/\.(woff|shx)$/i, '')
  const fontData: FontData = {
    name,
    type,
    data: await response.arrayBuffer(),
    alias: [name]
  }
  const font = FontFactory.instance.createFont(fontData)
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set(name, font)
  return name
}

const styleManager = {
  unsupportedTextStyles: {},
  getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
  getLineBasicMaterial: () => new THREE.LineBasicMaterial()
}

function style(font: string, height: number): TextStyle {
  return {
    name: 'Standard',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: height,
    font,
    bigFont: ''
  }
}

type MTextArgs = ConstructorParameters<typeof MText>

/** Logical pen advance of a one-line MText. */
async function advance(text: string, font: string, height: number) {
  const mtext = new MText(
    {
      text,
      height,
      width: 0,
      widthFactor: 1,
      position: { x: 0, y: 0, z: 0 },
      attachmentPoint: MTextAttachmentPoint.TopLeft,
      collectCharBoxes: true
    },
    style(font, height),
    styleManager as unknown as MTextArgs[2],
    FontManager.instance as unknown as MTextArgs[3],
    createDefaultColorSettings()
  )
  await mtext.asyncDraw()
  return mtext.children[0]?.userData?.logicalAdvanceWidth as number
}

/**
 * A space must advance by the font's own space width at the size the glyphs
 * are drawn with. It used to be measured before the font scale factor was
 * applied (and not again after `\H`), so TrueType spaces came out ~1/1.4 too
 * narrow and columns laid out with spaces drifted.
 */
describe('space advance follows the glyph size', () => {
  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it.each([
    ['arial.woff', 'mesh'],
    ['romans.shx', 'shx']
  ] as const)(
    '%s: a space is as wide relative to a letter as in the font',
    async (file, type) => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      const font = await loadFont(file, type)
      const loaded = FontManager.instance.getFontByName(font)!
      const size = 10
      // the font's own ratio of a space to a letter, independent of size
      const ratio =
        loaded.getCharShape(' ', size)!.width /
        loaded.getCharShape('H', size)!.width

      for (const text of ['H H', '{\\H2x;H H}']) {
        const height = 2.5
        const withSpace = await advance(text, font, height)
        const without = await advance(text.replace(' ', ''), font, height)
        const letter = without / 2
        expect((withSpace - without) / letter, `${file} ${text}`).toBeCloseTo(
          ratio,
          2
        )
      }
    },
    120_000
  )
})
