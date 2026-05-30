import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { MText } from '../../src/renderer/mtext'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  MTextFlowDirection,
  TextStyle
} from '../../src/renderer/types'

function createShapeGeometry(width: number, height: number) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(width, 0)
  shape.lineTo(width, height)
  shape.lineTo(0, height)
  shape.lineTo(0, 0)
  return new THREE.ShapeGeometry(shape)
}

function createOffsetShapeGeometry(width: number, height: number, offsetX = 0) {
  const shape = new THREE.Shape()
  shape.moveTo(offsetX, 0)
  shape.lineTo(offsetX + width, 0)
  shape.lineTo(offsetX + width, height)
  shape.lineTo(offsetX, height)
  shape.lineTo(offsetX, 0)
  return new THREE.ShapeGeometry(shape)
}

function createGeometryBox(object: THREE.Object3D) {
  const box = new THREE.Box3()
  const childBox = new THREE.Box3()

  object.updateWorldMatrix(true, true)
  object.traverse(child => {
    if (!('geometry' in child)) return

    const geometry = child.geometry as THREE.BufferGeometry
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox()
    }
    if (!geometry.boundingBox) return

    child.updateWorldMatrix(true, false)
    childBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld)
    box.union(childBox)
  })

  return box
}

function getGeometryPositionMaxAbs(object: THREE.Object3D) {
  let maxAbs = 0

  object.traverse(child => {
    if (!('geometry' in child)) return

    const position = (child.geometry as THREE.BufferGeometry).getAttribute(
      'position'
    )
    if (!position) return

    for (let i = 0; i < position.count; i++) {
      maxAbs = Math.max(
        maxAbs,
        Math.abs(position.getX(i)),
        Math.abs(position.getY(i)),
        Math.abs(position.getZ(i))
      )
    }
  })

  return maxAbs
}

function createTextFixture(
  overrides: Partial<{
    text: string
    height: number
    width: number
    widthFactor: number
    position: { x: number; y: number; z: number }
    rotation: number
    drawingDirection: MTextFlowDirection
    attachmentPoint: MTextAttachmentPoint
  }> = {}
) {
  const textHeight = overrides.height ?? 24
  const style: TextStyle = {
    name: 'default',
    standardFlag: 0,
    fixedTextHeight: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: textHeight,
    font: 'fake',
    bigFont: ''
  }
  const styleManager = {
    unsupportedTextStyles: {},
    getMeshBasicMaterial: vi
      .fn()
      .mockReturnValue(new THREE.MeshBasicMaterial()),
    getLineBasicMaterial: vi.fn().mockReturnValue(new THREE.LineBasicMaterial())
  }
  const fontManager = {
    getFontScaleFactor: () => 1,
    getFontType: () => 'mesh',
    findAndReplaceFont: (name: string) => name,
    getCharShape: (_char: string, _fontName: string, size: number) => ({
      width: 10,
      toGeometry: () => createShapeGeometry(10, size)
    }),
    getNotFoundTextShape: () => undefined
  }

  return new MText(
    {
      text: overrides.text ?? 'A',
      height: textHeight,
      width: overrides.width ?? 100,
      widthFactor: overrides.widthFactor,
      position: overrides.position ?? { x: 0, y: 0, z: 0 },
      rotation: overrides.rotation,
      drawingDirection: overrides.drawingDirection,
      attachmentPoint: overrides.attachmentPoint
    },
    style,
    styleManager as any,
    fontManager as any,
    createDefaultColorSettings()
  )
}

