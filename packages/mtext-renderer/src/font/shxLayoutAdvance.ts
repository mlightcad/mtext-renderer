import { InkWidthAdvanceStrategy, ShxAdvanceWidthStrategy, ShxShape } from '@mlightcad/shx-parser'

const LAYOUT_EPSILON = 1e-6

/**
 * Horizontal advance for SHX glyphs placed by this renderer.
 *
 * AutoCAD steps by the shape's final pen x. Classic fonts (romans, simplex, txt)
 * encode that step as a pen-up vector, which `@mlightcad/shx-parser` does not mark
 * as {@link ShxShape.hasExplicitAdvance}. The parser default then substitutes
 * ink width plus `0.2 * cellWidth`, so a space (no ink) collapses to the padding
 * and letters pick up a uniform gap.
 *
 * Keep the pen position when it lands on or past the ink. Use ink-width spacing
 * only when the pen stops inside the strokes, so overhangs such as italic `/`
 * still clear the next glyph.
 */
export class ShxPenAdvanceStrategy extends ShxAdvanceWidthStrategy {
  resolve(shape: ShxShape, cellWidth: number): number {
    const advanceX = shape.lastPoint?.x ?? 0
    if (shape.hasExplicitAdvance) {
      return advanceX
    }

    const hasInk = shape.polylines.some(line => line.length >= 2)
    if (!hasInk) {
      // Blank glyphs (e.g. space) step by the pen x. Zero/negative pen is not a
      // usable horizontal advance — fall back to the font cell width.
      return advanceX > LAYOUT_EPSILON ? advanceX : cellWidth
    }

    const { maxX } = shape.bbox
    if (advanceX > LAYOUT_EPSILON && advanceX >= maxX - LAYOUT_EPSILON) {
      return advanceX
    }

    return InkWidthAdvanceStrategy.computeAdvance(shape, cellWidth)
  }

  /** Store the resolved advance so a later default-strategy pass does not recompute it. */
  markAlignedAdvanceExplicit(_shape: ShxShape): boolean {
    return true
  }
}

/** Shared strategy passed to `ShxFont.getLayoutCharShape` and {@link resolveAdvanceWidth}. */
export const shxPenAdvanceStrategy = new ShxPenAdvanceStrategy()
