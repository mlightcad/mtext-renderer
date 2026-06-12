import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { FontManager } from '../../src/font/fontManager'
import {
  createDefaultColorSettings,
  MTextAttachmentPoint,
  MTextFlowDirection
} from '../../src/renderer/types'
import { MainThreadRenderer } from '../../src/worker/mainThreadRenderer'
import { WebWorkerRenderer } from '../../src/worker/webWorkerRenderer'

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

function getWorldVertexSpread(object: THREE.Object3D) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const point = new THREE.Vector3()

  object.updateWorldMatrix(true, true)
  object.traverse(child => {
    if (!('geometry' in child)) return

    const position = (child.geometry as THREE.BufferGeometry).getAttribute(
      'position'
    )
    if (!position) return

    child.updateWorldMatrix(true, false)
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
      min.min(point)
      max.max(point)
    }
  })

  return { min, max }
}

const sharedMTextData = {
  height: 4.0222404674496,
  width: 100,
  position: new THREE.Vector3(38425645.890718, 4069531.4443921, 0),
  attachmentPoint: MTextAttachmentPoint.MiddleCenter,
  drawingDirection: MTextFlowDirection.BY_STYLE,
  directionVector: new THREE.Vector3(
    0.9995686730481862,
    -0.02936780313009985,
    0
  ),
  lineSpaceFactor: 1.0
}

const textStyle = {
  name: 'Standard',
  standardFlag: 0,
  fixedTextHeight: 4.0222404674496,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 4.0222404674496,
  font: 'txt',
  bigFont: ''
}

