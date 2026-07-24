/**
 * AutoCAD single-line spacing as a multiple of text height ("3-on-5").
 *
 * DXF group 44 (`lineSpaceFactor`) is a ratio relative to this single spacing,
 * so baseline-to-baseline distance =
 * `lineSpaceFactor × LINE_SPACING_SCALE_FACTOR × textHeight`.
 */
export const LINE_SPACING_SCALE_FACTOR = 5 / 3

/**
 * Default DXF group-44 line spacing factor (AutoCAD single spacing).
 */
export const DEFAULT_LINE_SPACE_FACTOR = 1.0

/**
 * Vertical compensation needed after switching normal glyph placement from
 * top-anchored to baseline-anchored coordinates.
 */
export const STACK_VERTICAL_SHIFT_FACTOR = 0.3
