import { Point, ShxShape } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { ShxFont } from '../../src/font/shxFont'
import { ShxTextShape } from '../../src/font/shxTextShape'

function makeFont(): ShxFont {
  const fontData: FontData = {
    name: 'test',
    type: 'shx',
    data: {
      header: { fontType: 'bigfont', fileHeader: 'test', fileVersion: '1.0' },
      content: {
        data: {},
        info: '',
        orientation: 'horizontal',
        baseUp: 8,
        baseDown: 0,
        height: 8,
        width: 8,
        isExtended: false
      }
    },
    alias: ['test']
  }
  return new ShxFont(fontData)
}

describe('ShxTextShape.toGeometry', () => {
  it('builds geometry from the layout shape held by this instance', () => {
    const font = makeFont()
    const lowShape = new ShxShape(new Point(8, 0), [
      [new Point(0, 0), new Point(8, 0)]
    ])
    const highShape = new ShxShape(new Point(8, 0), [
      [new Point(0, 20), new Point(8, 20)]
    ])

    const low = new ShxTextShape(65, 16, lowShape, font)
    const high = new ShxTextShape(65, 16, highShape, font)

    const lowPositions = low.toGeometry().getAttribute('position').array as Float32Array
    const highPositions = high.toGeometry().getAttribute('position').array as Float32Array

    expect(lowPositions[1]).toBe(0)
    expect(highPositions[1]).toBe(20)
  })

  it('offset copies produce independent geometry', () => {
    const font = makeFont()
    const base = new ShxTextShape(
      65,
      16,
      new ShxShape(new Point(8, 0), [[new Point(0, 0), new Point(8, 0)]]),
      font
    )
    const shifted = base.offset(new Point(10, 5))
    const baseY = (base.toGeometry().getAttribute('position').array as Float32Array)[1]
    const shiftedY = (shifted.toGeometry().getAttribute('position').array as Float32Array)[1]

    expect(baseY).toBe(0)
    expect(shiftedY).toBe(5)
  })
})
