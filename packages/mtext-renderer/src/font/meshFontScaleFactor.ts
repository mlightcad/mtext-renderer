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
 * Computes the mesh-font scale that maps CAD text height onto glyph outlines.
 *
 * AutoCAD maps TrueType text height to the capital-letter height of the face
 * (`unitsPerEm / A.yMax`). That scale applies to CJK faces as well: ideographs
 * occupy most of the em, so their advances become larger than the nominal text
 * height. Using the em square alone (`1`) under-sizes both glyphs and advances,
 * which delays soft wraps and shortens the MTEXT block relative to AutoCAD.
 */
export function computeMeshFontScaleFactor(font: MeshFontScaleSource): number {
  const unitsPerEm = font.unitsPerEm || 1000
  const index = font.charToGlyphIndex('A')
  if (index == null || index <= 0) {
    return 1
  }

  const latinYMax = font.charToGlyph('A')?.yMax
  if (!latinYMax || latinYMax <= 0) {
    return 1
  }

  return unitsPerEm / latinYMax
}
