import { MTextData } from './types'

/**
 * Minimum width-to-height ratio for a declared MTEXT wrap box to be treated as
 * a real column width rather than a mistaken width factor or other bad DXF value.
 */
export const MIN_REASONABLE_MTEXT_WIDTH_HEIGHT_RATIO = 1.5

/**
 * Conservative CJK full-width glyph advance as a fraction of cap height, used
 * only when estimating a replacement wrap width from explicit line content.
 */
export const CJK_MTEXT_CHAR_WIDTH_HEIGHT_RATIO = 0.8

/**
 * Estimates a usable MTEXT wrap width from the longest explicit line in the raw
 * MTEXT string while preserving explicit line breaks such as `\P`.
 */
export function estimateMTextWrapWidth(text: string, height: number): number {
  const maxLineLength = Math.max(
    1,
    ...String(text ?? '')
      .replace(/\\P/g, '\n')
      .replace(/[{}]/g, '')
      .split(/\r?\n/)
      .map(line => line.length)
  )
  return maxLineLength * height * CJK_MTEXT_CHAR_WIDTH_HEIGHT_RATIO
}

/**
 * Resolves the MTEXT wrap width used for layout and anchoring.
 *
 * Some CAD files contain MTEXT group-code 41 values that are smaller than a
 * single glyph height, usually because the value came from a text width factor
 * instead of an actual wrapping box width. Treating that tiny positive value as
 * the word-wrap width forces CJK text to wrap one character per line. When the
 * width is clearly impossible as a layout width, estimate a usable width from
 * the longest explicit MTEXT line and preserve explicit line breaks such as `\P`.
 */
export function resolveMTextWrapWidth(
  mtextData: Pick<MTextData, 'text' | 'height' | 'width'>
): number {
  const width = mtextData.width
  const height = mtextData.height
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width >= height * MIN_REASONABLE_MTEXT_WIDTH_HEIGHT_RATIO
  ) {
    return width
  }

  return estimateMTextWrapWidth(mtextData.text, height)
}
