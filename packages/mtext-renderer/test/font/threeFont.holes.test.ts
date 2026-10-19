import { ShapeGeometry } from 'three'
import { describe, expect, it } from 'vitest'

import { ThreeFont } from '../../src/font/threeFont'

/**
 * Glyph extracted from SimSun in
 * https://github.com/mrdoob/three.js/issues/32187
 * Old ShapePath.toShapes() failed to assign its inner contours as holes.
 */
const MIAN_OUTLINE =
  'm 148 47 l 106 47 l 106 3 l 148 3 l 148 47 z m 50 143 l 99 143 q 110 186 107 166 l 110 186 l 46 186 q 20 183 31 186 l 20 183 l 11 192 l 211 192 l 227 207 l 245 186 l 120 186 l 135 178 l 125 175 q 105 143 113 158 l 105 143 l 203 143 l 210 153 l 226 141 l 219 134 q 220 -16 219 44 l 220 -16 l 205 -23 l 205 -3 l 50 -3 l 50 -17 l 35 -24 q 36 66 36 11 q 35 151 36 120 l 35 151 l 50 143 z m 93 137 l 50 137 l 50 3 l 93 3 l 93 137 z m 205 137 l 161 137 l 161 3 l 205 3 l 205 137 z m 148 137 l 106 137 l 106 99 l 148 99 l 148 137 z m 148 93 l 106 93 l 106 53 l 148 53 l 148 93 z'

/**
 * Glyph extracted from SimSun (`simsun.ttf`). Same hole-classification
 * regression class as 面: outer frame plus nested inner contours.
 */
const TU_OUTLINE =
  'm 223 21 l 223 187 l 229 193 l 215 205 l 207 196 l 50 196 l 34 205 q 35 167 35 184 l 35 167 l 35 16 q 34 -25 35 -5 l 34 -25 l 49 -19 l 49 -2 l 209 -2 l 209 -23 l 224 -15 q 223 21 223 1 l 223 21 z m 49 67 l 49 191 l 99 191 q 87 157 98 180 q 60 111 76 133 l 60 111 l 63 109 q 97 153 82 128 l 97 153 q 118 112 104 133 l 118 112 q 49 67 93 88 l 49 67 z m 209 3 l 49 3 l 49 63 q 125 104 91 77 l 125 104 q 187 68 151 78 l 187 68 q 205 81 189 77 l 205 81 l 205 85 q 133 112 158 87 l 133 112 q 160 142 150 130 q 180 156 169 153 l 180 156 l 163 174 l 154 164 l 104 164 q 112 175 107 170 q 120 181 116 180 l 120 181 l 101 191 l 209 191 l 209 3 z m 101 159 l 101 159 l 154 159 q 125 120 140 135 l 125 120 q 101 159 113 132 z m 108 82 l 108 82 l 107 78 q 141 54 132 63 q 151 56 149 44 q 143 72 153 67 q 108 82 133 77 z m 87 45 l 87 45 l 87 41 q 149 15 135 27 q 163 16 162 3 q 149 35 164 28 q 87 45 133 41 z'

function createDemoFont(
  char: string,
  glyph: { ha: number; x_min: number; x_max: number; o: string }
) {
  return new ThreeFont({
    glyphs: { [char]: glyph },
    resolution: 1000,
    boundingBox: { xMin: 0, yMin: -200, xMax: 256, yMax: 250 },
    underlineThickness: 0,
    underlinePosition: 0,
    ascender: 800,
    descender: -200,
    familyName: 'DemoSimSun',
    original_font_information: {}
  })
}

function expectHolesAndTriangulates(char: string, o: string) {
  const font = createDemoFont(char, {
    ha: 256,
    x_min: 0,
    x_max: 256,
    o
  })

  const shapes = font.generateShapes(char, 100)
  const holeCount = shapes.reduce((sum, shape) => sum + shape.holes.length, 0)

  expect(shapes.length).toBeGreaterThan(0)
  expect(holeCount).toBeGreaterThan(0)

  const geometry = new ShapeGeometry(shapes)
  const position = geometry.getAttribute('position')
  expect(position).toBeDefined()
  expect(position.count).toBeGreaterThan(0)
  geometry.dispose()
}

describe('ThreeFont.generateShapes hole classification', () => {
  it('assigns inner contours of 面 as holes via ShapePath.toShapes()', () => {
    expectHolesAndTriangulates('面', MIAN_OUTLINE)
  })

  it('assigns inner contours of 图 as holes via ShapePath.toShapes()', () => {
    expectHolesAndTriangulates('图', TU_OUTLINE)
  })
})
