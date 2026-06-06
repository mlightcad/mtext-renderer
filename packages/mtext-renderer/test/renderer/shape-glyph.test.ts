import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { MTextColor } from '@mlightcad/mtext-parser'

import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { ShxFont } from '../../src/font/shxFont'
import { MTextProcessor } from '../../src/renderer/mtextProcessor'
import {
  createDefaultColorSettings,
  MTextFlowDirection
} from '../../src/renderer/types'
import { ShxFont as ShxParserFont, ShxFontData, ShxFontType } from '@mlightcad/shx-parser'

function createNamedShapeFont(): ShxFont {
  const fontData: ShxFontData = {
    header: {
      fontType: ShxFontType.SHAPES,
      fileHeader: 'AutoCAD-86 shapes V1.0',
      fileVersion: '1.0'
    },
    content: {
      data: {
        135: new Uint8Array([
          ...new TextEncoder().encode('GRS'),
          0,
          0x01,
          0x80,
          0x02,
          0x00
        ])
      },
      names: { GRS: 135 },
      info: '',
      orientation: 'horizontal',
      baseUp: 8,
      baseDown: 2,
      height: 10,
      width: 10,
      isExtended: false
    }
  }
  const parserFont = new ShxParserFont(fontData)
  return FontFactory.instance.createFont({
    name: 'testshapes',
    alias: ['testshapes'],
    type: 'shx',
    data: parserFont.fontData
  }) as ShxFont
}

describe('MTextProcessor shape glyph rendering', () => {
  it('renders by shape name and falls back to shape number', () => {
    const font = createNamedShapeFont()
    FontManager.instance.loadedFontMap.set('testshapes', font)

    const styleManager = {
      unsupportedTextStyles: {},
      getMeshBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      getLineBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.LineBasicMaterial({ color: 0xffffff }))
    }

    const processor = new MTextProcessor(
      {
        name: 'TEST',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 0,
        font: 'testshapes',
        bigFont: ''
      },
      {
        ...createDefaultColorSettings(),
        color: new MTextColor(256)
      },
      styleManager as any,
      FontManager.instance,
      {
        fontSize: 10,
        widthFactor: 1,
        lineSpaceFactor: 0.3,
        horizontalAlignment: 1,
        maxWidth: 0,
        flowDirection: MTextFlowDirection.BOTTOM_TO_TOP,
        byBlockColor: 0xffffff,
        byLayerColor: 0xffffff,
        removeFontExtension: true,
        collectCharBoxes: false
      }
    )

    const byName = processor.processShapeGlyph('GRS', undefined)
    expect(byName).toBeInstanceOf(THREE.Object3D)

    const byNumber = processor.processShapeGlyph(undefined, 135)
    expect(byNumber).toBeInstanceOf(THREE.Object3D)

    expect(processor.processShapeGlyph('MISSING', undefined)).toBeUndefined()
    expect(processor.processShapeGlyph('MISSING', 999)).toBeUndefined()
    expect(processor.processShapeGlyph(undefined, 999)).toBeUndefined()
  })
})
