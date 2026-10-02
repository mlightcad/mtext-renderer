import { Point, ShxShape } from '@mlightcad/shx-parser'
import { describe, expect, it } from 'vitest'

import { ShxPenAdvanceStrategy } from '../../src/font/shxLayoutAdvance'

describe('ShxPenAdvanceStrategy', () => {
  const strategy = new ShxPenAdvanceStrategy()
  const cellWidth = 10

  it('uses positive pen advance for blank glyphs', () => {
    const space = new ShxShape(new Point(7.5, 0), [], false)
    expect(strategy.resolve(space, cellWidth)).toBeCloseTo(7.5)
  })

  it('falls back to cellWidth for blank glyphs with zero or negative pen', () => {
    const zero = new ShxShape(new Point(0, 0), [], false)
    const negative = new ShxShape(new Point(-3, 0), [], false)
    expect(strategy.resolve(zero, cellWidth)).toBe(cellWidth)
    expect(strategy.resolve(negative, cellWidth)).toBe(cellWidth)
  })
})
