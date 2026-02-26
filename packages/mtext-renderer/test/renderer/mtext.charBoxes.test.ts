import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { buildCharBoxesFromObject } from '../../src/renderer/charBoxUtils'
import { CharBox, CharBoxType } from '../../src/renderer/types'

function box(x: number) {
  return new THREE.Box3(
    new THREE.Vector3(x, 0, 0),
    new THREE.Vector3(x + 1, 1, 0)
  )
}

describe('MText charBoxes stack handling', () => {
  it('groups fraction stack into one STACK token with non-whitespace children only', () => {
    const objectCharBoxes = [
      { type: CharBoxType.CHAR, box: box(0), char: ' ', children: [] },
      { type: CharBoxType.CHAR, box: box(1), char: '1', children: [] },
      { type: CharBoxType.CHAR, box: box(2), char: '2', children: [] },
      { type: CharBoxType.CHAR, box: box(3), char: '3', children: [] },
      { type: CharBoxType.CHAR, box: box(4), char: ' ', children: [] },
      { type: CharBoxType.CHAR, box: box(5), char: '4', children: [] }
    ] as CharBox[]

    const out = buildCharBoxesFromObject(
      objectCharBoxes,
      new THREE.Matrix4(),
      CharBoxType.STACK
    )

    expect(out).toHaveLength(2)
    expect(out[0].type).toBe(CharBoxType.CHAR)
    expect(out[0].char).toBe(' ')
    expect(out[1].type).toBe(CharBoxType.STACK)
    expect(out[1].char).toBe('')
    expect(out[1].children.map(c => c.char)).toEqual(['1', '2', '3', '4'])
    expect(out[1].children).toHaveLength(4)
  })

  it('drops invalid boxes while collecting stack children', () => {
    const objectCharBoxes = [
      { type: CharBoxType.CHAR, box: box(0), char: '1', children: [] },
      {
        type: CharBoxType.CHAR,
        box: new THREE.Box3(
          new THREE.Vector3(Number.NaN, 0, 0),
          new THREE.Vector3(Number.NaN, 1, 0)
        ),
        char: '2',
        children: []
      },
      { type: CharBoxType.CHAR, box: box(2), char: '3', children: [] }
    ] as CharBox[]

    const out = buildCharBoxesFromObject(
      objectCharBoxes,
      new THREE.Matrix4(),
      CharBoxType.STACK
    )

    expect(out).toHaveLength(1)
    expect(out[0].children.map(c => c.char)).toEqual(['1', '3'])
    expect(Number.isFinite(out[0].box.min.x)).toBe(true)
    expect(Number.isFinite(out[0].box.max.x)).toBe(true)
  })
})
