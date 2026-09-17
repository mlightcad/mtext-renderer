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
  /**
   * Broad CJK coverage: Chinese / Korean / Japanese mesh fonts plus matching
   * SHX big fonts.
   */
  | 'cjk'
  /** Simplified Chinese: simsun (TTF) plus GB big-font SHX. */
  | 'chinese'
  /** Korean: malgun / Noto Sans KR (TTF) plus Korean big-font SHX. */
  | 'korean'
  /** Japanese: MS Gothic (TTF) plus extfont2 / extfont SHX. */
  | 'japanese'

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
  // Korean/Japanese faces are not in this preset — load on demand via style
  // names (e.g. `malgun`) or switch to the `korean` / `cjk` presets.
  modern: ['simsun', 'hztxt'],
  international: ['txt', 'simplex', 'romans', 'simsun'],
  // Full CJK: mesh faces for CN/KR/JP, then matching SHX big fonts.
  // `malgun` → Noto Sans KR; `msgothic` → MS Gothic in the font repository.
  cjk: [
    'simsun',
    'malgun',
    'msgothic',
    'gbcbig',
    'hztxt',
    'extfont2',
    'extfont',
    'whgtxt',
    'whgdtxt'
  ],
  chinese: ['simsun', 'gbcbig', 'hztxt'],
  korean: ['malgun', 'whgtxt', 'whgdtxt'],
  japanese: ['msgothic', 'extfont2', 'extfont']
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
  cjk: ['simplex', 'amgdt'],
  chinese: ['simplex', 'amgdt'],
  korean: ['simplex', 'amgdt'],
  japanese: ['simplex', 'amgdt']
}

export function isDefaultFontsPreset(
  value: string
): value is DefaultFontsPreset {
  return Object.prototype.hasOwnProperty.call(DEFAULT_FONTS_PRESETS, value)
}
