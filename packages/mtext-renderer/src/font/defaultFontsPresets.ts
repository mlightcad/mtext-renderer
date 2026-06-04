/**
 * Preset names for common AutoCAD-era default font fallback chains.
 *
 * Third-party DWG viewers often mirror fonts that were widely bundled or
 * referenced during the AutoCAD R12/R14 era, then simplified in later releases.
 */
export type DefaultFontsPreset =
  /** Single mesh fallback; matches the library default. */
  | 'minimal'
  /** Classic R12/R14 stack: SHX basics, GB big font, then mesh CJK and GDT. */
  | 'r12r14'
  /** Later-era stack: hztxt big font with simsun and GDT symbols. */
  | 'modern'
  /** Western SHX fonts plus simsun and GDT; no CJK-specific SHX big fonts. */
  | 'international'
  /** Broad CJK coverage: both GB big-font SHX files plus common mesh fallbacks. */
  | 'cjk'

/**
 * Predefined default font fallback chains.
 * Font names are logical names without file extensions; earlier entries are tried first.
 */
export const DEFAULT_FONTS_PRESETS: Record<
  DefaultFontsPreset,
  readonly string[]
> = {
  minimal: ['simkai'],
  r12r14: ['txt', 'simplex', 'romans', 'gbcbig', 'simsun', 'gdt'],
  modern: ['hztxt', 'simsun', 'gdt'],
  international: ['txt', 'simplex', 'romans', 'simsun', 'gdt'],
  cjk: ['gbcbig', 'hztxt', 'simsun', 'simkai', 'gdt']
}

export function isDefaultFontsPreset(
  value: string
): value is DefaultFontsPreset {
  return Object.prototype.hasOwnProperty.call(DEFAULT_FONTS_PRESETS, value)
}
