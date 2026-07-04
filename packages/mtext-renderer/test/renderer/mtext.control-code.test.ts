import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MeshFont } from '../../src/font/meshFont'
import { ShxFont } from '../../src/font/shxFont'
import { MText } from '../../src/renderer/mtext'
import {
  CharBoxType,
  createDefaultColorSettings,
  MTextAttachmentPoint,
  TextStyle
} from '../../src/renderer/types'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

async function loadShx(name: string, file: string): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
  const fontData: FontData = {
    name,
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

async function loadMeshFont(name: string, file: string): Promise<MeshFont> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) throw new Error(`Failed to fetch ${file}`)
  const fontData: FontData = {
    name,
    type: 'mesh',
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as MeshFont
}

function registerFont(name: string, font: ShxFont | MeshFont) {
  const key = name.toLowerCase()
  font.names.add(key)
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set(key, font)
}

function collectCharBoxes(object: THREE.Object3D) {
  const out: Array<{ char: string; box: THREE.Box3 }> = []
  object.traverse(node => {
    const boxes = node.userData?.layout?.chars as
      | Array<{ type: CharBoxType; char: string; box: THREE.Box3 }>
      | undefined
    if (boxes) {
      for (const entry of boxes) {
        if (entry.type === CharBoxType.CHAR) {
          out.push({ char: entry.char, box: entry.box })
        }
      }
    }
  })
  return out
}

describe('controlCode example %%1326@600 (integration)', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'renders %%132 from amgdt and keeps 6@600 as trailing text',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('minimal')

      registerFont('txt', await loadShx('txt', 'txt.shx'))
      registerFont('amgdt', await loadShx('amgdt', 'amgdt.shx'))

      const ch132 = String.fromCharCode(132)
      const amgdt132 = FontManager.instance.getCodeShapeFromSymbolFonts(132, 10)
      const geometry = amgdt132?.toGeometry()
      geometry?.computeBoundingBox()

      expect((geometry?.attributes.position?.count ?? 0) > 0).toBe(true)
      expect((amgdt132?.width ?? 0) > 7).toBe(true)
      expect((amgdt132?.width ?? 0)).toBeGreaterThanOrEqual(10)

      const style: TextStyle = {
        name: 'standard',
        standardFlag: 0,
        fixedTextHeight: 10,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 10,
        font: 'txt',
        bigFont: ''
      }

      const mtext = new MText(
        {
          text: '{Unicode character: %%130 %%131 %%1326@600}',
          height: 10,
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
      const ch132Box = boxes.find(entry => entry.char === ch132)
      const sixBox = boxes.find(entry => entry.char === '6')

      expect(ch132Box).toBeDefined()
      expect((ch132Box!.box.max.x - ch132Box!.box.min.x) > 0).toBe(true)
      expect(sixBox).toBeDefined()
      expect(sixBox!.box.min.x).toBeGreaterThanOrEqual(ch132Box!.box.max.x - 0.01)
      const gap132ToSix = sixBox!.box.min.x - ch132Box!.box.max.x
      expect(gap132ToSix).toBeGreaterThan(1.5)
      expect(boxes.map(entry => entry.char).join('')).toContain('6@600')
    },
    120_000
  )
})

/** MTEXT contents from Drawing1.dwg handles 51E / 51B (ISO hole callouts). */
const DRAWING1_MTEXT_51E =
  '4-\\fAIGDT|b0|i0;\\H5.0000;n\\f仿宋|b0|i0;\\H5.0000;7 通孔\\P\\fAIGDT|b0|i0;\\H5.0000;v\\f仿宋|b0|i0;\\H5.0000; \\fAIGDT|b0|i0;\\H5.0000;n\\f仿宋|b0|i0;\\H5.0000;11 \\fAIGDT|b0|i0;\\H5.0000;x\\f仿宋|b0|i0;\\H5.0000; 6'

describe('Drawing1 ISO hole callout MText (\\fAIGDT inline font)', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it(
    'renders handle 51E with loaded AIGDT.ttf instead of default text fallback',
    async () => {
      FontManager.instance.release()
      FontManager.instance.enableFontCache = false
      FontManager.instance.setDefaultFonts('minimal')

      registerFont('aigdt', await loadMeshFont('aigdt', 'AIGDT.ttf'))
      registerFont('txt', await loadShx('txt', 'txt.shx'))

      expect(FontManager.instance.findAndReplaceFont('AIGDT')).toBe('AIGDT')

      const nShape = FontManager.instance.getCharShape('n', 'AIGDT', 5)
      expect(nShape).toBeDefined()
      expect((nShape!.toGeometry().attributes.position?.count ?? 0) > 0).toBe(
        true
      )

      const style: TextStyle = {
        name: 'standard',
        standardFlag: 0,
        fixedTextHeight: 5,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 5,
        font: 'txt',
        bigFont: ''
      }

      const mtext = new MText(
        {
          text: DRAWING1_MTEXT_51E,
          height: 5,
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

      const rendered = collectCharBoxes(mtext).map(entry => entry.char).join('')
      expect(rendered).toContain('n')
      expect(rendered).toContain('v')
      expect(rendered).toContain('x')
      expect(rendered).toContain('通孔')
    },
    120_000
  )
})
