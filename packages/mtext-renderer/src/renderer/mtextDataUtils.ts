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
 * Maximum width-to-height ratio for a declared MTEXT wrap box. Values above this
 * are treated as corrupt DXF group-code 41 data (often coordinate-scale garbage)
 * rather than an intentional column width.
 */
export const MAX_REASONABLE_MTEXT_WIDTH_HEIGHT_RATIO = 1_000_000

/**
 * Maximum ratio between declared wrap width and the content-estimated width.
 * Catches absurd widths even when text height is also very large.
 */
export const MAX_REASONABLE_MTEXT_WIDTH_CONTENT_EXCESS = 10_000

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
 *
 * Other exports carry absurdly large group-code 41 values. Using those widths for
 * middle/center attachment shifts glyph geometry by tens of millions of drawing
 * units and destroys float32 precision. Replace those with the same content-based
 * estimate when the declared width far exceeds the rendered text.
 */
export function resolveMTextWrapWidth(
  mtextData: Pick<MTextData, 'text' | 'height' | 'width'>
): number {
  const width = mtextData.width
  const height = mtextData.height
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return width
  }

  if (width <= 0) {
    return width
  }

  const minReasonable = height * MIN_REASONABLE_MTEXT_WIDTH_HEIGHT_RATIO
  if (width < minReasonable) {
    return estimateMTextWrapWidth(mtextData.text, height)
  }

  const estimated = estimateMTextWrapWidth(mtextData.text, height)
  const widthToHeight = width / height
  const widthToContent = width / Math.max(estimated, Number.EPSILON)
  if (
    widthToHeight > MAX_REASONABLE_MTEXT_WIDTH_HEIGHT_RATIO ||
    widthToContent > MAX_REASONABLE_MTEXT_WIDTH_CONTENT_EXCESS
  ) {
    return estimated
  }

  return width
}
