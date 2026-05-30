import * as THREE from 'three'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { MText } from '../../src/renderer/mtext'
import {
  CharBoxType,
  createDefaultColorSettings,
  MTextAttachmentPoint,
  TextStyle
} from '../../src/renderer/types'

const PAGE_LABEL = '共1页第1页'
/** DXF TEXT value for page total (five spaces between 共 and 页). */
const PAGE_TOTAL_TEXT = ' 共     页 '
/** DXF TEXT value for page index (five spaces between 第 and 页). */
const PAGE_INDEX_TEXT = ' 第     页 '
/** Insertion-point gap between the two TEXT entities in 机械工差.dxf. */
const DXF_TEXT_INSERTION_GAP = 16.938
const FONT_BASE = 'https://mlightcad.gitlab.io/cad-data/fonts/'

async function registerShxFont(name: string, file: string, encoding?: string) {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file}: ${response.status}`)
  }
  const fontData: FontData = {
    name,
    type: 'shx',
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

type CharBoxEntry = {
  type: CharBoxType
  char: string
  box: THREE.Box3
}

function collectCharBoxes(object: THREE.Object3D): CharBoxEntry[] {
  const out: CharBoxEntry[] = []
  object.traverse(node => {
    const boxes = node.userData?.layout?.chars as CharBoxEntry[] | undefined
    if (boxes) {
      out.push(...boxes)
    }
  })
  return out
}

function charBoxesInReadingOrder(boxes: CharBoxEntry[]) {
  return [...boxes]
    .filter(
      entry => entry.type === CharBoxType.CHAR && entry.char.trim() !== ''
    )
    .sort((a, b) => a.box.min.x - b.box.min.x)
}

function assertNoHorizontalOverlap(ordered: CharBoxEntry[], epsilon = 1e-4) {
  for (let i = 0; i < ordered.length - 1; i++) {
    const left = ordered[i]
    const right = ordered[i + 1]
    expect(
      left.box.max.x,
      `“${left.char}” overlaps “${right.char}” (${left.box.max.x} > ${right.box.min.x})`
    ).toBeLessThanOrEqual(right.box.min.x + epsilon)
  }
}

describe('MText CJK layout regression', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  const style: TextStyle = {
    name: 'standard',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 10,
    font: 'txt',
    bigFont: 'hztxt'
  }

  beforeAll(async () => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = false
    await registerShxFont('txt', 'txt.shx')
    await registerShxFont('hztxt', 'hztxt.shx', 'gbk')
    await registerShxFont('isocp', 'isocp.shx')
  })

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it('does not overlap “页” and “第” when rendering page label text', () => {
    const fontManager = FontManager.instance

    const mtext = new MText(
      {
        text: PAGE_LABEL,
        height: 10,
        width: 0,
        position: { x: 0, y: 0, z: 0 },
        attachmentPoint: MTextAttachmentPoint.TopLeft,
        collectCharBoxes: true
      },
      style,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )

    mtext.syncDraw()

    const ordered = charBoxesInReadingOrder(collectCharBoxes(mtext))
    expect(ordered.map(entry => entry.char).join('')).toBe(PAGE_LABEL)

    const pageIndex = ordered.findIndex(entry => entry.char === '页')
    const diIndex = ordered.findIndex(
      (entry, index) => entry.char === '第' && index > pageIndex
    )
    expect(pageIndex).toBeGreaterThanOrEqual(0)
    expect(diIndex).toBeGreaterThan(pageIndex)

    const pageBox = ordered[pageIndex].box
    const diBox = ordered[diIndex].box
    expect(pageBox.max.x).toBeLessThanOrEqual(diBox.min.x + 1e-4)

    assertNoHorizontalOverlap(ordered)
  })
})

describe('SHX space width (PC_TEXTSTYLE / isocp)', () => {
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }

  const pcTextStyle: TextStyle = {
    name: 'PC_TEXTSTYLE',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: 5,
    font: 'isocp',
    bigFont: 'hztxt'
  }

  beforeAll(async () => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = false
    await registerShxFont('isocp', 'isocp.shx')
    await registerShxFont('hztxt', 'hztxt.shx', 'gbk')
  })

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.enableFontCache = true
  })

  it('uses the isocp space glyph advance instead of half the text height', () => {
    const fontManager = FontManager.instance
    const spaceShape = fontManager.getCharShape(' ', 'isocp', 5)
    expect(spaceShape).toBeDefined()
    expect(spaceShape!.width).toBeCloseTo(1.538, 2)
    expect(spaceShape!.width).toBeLessThan(5 * 0.5)
  })

  it('keeps “ 共     页 ” narrow enough to avoid overlapping “ 第     页 ”', () => {
    const fontManager = FontManager.instance
    const widthFactor = 0.6669999957084656

    const totalLabel = new MText(
      {
        text: PAGE_TOTAL_TEXT,
        height: 5,
        width: 0,
        widthFactor,
        position: { x: 0, y: 0, z: 0 },
        attachmentPoint: MTextAttachmentPoint.TopLeft,
        collectCharBoxes: true
      },
      pcTextStyle,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )
    totalLabel.syncDraw()
    const totalWidth = totalLabel.box.max.x - totalLabel.box.min.x

    const indexLabel = new MText(
      {
        text: PAGE_INDEX_TEXT,
        height: 5,
        width: 0,
        widthFactor,
        position: { x: DXF_TEXT_INSERTION_GAP, y: 0, z: 0 },
        attachmentPoint: MTextAttachmentPoint.TopLeft,
        collectCharBoxes: true
      },
      pcTextStyle,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )
    indexLabel.syncDraw()

    totalLabel.updateMatrixWorld(true)
    indexLabel.updateMatrixWorld(true)

    expect(totalLabel.box.max.x).toBeLessThanOrEqual(
      indexLabel.box.min.x + 1e-3
    )

    // Five spaces at the old 50%-em heuristic would be 5 * (h * 0.5) * wf ≈ 8.34;
    // the full string must stay within the DXF insertion gap (~16.94).
    expect(totalWidth).toBeLessThan(DXF_TEXT_INSERTION_GAP)
    expect(totalWidth).toBeGreaterThan(5)
  })
})
