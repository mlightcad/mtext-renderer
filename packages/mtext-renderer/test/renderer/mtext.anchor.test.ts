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
  it('centers visible glyph geometry using layout height instead of scaled font size', () => {
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
        toGeometry: () =>
          createShapeGeometry(10, size / fontScaleFactor)
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

    expect(box.min.y).toBeCloseTo(-textHeight / 2, 6)
    expect(box.max.y).toBeCloseTo(textHeight / 2, 6)
  })
})
