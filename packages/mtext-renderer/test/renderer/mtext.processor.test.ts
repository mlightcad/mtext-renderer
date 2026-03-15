import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { MTextColor } from '@mlightcad/mtext-parser'

vi.mock('@mlightcad/mtext-parser', () => {
  class FakeColor {
    isAci = false
    isRgb = true
    rgbValue: number | null = 0xffffff
    private _aci: number | null = null
    private _rgb: [number, number, number] = [255, 255, 255]

    get aci() {
      return this._aci
    }

    set aci(value: number | null) {
      this._aci = value
      this.isAci = value !== null
      if (value !== null) {
        this.isRgb = false
      }
    }

    get rgb() {
      return this._rgb
    }

    set rgb(value: [number, number, number]) {
      this._rgb = value
      this.isRgb = true
      this.isAci = false
      this.rgbValue =
        ((value[0] & 0xff) << 16) | ((value[1] & 0xff) << 8) | (value[2] & 0xff)
      this._aci = null
    }

    copy() {
      const out = new FakeColor()
      out.isAci = this.isAci
      out.isRgb = this.isRgb
      out.rgbValue = this.rgbValue
      out._aci = this._aci
      out._rgb = [...this._rgb] as [number, number, number]
      return out
    }
  }

  class MTextContext {
    continueStroke = false
    color = new FakeColor()
    align = 0
    fontFace = { family: '', style: 'Regular', weight: 400 }
    capHeight = { value: 1, isRelative: true }
    widthFactor = { value: 1, isRelative: true }
    charTrackingFactor = { value: 1, isRelative: true }
    oblique = 0
    paragraph = { align: 1 }
  }

  return {
    MTextColor: FakeColor,
    MTextContext,
    MTextParagraphAlignment: {
      DEFAULT: 0,
      LEFT: 1,
      CENTER: 2,
      RIGHT: 3,
      DISTRIBUTED: 5
    },
    TokenType: {
      WORD: 1,
      STACK: 2,
      SPACE: 3,
      NBSP: 4,
      TABULATOR: 5,
      NEW_PARAGRAPH: 6,
      NEW_COLUMN: 7,
      WRAP_AT_DIMLINE: 8,
      PROPERTIES_CHANGED: 9
    }
  }
})

vi.mock('../../src/font', () => {
  return {
    FontManager: class FontManager {}
  }
})

import {
  MTextFormatOptions,
  MTextProcessor
} from '../../src/renderer/mtextProcessor'
import {
  CharBoxType,
  MTextFlowDirection,
  STACK_DIVIDER_CHAR,
  TextStyle
} from '../../src/renderer/types'

const TOKEN_WORD = 1
const TOKEN_STACK = 2
const TOKEN_SPACE = 3
const TOKEN_NEW_PARAGRAPH = 6
const TOKEN_PROPERTIES_CHANGED = 9

type FakeFontType = 'mesh' | 'shx'

function createProcessor(
  fontType: FakeFontType = 'mesh',
  optionsOverride: Partial<MTextFormatOptions> = {}
) {
  const style: TextStyle = {
    name: 'default',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 24,
    font: 'simkai',
    bigFont: ''
  }

  const options: MTextFormatOptions = {
    fontSize: 24,
    widthFactor: 1,
    lineSpaceFactor: 0.3,
    horizontalAlignment: 1,
    maxWidth: 0,
    flowDirection: MTextFlowDirection.LEFT_TO_RIGHT,
    byBlockColor: 0x123456,
    byLayerColor: 0xabcdef,
    removeFontExtension: true,
    collectCharBoxes: false,
    ...optionsOverride
  }

  const colorSettings = {
    byBlockColor: options.byBlockColor,
    byLayerColor: options.byLayerColor,
    layer: '0',
    color: new MTextColor(256)
  }

  const fontManager = {
    getFontScaleFactor: () => 1,
    getFontType: () => fontType,
    findAndReplaceFont: (name: string) => name,
    getCharShape: (char: string) => {
      if (!char || char === ' ') return undefined
      return {
        width: 1,
        toGeometry: () => {
          const shape = new THREE.Shape()
          shape.moveTo(0, 0)
          shape.lineTo(1, 0)
          shape.lineTo(1, 1)
          shape.lineTo(0, 1)
          shape.lineTo(0, 0)
          return new THREE.ShapeGeometry(shape)
        }
      }
    },
    getNotFoundTextShape: () => undefined
  }

  const styleManager = {
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    getLineBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.LineBasicMaterial({ color: 0xffffff }))
  }

  const processor = new MTextProcessor(
    style,
    colorSettings as any,
    styleManager as any,
    fontManager as any,
    options
  )

  return { processor, style, options }
}

