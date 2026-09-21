import { MTextColor, MTextContext, MTextParser } from '@mlightcad/mtext-parser'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { MText } from '../../src/renderer/mtext'
import { MTextProcessor } from '../../src/renderer/mtextProcessor'
import { MTextFlowDirection, type TextStyle } from '../../src/renderer/types'

const TEXT = `{\\C256;注：\\C0;2.BBB，\\C256;CCC，\\C7;基础持力层\\C0;。\\C7;基础开挖\\C0;\\P5.钢筋，以\\fSJQY|b0|i0|c134|p2;\\C4;A\\Ftssdeng,hztxt|c134;\\C0;表示}`

function renderWithStyleBigFont(text: string, drawn: string[]) {
  const fonts: Record<string, 'shx' | 'mesh'> = {
    tssdeng: 'shx',
    hztxt: 'shx',
    sjqy: 'mesh',
    arial: 'mesh',
    simsun: 'mesh'
  }

  const fontManager = {
    getFontScaleFactor: () => 1,
    getFontType: (name: string) => fonts[name.toLowerCase()],
    findAndReplaceFont: (name: string) => {
      const key = String(name ?? '').toLowerCase()
      return fonts[key] ? key : 'simsun'
    },
    getFontByName: (name: string) => {
      const type = fonts[String(name).toLowerCase()]
      if (!type) return undefined
      const key = String(name).toLowerCase()
      return {
        type,
        hasChar: (ch: string) => {
          if (key === 'hztxt') return ch.charCodeAt(0) > 127
          if (key === 'tssdeng') return ch.charCodeAt(0) < 128
          return true
        }
      }
    },
    getCharShape: (char: string, font: string) => {
      drawn.push(`${font}:${char}`)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3)
      )
      geometry.setIndex([0, 1])
      return {
        width: 1,
        hasStrokeGeometry: () => true,
        toGeometry: () => geometry
      }
    },
    getCharShapeFromDefaults: () => undefined,
    getCodeShapeFromSymbolFonts: () => undefined,
    getNotFoundTextShape: () => undefined
  }

  const styleManager = {
    getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
    getLineBasicMaterial: () => new THREE.LineBasicMaterial()
  }

  const entity = new MTextColor(4)
  const style: TextStyle = {
    name: 'TSSD_Dimension',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 300,
    font: 'tssdeng',
    bigFont: 'hztxt'
  }

  const processor = new MTextProcessor(
    style,
    {
      byBlockColor: 0x00ffff,
      byLayerColor: 0xffffff,
      layer: 'TEXT',
      color: entity
    },
    styleManager as never,
    fontManager as never,
    {
      fontSize: 300,
      widthFactor: 1,
      lineSpaceFactor: 1,
      horizontalAlignment: 1,
      maxWidth: 0,
      flowDirection: MTextFlowDirection.LEFT_TO_RIGHT,
      byBlockColor: 0x00ffff,
      byLayerColor: 0xffffff,
      removeFontExtension: true,
      collectCharBoxes: true
    }
  )

  const ctx = new MTextContext()
  ctx.color = new MTextColor(4)
  ctx.fontFace.family = 'tssdeng'

  return processor.processText(
    new MTextParser(text, ctx as never, {
      yieldPropertyCommands: true
    }).parse()
  )
}

describe('MTEXT handle 87B2 font and colour context', () => {
  it('restores tssdeng+hztxt after SJQY and keeps \\\\C7 as ACI 7', () => {
    const drawn: string[] = []
    const group = renderWithStyleBigFont(TEXT, drawn)

    const segments: Array<{ text: string; aci: number | null }> = []
    group.traverse(node => {
      const color = node.userData?.mtextColor as MTextColor | undefined
      const chars = node.userData?.layout?.chars as Array<{ char: string }> | undefined
      if (!color || !chars?.length) return
      segments.push({
        text: chars.map(entry => entry.char).join(''),
        aci: color.aci
      })
    })

    const segment = (text: string) => segments.find(item => item.text.includes(text))
    expect(segment('注：')?.aci).toBe(256)
    expect(segment('基础持力层')?.aci).toBe(7)
    expect(segment('基础开挖')?.aci).toBe(7)
    expect(segment('。')?.aci).toBe(0)

    const fontOf = (char: string) =>
      drawn.filter(entry => entry.endsWith(`:${char}`)).at(-1)?.split(':')[0]
    expect(fontOf('以')).toBe('hztxt')
    expect(fontOf('A')).toBe('sjqy')
    expect(fontOf('表')).toBe('hztxt')
    expect(fontOf('示')).toBe('hztxt')
    expect(drawn.some(entry => entry.startsWith('simsun:'))).toBe(false)
  })

  it('restores the style big font after a grouped single-face \\f', () => {
    const drawn: string[] = []
    renderWithStyleBigFont('以{\\fSJQY|b0|i0|c134|p2;A}表', drawn)

    const fontOf = (char: string) =>
      drawn.filter(entry => entry.endsWith(`:${char}`)).at(-1)?.split(':')[0]
    expect(fontOf('以')).toBe('hztxt')
    expect(fontOf('A')).toBe('sjqy')
    expect(fontOf('表')).toBe('hztxt')
  })

  it('keeps a single-face \\f after a nested group closes', () => {
    const drawn: string[] = []
    renderWithStyleBigFont('\\fSJQY|b0|i0;A{\\fArial|b0|i0;B}表', drawn)

    const fontOf = (char: string) =>
      drawn.filter(entry => entry.endsWith(`:${char}`)).at(-1)?.split(':')[0]
    expect(fontOf('A')).toBe('sjqy')
    expect(fontOf('B')).toBe('arial')
    expect(fontOf('表')).toBe('sjqy')
  })
})

describe('MText.getFonts', () => {
  it('splits an inline SHX primary,bigfont pair', () => {
    const fonts = MText.getFonts('\\Ftssdeng.shx,hztxt.shx|c134;A', true)
    expect([...fonts].sort()).toEqual(['hztxt', 'tssdeng'])
  })
})
