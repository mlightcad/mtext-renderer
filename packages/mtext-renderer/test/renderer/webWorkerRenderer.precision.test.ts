import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { createDefaultColorSettings } from '../../src/renderer/types'
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

function createQuadGeometry(width: number, height: number) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array([
    0,
    0,
    0,
    width,
    0,
    0,
    width,
    height,
    0,
    0,
    height,
    0
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 1, 2, 2, 3, 3, 0])
  return geometry
}

describe('WebWorkerRenderer reconstructMText precision', () => {
  it('keeps glyph geometry local while insertion lives on the root transform', () => {
    const position = { x: 38425192.41436505, y: 4069213.352858167, z: 0 }
    const geometry = createQuadGeometry(10, 12)
    const positions = geometry.getAttribute('position').array as Float32Array

    const renderer = new WebWorkerRenderer({ poolSize: 0 })
    const object = renderer.reconstructMText(
      {
        type: 'MText',
        position,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
        box: {
          min: { x: position.x, y: position.y, z: 0 },
          max: { x: position.x + 10, y: position.y + 12, z: 0 }
        },
        children: [
          {
            type: 'mesh',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
            geometry: {
              attributes: {
                position: {
                  arrayBuffer: positions.buffer,
                  byteOffset: positions.byteOffset,
                  length: positions.length,
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
          }
        ]
      },
      createDefaultColorSettings()
    )

    expect(object.position.x).toBeCloseTo(position.x, 3)
    expect(object.position.y).toBeCloseTo(position.y, 3)
    expect(getGeometryPositionMaxAbs(object)).toBeLessThan(100)

    const worldPoint = new THREE.Vector3()
    object.updateWorldMatrix(true, true)
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      child.getWorldPosition(worldPoint)
      expect(worldPoint.x).toBeCloseTo(position.x, 3)
      expect(worldPoint.y).toBeCloseTo(position.y, 3)
    })

    renderer.destroy()
  })
})
