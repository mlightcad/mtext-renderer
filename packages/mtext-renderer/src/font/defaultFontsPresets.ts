/**
 * Preset names for common AutoCAD-era default font fallback chains.
 *
 * Third-party DWG viewers often mirror fonts that were widely bundled or
 * referenced during the AutoCAD R12/R14 era, then simplified in later releases.
 */
export type DefaultFontsPreset =
  /** SHX symbol fonts plus mesh CJK fallback (library default). */
  | 'minimal'
  /** Classic R12/R14 stack: SHX basics, GB big font, then mesh CJK and AMGDT. */
  | 'r12r14'
  /** Later-era stack: simsun first for Latin metrics, then hztxt big font. */
  | 'modern'
  /** Western SHX fonts plus simsun and AMGDT; no CJK-specific SHX big fonts. */
  | 'international'
  /** Broad CJK coverage: simsun first, then GB big-font SHX files. */
  | 'cjk'

/**
 * Predefined text-font fallback chains (primary / big-font substitutes and CJK
 * mesh fallbacks). Symbol fonts such as `amgdt` are configured separately via
 * {@link SYMBOL_FONTS_PRESETS}.
 */
export const DEFAULT_FONTS_PRESETS: Record<
  DefaultFontsPreset,
  readonly string[]
> = {
  minimal: ['txt', 'simsun'],
  r12r14: ['txt', 'simplex', 'romans', 'gbcbig', 'simsun'],
  // Mesh/TTF first so missing style fonts (e.g. "标准") get correct Latin metrics.
  // BIGFONT SHX stays available via glyph fallback for CJK coverage.
  modern: ['simsun', 'hztxt'],
  international: ['txt', 'simplex', 'romans', 'simsun'],
  cjk: ['simsun', 'gbcbig', 'hztxt']
}

/**
 * GDT / SHX symbol-font chains used for AutoCAD control codes (`%%c`, `%%d`,
 * `%%p`, `%%130`, etc.). Earlier entries are tried first.
 */
export const SYMBOL_FONTS_PRESETS: Record<
  DefaultFontsPreset,
  readonly string[]
> = {
  minimal: ['simplex', 'amgdt'],
  r12r14: ['simplex', 'amgdt'],
  modern: ['simplex', 'amgdt'],
  international: ['simplex', 'amgdt'],
  cjk: ['simplex', 'amgdt']
}

export function isDefaultFontsPreset(
  value: string
): value is DefaultFontsPreset {
  return Object.prototype.hasOwnProperty.call(DEFAULT_FONTS_PRESETS, value)
}