function getCurrentContext(processor: MTextProcessor) {
  return (processor as any)._currentContext
}

function getContextStackSize(processor: MTextProcessor) {
  return ((processor as any)._contextStack as unknown[]).length
}

function getInternalLineCount(processor: MTextProcessor) {
  return (processor as any)._lineCount as number
}

function getAllCharBoxes(object: THREE.Object3D) {
  const out: Array<{ type: CharBoxType; char: string; box: THREE.Box3 }> = []
  object.traverse(node => {
    const boxes = node.userData?.layout?.chars as
      | Array<{ type: CharBoxType; char: string; box: THREE.Box3 }>
      | undefined
    if (boxes) {
      out.push(...boxes)
    }
  })
  return out
}

function getCharBoxTypes(object: THREE.Object3D) {
  const out: string[] = []
  object.traverse(node => {
    if (node.userData?.charBoxType) {
      out.push(String(node.userData.charBoxType))
    }
  })
  return out
}

function getLineLayouts(object: THREE.Object3D) {
  return (
    (object.userData?.lineLayouts as
      | Array<{ y: number; height: number; breakIndex?: number }>
      | undefined) ?? []
  )
}

describe('MTextProcessor format state', () => {
  it('uses by-block and by-layer colors for ACI 0/256', () => {
    const { processor, options } = createProcessor()

    processor.processFormat({
      command: 'C',
      changes: { aci: 0 },
      depth: 0
    } as any)
    expect(getCurrentContext(processor).getColorAsHex()).toBe(
      options.byBlockColor
    )

    processor.processFormat({
      command: 'C',
      changes: { aci: 256 },
      depth: 0
    } as any)
    expect(getCurrentContext(processor).getColorAsHex()).toBe(
      options.byLayerColor
    )
  })

  it('applies rgb color overrides', () => {
    const { processor } = createProcessor()

    processor.processFormat({
      command: 'c',
      changes: { rgb: [17, 34, 51] },
      depth: 0
    } as any)

    expect(getCurrentContext(processor).getColorAsHex()).toBe(0x112233)
  })

  it('restores context after a grouped color+font change', () => {
    const { processor, options } = createProcessor('mesh')

    const tokens = [
      {
        type: TOKEN_PROPERTIES_CHANGED,
        ctx: null,
        data: { command: 'C', changes: { aci: 10 }, depth: 1 }
      },
      {
        type: TOKEN_PROPERTIES_CHANGED,
        ctx: null,
        data: {
          command: 'F',
          changes: {
            fontFace: { family: 'Arial', style: 'Italic', weight: 700 }
          },
          depth: 1
        }
      },
      {
        type: TOKEN_PROPERTIES_CHANGED,
        ctx: null,
        data: {
          command: undefined,
          changes: {
            aci: 256,
            fontFace: { family: '', style: 'Regular', weight: 400 }
          },
          depth: 0
        }
      }
    ]

    processor.processText(tokens as any)

    const context = getCurrentContext(processor)
    expect(context.getColorAsHex()).toBe(options.byLayerColor)
    expect(getContextStackSize(processor)).toBe(0)
  })

  it('sets italic and bold for mesh fonts from \\F command style/weight', () => {
    const { processor } = createProcessor('mesh')

    processor.processFormat({
      command: 'F',
      changes: {
        fontFace: { family: 'Arial', style: 'Italic', weight: 700 }
      },
      depth: 0
    } as any)

    const context = getCurrentContext(processor)
    expect(context.italic).toBe(true)
    expect(context.bold).toBe(true)
    expect(context.oblique).toBe(0)
  })

  it('maps italic to oblique for shx fonts and keeps mesh flags off', () => {
    const { processor } = createProcessor('shx')

    processor.processFormat({
      command: 'F',
      changes: {
        fontFace: { family: 'txt.shx', style: 'Italic', weight: 700 }
      },
      depth: 0
    } as any)

    const context = getCurrentContext(processor)
    expect(context.italic).toBe(false)
    expect(context.bold).toBe(false)
    expect(context.oblique).toBe(15)
  })

  it('creates STACK char-box groups and divider marker for fraction stack', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      {
        type: TOKEN_STACK,
        ctx: null,
        data: ['1', '2', '/']
      }
    ] as any)

    const types = getCharBoxTypes(obj)
    expect(types).toContain(CharBoxType.STACK)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('1')
    expect(chars).toContain('2')
    expect(chars).toContain(STACK_DIVIDER_CHAR)
  })

  it('treats superscript stack as CHAR and does not add divider marker', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      {
        type: TOKEN_STACK,
        ctx: null,
        data: ['2', '', '^']
      }
    ] as any)

    const types = getCharBoxTypes(obj)
    expect(types).toContain(CharBoxType.CHAR)
    expect(types).not.toContain(CharBoxType.STACK)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('2')
    expect(chars).not.toContain(STACK_DIVIDER_CHAR)
  })

  it('does not store paragraph-break char boxes on paragraph break', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('A')
    expect(chars).not.toContain('\n')
  })

  it('advances offset by blank width when processing SPACE token', () => {
    const { processor } = createProcessor('mesh')

    processor.processText([{ type: TOKEN_SPACE, ctx: null, data: null }] as any)

    expect(processor.hOffset).toBeCloseTo(24 * 0.3, 6)
  })

  it('accumulates vertical offset and height for consecutive empty lines', () => {
    const { processor } = createProcessor('mesh')

    processor.processText([
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    expect(processor.vOffset).toBeCloseTo(-72, 3)
    expect(getInternalLineCount(processor)).toBe(3)
    expect(processor.totalHeight).toBeCloseTo(72, 3)
  })

  it('does not add paragraph marker char boxes between words', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'B' }
    ] as any)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('A')
    expect(chars).toContain('B')
    expect(chars).not.toContain('\n')
  })

  it('resets horizontal offset after explicit line break', () => {
    const { processor } = createProcessor('mesh')

    processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'B' }
    ] as any)

    expect(processor.hOffset).toBe(1)
    expect(getInternalLineCount(processor)).toBe(2)
  })

  it('counts a trailing empty line in total height', () => {
    const { processor } = createProcessor('mesh')

    processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    expect(processor.totalHeight).toBeCloseTo(60, 3)
    expect(getInternalLineCount(processor)).toBe(2)
  })

  it('keeps no trailing empty-line paragraph marker chars for "Unicode\\\\P"', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'Unicode' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('U')
    expect(chars).not.toContain('\n')
  })

  it('keeps leading and trailing empty lines without paragraph marker chars', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'Unicode' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('U')
    expect(chars).not.toContain('\n')
    expect(processor.totalHeight).toBeCloseTo(72, 3)
  })

  it('applies lineSpaceFactor to trailing empty lines without marker chars', () => {
    const { processor } = createProcessor('mesh', { lineSpaceFactor: 0.5 })
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'Unicode' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null }
    ] as any)

    const chars = getAllCharBoxes(obj).map(entry => entry.char)
    expect(chars).toContain('U')
    expect(chars).not.toContain('\n')
    const lines = getLineLayouts(obj)
    expect(lines).toHaveLength(2)
    expect(lines[0].height).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[1].height).toBeCloseTo(processor.currentLineHeight, 3)
  })

  it('stores one line layout entry for single-line text', () => {
    const { processor } = createProcessor('mesh')

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' }
    ] as any)
    const lines = getLineLayouts(obj)

    expect(lines).toHaveLength(1)
    expect(lines[0].height).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[0].y).toBeCloseTo(-6, 3)
  })

  it('stores line layouts for explicit empty lines', () => {
    const { processor } = createProcessor('mesh')

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'B' }
    ] as any)
    const lines = getLineLayouts(obj)

    expect(lines).toHaveLength(3)
    expect(lines[0].height).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[1].height).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[2].height).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[0].y - lines[1].y).toBeCloseTo(processor.currentLineHeight, 3)
    expect(lines[1].y - lines[2].y).toBeCloseTo(processor.currentLineHeight, 3)
  })

  it('stores per-line breakIndex on line layouts', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'B' }
    ] as any)

    const lines = getLineLayouts(obj)
    const charCount = getAllCharBoxes(obj).length

    expect(lines).toHaveLength(2)
    expect(lines[0].breakIndex).toBeDefined()
    expect(lines[0].breakIndex!).toBeGreaterThan(0)
    expect(lines[0].breakIndex!).toBeLessThanOrEqual(charCount)
    expect(lines[1].breakIndex).toBeUndefined()
  })

  it('stores non-decreasing breakIndex values with explicit empty lines', () => {
    const { processor } = createProcessor('mesh')
    ;(processor as any)._options.collectCharBoxes = true

    const obj = processor.processText([
      { type: TOKEN_WORD, ctx: null, data: 'A' },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_NEW_PARAGRAPH, ctx: null, data: null },
      { type: TOKEN_WORD, ctx: null, data: 'B' }
    ] as any)

    const lines = getLineLayouts(obj)
    const breakIndices = lines
      .map(line => line.breakIndex)
      .filter((value): value is number => value !== undefined)

    expect(lines).toHaveLength(3)
    expect(breakIndices).toHaveLength(2)
    expect(breakIndices[0]).toBeLessThanOrEqual(breakIndices[1])
    expect(lines[2].breakIndex).toBeUndefined()
  })
})