describe('MText attachment anchoring', () => {
  it('centers visible glyph geometry instead of line-layout leading', () => {
    const fontScaleFactor = 2
    const textHeight = 24
    const style: TextStyle = {
      name: 'default',
      standardFlag: 0,
      fixedTextHeight: 0,
      widthFactor: 1,
      obliqueAngle: 0,
      textGenerationFlag: 0,
      lastHeight: textHeight,
      font: 'fake',
      bigFont: ''
    }
    const styleManager = {
      unsupportedTextStyles: {},
      getMeshBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.MeshBasicMaterial()),
      getLineBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.LineBasicMaterial())
    }
    const fontManager = {
      getFontScaleFactor: () => fontScaleFactor,
      getFontType: () => 'mesh',
      findAndReplaceFont: (name: string) => name,
      getCharShape: (_char: string, _fontName: string, size: number) => ({
        width: 10,
        toGeometry: () => createShapeGeometry(10, size / fontScaleFactor)
      }),
      getNotFoundTextShape: () => undefined
    }

    const mtext = new MText(
      {
        text: 'A',
        height: textHeight,
        width: 100,
        position: { x: 0, y: 0, z: 0 },
        attachmentPoint: MTextAttachmentPoint.MiddleCenter
      },
      style,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )

    mtext.syncDraw()
    const box = createGeometryBox(mtext)

    expect(mtext.box.min.x).toBeCloseTo(-50, 4)
    expect(mtext.box.max.x).toBeCloseTo(50, 4)
    expect(mtext.box.min.y).toBeCloseTo(-12, 4)
    expect(mtext.box.max.y).toBeCloseTo(12, 4)
    expect(box.min.y).toBeCloseTo(-12, 4)
    expect(box.max.y).toBeCloseTo(12, 4)
  })

  it.each([
    [MTextAttachmentPoint.TopLeft, 0, 100, -24, 0],
    [MTextAttachmentPoint.TopCenter, -50, 50, -24, 0],
    [MTextAttachmentPoint.TopRight, -100, 0, -24, 0],
    [MTextAttachmentPoint.MiddleLeft, 0, 100, -12, 12],
    [MTextAttachmentPoint.MiddleCenter, -50, 50, -12, 12],
    [MTextAttachmentPoint.MiddleRight, -100, 0, -12, 12],
    [MTextAttachmentPoint.BottomLeft, 0, 100, 0, 24],
    [MTextAttachmentPoint.BottomCenter, -50, 50, 0, 24],
    [MTextAttachmentPoint.BottomRight, -100, 0, 0, 24],
    [MTextAttachmentPoint.BaselineLeft, 0, 100, 0, 24],
    [MTextAttachmentPoint.BaselineCenter, -50, 50, 0, 24],
    [MTextAttachmentPoint.BaselineRight, -100, 0, 0, 24]
  ])(
    'anchors attachment point %i to the insertion point',
    (attachmentPoint, minX, maxX, minY, maxY) => {
      const textHeight = 24
      const style: TextStyle = {
        name: 'default',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: textHeight,
        font: 'fake',
        bigFont: ''
      }
      const styleManager = {
        unsupportedTextStyles: {},
        getMeshBasicMaterial: vi
          .fn()
          .mockReturnValue(new THREE.MeshBasicMaterial()),
        getLineBasicMaterial: vi
          .fn()
          .mockReturnValue(new THREE.LineBasicMaterial())
      }
      const fontManager = {
        getFontScaleFactor: () => 1,
        getFontType: () => 'mesh',
        findAndReplaceFont: (name: string) => name,
        getCharShape: (_char: string, _fontName: string, size: number) => ({
          width: 10,
          toGeometry: () => createShapeGeometry(10, size)
        }),
        getNotFoundTextShape: () => undefined
      }

      const mtext = new MText(
        {
          text: 'A',
          height: textHeight,
          width: 100,
          position: { x: 0, y: 0, z: 0 },
          attachmentPoint
        },
        style,
        styleManager as any,
        fontManager as any,
        createDefaultColorSettings()
      )

      mtext.syncDraw()

      expect(mtext.box.min.x).toBeCloseTo(minX, 4)
      expect(mtext.box.max.x).toBeCloseTo(maxX, 4)
      expect(mtext.box.min.y).toBeCloseTo(minY, 4)
      expect(mtext.box.max.y).toBeCloseTo(maxY, 4)
    }
  )

  it('keeps char-box layout aligned with anchored geometry', () => {
    const textHeight = 24
    const style: TextStyle = {
      name: 'default',
      standardFlag: 0,
      fixedTextHeight: 0,
      widthFactor: 1,
      obliqueAngle: 0,
      textGenerationFlag: 0,
      lastHeight: textHeight,
      font: 'fake',
      bigFont: ''
    }
    const styleManager = {
      unsupportedTextStyles: {},
      getMeshBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.MeshBasicMaterial()),
      getLineBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.LineBasicMaterial())
    }
    const fontManager = {
      getFontScaleFactor: () => 1,
      getFontType: () => 'mesh',
      findAndReplaceFont: (name: string) => name,
      getCharShape: (_char: string, _fontName: string, size: number) => ({
        width: 10,
        toGeometry: () => createShapeGeometry(10, size)
      }),
      getNotFoundTextShape: () => undefined
    }

    const mtext = new MText(
      {
        text: 'A',
        height: textHeight,
        width: 100,
        position: { x: 0, y: 0, z: 0 },
        attachmentPoint: MTextAttachmentPoint.MiddleCenter
      },
      style,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )

    mtext.syncDraw()
    const geometryBox = createGeometryBox(mtext)
    const layout = mtext.createLayoutData()

    expect(layout.chars).toHaveLength(1)
    expect(layout.chars[0].box.min.x).toBeCloseTo(geometryBox.min.x, 6)
    expect(layout.chars[0].box.max.x).toBeCloseTo(geometryBox.max.x, 6)
    expect(layout.chars[0].box.min.y).toBeCloseTo(geometryBox.min.y, 6)
    expect(layout.chars[0].box.max.y).toBeCloseTo(geometryBox.max.y, 6)
  })

  it('keeps baseline-left insertion at the logical pen origin for side-bearing glyphs', () => {
    const textHeight = 12
    const sideBearing = 3
    const position = { x: 38425192.41436505, y: 4069213.352858167, z: 0 }
    const style: TextStyle = {
      name: 'default',
      standardFlag: 0,
      fixedTextHeight: 0,
      widthFactor: 1,
      obliqueAngle: 0,
      textGenerationFlag: 0,
      lastHeight: textHeight,
      font: 'fake',
      bigFont: ''
    }
    const styleManager = {
      unsupportedTextStyles: {},
      getMeshBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.MeshBasicMaterial()),
      getLineBasicMaterial: vi
        .fn()
        .mockReturnValue(new THREE.LineBasicMaterial())
    }
    const fontManager = {
      getFontScaleFactor: () => 1,
      getFontType: () => 'mesh',
      findAndReplaceFont: (name: string) => name,
      getCharShape: (_char: string, _fontName: string, size: number) => ({
        width: 10,
        toGeometry: () => createOffsetShapeGeometry(10, size, sideBearing)
      }),
      getNotFoundTextShape: () => undefined
    }

    const mtext = new MText(
      {
        text: 'A',
        height: textHeight,
        width: Number.POSITIVE_INFINITY,
        position,
        drawingDirection: MTextFlowDirection.BOTTOM_TO_TOP,
        attachmentPoint: MTextAttachmentPoint.BaselineLeft
      },
      style,
      styleManager as any,
      fontManager as any,
      createDefaultColorSettings()
    )

    mtext.syncDraw()

    const renderRoot = mtext.children[0]
    const geometryBox = createGeometryBox(renderRoot)
    expect(renderRoot.position.x).toBeCloseTo(position.x, 6)
    expect(renderRoot.position.y).toBeCloseTo(position.y, 6)
    expect(geometryBox.min.x).toBeCloseTo(position.x + sideBearing, 6)
  })

  it('applies insertion on the render root so glyph world positions include it', () => {
    const position = { x: 38425192.41436505, y: 4069213.352858167, z: 0 }
    const mtext = createTextFixture({
      text: 'ABC',
      height: 12,
      width: Number.POSITIVE_INFINITY,
      position,
      attachmentPoint: MTextAttachmentPoint.BaselineLeft
    })

    mtext.syncDraw()

    const renderRoot = mtext.children[0]
    expect(renderRoot).toBeDefined()

    const worldPoint = new THREE.Vector3()
    renderRoot.updateWorldMatrix(true, true)
    renderRoot.getWorldPosition(worldPoint)
    expect(worldPoint.x).toBeCloseTo(position.x, 3)
    expect(worldPoint.y).toBeCloseTo(position.y, 3)

    const geometryBox = createGeometryBox(renderRoot)
    expect(geometryBox.min.x).toBeGreaterThan(position.x - 100)
    expect(geometryBox.max.x).toBeLessThan(position.x + 100)
  })

  it('keeps glyph geometry local when anchoring text at large drawing coordinates', () => {
    const position = { x: 38425192.41436505, y: 4069213.352858167, z: 0 }
    const mtext = createTextFixture({
      text: '1501采区2号水仓',
      height: 13.60447212599999,
      width: Number.POSITIVE_INFINITY,
      widthFactor: 0.9,
      position,
      rotation: 2.519494460842435,
      drawingDirection: MTextFlowDirection.BOTTOM_TO_TOP,
      attachmentPoint: MTextAttachmentPoint.BaselineLeft
    })

    mtext.syncDraw()

    expect(getGeometryPositionMaxAbs(mtext)).toBeLessThan(100)
    expect(mtext.box.min.x).toBeGreaterThan(position.x - 100)
    expect(mtext.box.max.x).toBeLessThan(position.x + 100)
    expect(mtext.box.min.y).toBeGreaterThan(position.y - 100)
    expect(mtext.box.max.y).toBeLessThan(position.y + 100)
  })
})