describe('large coordinates integration', () => {
  it('keeps glyph geometry local on main thread with real fonts', async () => {
    FontManager.instance.setDefaultFonts('minimal')
    const renderer = new MainThreadRenderer()
    await renderer.loadFonts(['txt', 'simkai'])

    const shx = await renderer.asyncRenderMText(
      { ...sharedMTextData, text: '{\\Ftxt;SHX (476.473)}' },
      textStyle
    )
    const mesh = await renderer.asyncRenderMText(
      {
        ...sharedMTextData,
        text: '{\\Fsimkai;Mesh 大坐标 (476.473)}'
      },
      { ...textStyle, font: 'simkai' }
    )

    expect(getGeometryPositionMaxAbs(shx)).toBeLessThan(200)
    expect(getGeometryPositionMaxAbs(mesh)).toBeLessThan(200)

    const shxSpread = getWorldVertexSpread(shx)
    expect(shxSpread.min.x).toBeGreaterThan(sharedMTextData.position.x - 200)
    expect(shxSpread.max.x).toBeLessThan(sharedMTextData.position.x + 200)

    shx.traverse(child => {
      if (!('geometry' in child)) return
      const position = (child.geometry as THREE.BufferGeometry).getAttribute(
        'position'
      )
      if (!position) return
      for (let i = 0; i < position.count; i++) {
        expect(Number.isFinite(position.getX(i))).toBe(true)
        expect(Number.isFinite(position.getY(i))).toBe(true)
      }
    })
  }, 60_000)

  it('preserves local geometry through manual worker-style reconstruction', async () => {
    FontManager.instance.setDefaultFonts('minimal')
    const main = new MainThreadRenderer()
    await main.loadFonts(['txt'])

    const source = await main.asyncRenderMText(
      { ...sharedMTextData, text: '{\\Ftxt;SHX (476.473)}' },
      textStyle
    )

    const renderRoot = source.children[0] as THREE.Object3D
    renderRoot.updateWorldMatrix(true, true)
    const rootWorldInverse = new THREE.Matrix4()
      .copy(renderRoot.matrixWorld)
      .invert()
    const childRelativeMatrix = new THREE.Matrix4()

    const children: Array<{
      type: 'mesh' | 'line'
      position: { x: number; y: number; z: number }
      rotation: { x: number; y: number; z: number; w: number }
      scale: { x: number; y: number; z: number }
      geometry: {
        attributes: Record<string, unknown>
        index: null
      }
      material: { type: string; color: number; transparent: boolean; opacity: number }
    }> = []

    renderRoot.traverse(child => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) {
        return
      }

      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      childRelativeMatrix.multiplyMatrices(rootWorldInverse, child.matrixWorld)
      childRelativeMatrix.decompose(position, quaternion, scale)

      const attr = child.geometry.getAttribute('position')
      const arrayBuffer = (attr.array as Float32Array).slice().buffer
      children.push({
        type: child instanceof THREE.Mesh ? 'mesh' : 'line',
        position: { x: position.x, y: position.y, z: position.z },
        rotation: {
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
          w: quaternion.w
        },
        scale: { x: scale.x, y: scale.y, z: scale.z },
        geometry: {
          attributes: {
            position: {
              arrayBuffer,
              byteOffset: 0,
              length: attr.array.length,
              itemSize: 3,
              normalized: false
            }
          },
          index: null
        },
        material: {
          type: 'MeshBasicMaterial',
          color: 0xffffff,
          transparent: false,
          opacity: 1
        }
      })
    })

    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    renderRoot.matrixWorld.decompose(position, quaternion, scale)

    const workerRenderer = new WebWorkerRenderer({ poolSize: 0 })
    const reconstructed = workerRenderer.reconstructMText(
      {
        type: 'MText',
        position: { x: position.x, y: position.y, z: position.z },
        rotation: {
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
          w: quaternion.w
        },
        scale: { x: scale.x, y: scale.y, z: scale.z },
        box: {
          min: {
            x: source.box.min.x,
            y: source.box.min.y,
            z: source.box.min.z
          },
          max: {
            x: source.box.max.x,
            y: source.box.max.y,
            z: source.box.max.z
          }
        },
        children
      },
      createDefaultColorSettings()
    )

    expect(getGeometryPositionMaxAbs(reconstructed)).toBeLessThan(200)
    expect(reconstructed.position.x).toBeCloseTo(sharedMTextData.position.x, 3)

    const sourceSpread = getWorldVertexSpread(source)
    const reconstructedSpread = getWorldVertexSpread(reconstructed)
    expect(reconstructedSpread.min.x).toBeCloseTo(sourceSpread.min.x, 1)
    expect(reconstructedSpread.max.x).toBeCloseTo(sourceSpread.max.x, 1)

    workerRenderer.destroy()
  }, 60_000)

  it('projects all glyph vertices into clip space when framed like the example viewer', async () => {
    FontManager.instance.setDefaultFonts('minimal')
    const renderer = new MainThreadRenderer()
    await renderer.loadFonts(['txt', 'simkai'])

    const shx = await renderer.asyncRenderMText(
      { ...sharedMTextData, text: '{\\Ftxt;SHX (476.473)}' },
      textStyle
    )
    const mesh = await renderer.asyncRenderMText(
      {
        ...sharedMTextData,
        text: '{\\Fsimkai;Mesh 大坐标 (476.473)}'
      },
      { ...textStyle, font: 'simkai' }
    )

    const group = new THREE.Group()
    group.add(shx, mesh)

    group.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3()
    const tempBox = new THREE.Box3()
    group.traverse(child => {
      if (
        child instanceof THREE.LineSegments ||
        child instanceof THREE.Mesh
      ) {
        const geometry = child.geometry as THREE.BufferGeometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return
        tempBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld)
        bounds.union(tempBox)
      }
    })

    const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000)
    camera.position.set(0, 0, 100)
    camera.zoom = 1
    const paddingRatio = 0.08
    const minX = bounds.min.x
    const maxX = bounds.max.x
    const minY = bounds.min.y
    const maxY = bounds.max.y
    const padX = Math.max((maxX - minX) * paddingRatio, 1e-6)
    const padY = Math.max((maxY - minY) * paddingRatio, 1e-6)
    camera.left = minX - padX
    camera.right = maxX + padX
    camera.top = maxY + padY
    camera.bottom = minY - padY
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    const mvp = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
    const clip = new THREE.Vector4()
    let outOfRange = 0
    let maxAbsClip = 0
    group.traverse(child => {
      if (!('geometry' in child)) return
      const position = (child.geometry as THREE.BufferGeometry).getAttribute(
        'position'
      )
      if (!position) return
      child.updateWorldMatrix(true, false)
      const world = new THREE.Matrix4().multiplyMatrices(
        mvp,
        child.matrixWorld
      )
      for (let i = 0; i < position.count; i++) {
        clip.set(
          position.getX(i),
          position.getY(i),
          position.getZ(i),
          1
        ).applyMatrix4(world)
        const ndcX = clip.x / clip.w
        const ndcY = clip.y / clip.w
        maxAbsClip = Math.max(maxAbsClip, Math.abs(ndcX), Math.abs(ndcY))
        if (Math.abs(ndcX) > 1.5 || Math.abs(ndcY) > 1.5) outOfRange++
      }
    })

    expect(outOfRange).toBe(0)
    expect(maxAbsClip).toBeLessThanOrEqual(1.05)
  }, 60_000)
})
