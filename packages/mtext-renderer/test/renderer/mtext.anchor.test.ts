import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { MText } from '../../src/renderer/mtext'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
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
})
