/**
 * AutoCAD percent-sign symbol codes (`%%c`, `%%d`, `%%p`) and their SHX
 * symbol-font code points.
 *
 * Named percent codes are expanded by {@link @mlightcad/mtext-parser} into Unicode
 * before rendering. AutoCAD itself does not rely on those Unicode code points in
 * the primary text font; it resolves the symbols through GDT / symbol SHX fonts
 * such as `amgdt.shx` using legacy control-code code points.
 *
 * References:
 * - AutoCAD "Text Symbols and Special Characters"
 * - AutoCAD "Control Codes and Special Characters" (`%%nnn`)
 * - Legacy SHX convention: 127 = degree, 128 = plus/minus, 129 = diameter
 * - Modern `amgdt.shx`: degree at 126/176, ± at 177, diameter at U+2205 (∅);
 *   code 130 = angle (∠). Legacy bytes 127–128 must not be used when CJK mesh
 *   fonts in the fallback chain expose unrelated glyphs at those code points.
 */
export type AutoCadPercentSymbolCode = 'c' | 'd' | 'p'

/**
 * Ordered SHX byte-code candidates for each named AutoCAD percent symbol.
 * Earlier entries are preferred when present in the symbol-font fallback chain
 * Earlier entries are preferred when present in {@link FontManager.symbolFonts}.
 */
export const AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES: Readonly<
  Record<AutoCadPercentSymbolCode, readonly number[]>
> = {
  /** %%c — circle diameter dimensioning symbol (legacy SHX position) */
  c: [129],
  /** %%d — degree symbol (126/176 in amgdt.shx; avoid legacy 127) */
  d: [126, 176],
  /** %%p — plus/minus tolerance symbol (177 in amgdt.shx; avoid legacy 128) */
  p: [177]
}

/**
 * Unicode characters to try in GDT / symbol SHX fonts when legacy control codes
 * are absent (e.g. `amgdt.shx` stores diameter at U+2205, not at byte 129/130).
 */
const PERCENT_SYMBOL_FONT_UNICODE_ALTERNATES: Readonly<
  Record<AutoCadPercentSymbolCode, readonly string[]>
> = {
  c: ['\u2205'], // ∅ — AutoCAD .NET diameter; present in amgdt.shx
  d: [],
  p: []
}

/**
 * Unicode characters produced from percent codes (or documented AutoCAD aliases)
 * mapped back to their percent-symbol key.
 */
const UNICODE_TO_PERCENT_SYMBOL: Readonly<
  Record<string, AutoCadPercentSymbolCode>
> = {
  '\u00D8': 'c', // Ø — used by mtext-parser for %%c
  '\u2205': 'c', // ∅ — documented in AutoCAD .NET API for diameter
  '\u00B0': 'd', // ° — %%d
  '\u00B1': 'p' // ± — %%p
}

/**
 * Returns whether a character originated from an AutoCAD named percent symbol.
 */
export function isAutoCadPercentSymbolChar(char: string): boolean {
  return UNICODE_TO_PERCENT_SYMBOL[char] != null
}

/**
 * Returns whether a character likely came from an AutoCAD numeric percent code
 * (`%%ddd`) expanded by mtext-parser into {@link String.fromCharCode}.
 *
 * AutoCAD resolves these byte-oriented SHX code points from GDT / symbol fonts
 * (e.g. `amgdt.shx`), not from the primary text font—even when the text font
 * defines a glyph at the same code (as with `txt.shx` at code 132).
 */
export function isAutoCadNumericPercentControlCodeChar(char: string): boolean {
  if (char.length !== 1 || isAutoCadPercentSymbolChar(char)) {
    return false
  }
  const code = char.charCodeAt(0)
  // Legacy GDT / SHX symbol bytes produced by `%%126`–`%%255`.
  return code >= 126 && code <= 255
}

/**
 * Returns ordered SHX control-code characters to try in symbol-font fallbacks
 * for an AutoCAD percent-symbol Unicode expansion.
 */
export function getShxControlCodeCandidates(char: string): readonly string[] {
  const symbol = UNICODE_TO_PERCENT_SYMBOL[char]
  if (symbol == null) {
    return []
  }
  const controlCodes = AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES[symbol].map(code =>
    String.fromCharCode(code)
  )
  return [...controlCodes, ...PERCENT_SYMBOL_FONT_UNICODE_ALTERNATES[symbol]]
}

/**
 * @deprecated Use {@link getShxControlCodeCandidates} instead.
 */
export function getShxControlCodeChar(char: string): string | undefined {
  return getShxControlCodeCandidates(char)[0]
}
