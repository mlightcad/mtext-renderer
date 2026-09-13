/**
 * Minimal opentype glyph fields used when deriving a mesh-font scale factor.
 */
export interface MeshFontScaleGlyph {
  yMax?: number
  advanceWidth?: number
}

/**
 * Minimal opentype font surface needed to compute {@link computeMeshFontScaleFactor}.
 *
 * Prefer {@link MeshFontScaleSource.charToGlyphIndex} over relying on
 * {@link MeshFontScaleSource.charToGlyph} alone: opentype.js returns the
 * `.notdef` glyph (index 0) for missing code points, so a truthy glyph object
 * does not mean the face actually contains that character.
 */
export interface MeshFontScaleSource {
  unitsPerEm: number
  charToGlyph: (char: string) => MeshFontScaleGlyph | undefined
  charToGlyphIndex: (char: string) => number | null | undefined
}

/**
 * Threshold above which a Latin-'A'-based scale is treated as unsafe for fonts
 * that also contain full-em CJK ideographs (SimSun / SimFang / etc.).
 */
export const CJK_LATIN_SCALE_INFLATION_THRESHOLD = 1.15

/**
 * Fraction of the em square at which an ideograph advance is treated as a
 * full-cell CJK design glyph.
 */
export const CJK_FULL_EM_ADVANCE_RATIO = 0.9

const CJK_PROBE_CHARS = ['国', '中', '永'] as const

function hasRealGlyph(
  font: MeshFontScaleSource,
  char: string
): boolean {
  const index = font.charToGlyphIndex(char)
  return index != null && index > 0
}

/**
 * Computes the mesh-font scale that maps CAD text height onto glyph outlines.
 *
 * AutoCAD maps TrueType text height to the font design size. For Western faces,
 * capital {@code A} height is a good proxy (`unitsPerEm / A.yMax`). For CJK
 * faces, ideographs occupy the full em while Latin capitals are much shorter —
 * using {@code A.yMax} then inflates both glyph size and advance (~1.4× for
 * SimFang/SimSun), which falsely wraps MTEXT that AutoCAD keeps on one line.
 *
 * When the font has full-em ideographs and the Latin-based scale would inflate
 * advances past {@link CJK_LATIN_SCALE_INFLATION_THRESHOLD}, return {@code 1}
 * so text height maps to the em square (AutoCAD CJK TrueType behavior).
 */
export function computeMeshFontScaleFactor(font: MeshFontScaleSource): number {
  const unitsPerEm = font.unitsPerEm || 1000
  if (!hasRealGlyph(font, 'A')) {
    return 1
  }

  const latin = font.charToGlyph('A')
  const latinYMax = latin?.yMax
  if (!latinYMax || latinYMax <= 0) {
    return 1
  }

  const latinScale = unitsPerEm / latinYMax
  let cjkAdvance = 0
  for (const char of CJK_PROBE_CHARS) {
    if (!hasRealGlyph(font, char)) continue
    cjkAdvance = font.charToGlyph(char)?.advanceWidth ?? 0
    break
  }
  if (
    cjkAdvance >= unitsPerEm * CJK_FULL_EM_ADVANCE_RATIO &&
    latinScale > CJK_LATIN_SCALE_INFLATION_THRESHOLD
  ) {
    return 1
  }

  return latinScale
}
