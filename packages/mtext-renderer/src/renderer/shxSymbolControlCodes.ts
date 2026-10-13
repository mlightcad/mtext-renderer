import type { PercentSymbolData } from '@mlightcad/mtext-parser'

/**
 * AutoCAD percent-sign symbol codes (`%%c`, `%%d`, `%%p`) and their SHX
 * symbol-font code points.
 *
 * When {@link MTextParserOptions.yieldPercentSymbols} is enabled, the parser
 * emits {@link TokenType.PERCENT_SYMBOL} tokens for these codes. AutoCAD itself
 * does not rely on the Unicode expansions in the primary text font; it resolves
 * the symbols through GDT / symbol SHX fonts such as `amgdt.shx` using legacy
 * control-code code points.
 */
export type AutoCadPercentSymbolCode = 'c' | 'd' | 'p'

/**
 * Ordered SHX byte-code candidates for each named AutoCAD percent symbol.
 * Earlier entries are preferred when present in {@link FontManager.symbolFonts}.
 */
export const AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES: Readonly<
  Record<AutoCadPercentSymbolCode, readonly number[]>
> = {
  /** %%c — circle diameter dimensioning symbol (legacy SHX position) */
  c: [129],
  /**
   * %%d — degree symbol at U+00B0 (176).
   * Do not prefer byte 126: in text SHX fonts such as `simplex.shx` (first in
   * {@link FontManager.symbolFonts}) code 126 is ASCII `~`, while `amgdt.shx`
   * stores degree at both 126 and 176. Preferring 126 therefore renders `~`
   * instead of `°`. Avoid legacy 127 (CJK mesh fonts expose unrelated glyphs).
   */
  d: [176],
  /** %%p — plus/minus tolerance symbol (177 in amgdt.shx; avoid legacy 128) */
  p: [177]
}

/**
 * Unicode code points to try in GDT / symbol SHX fonts when legacy control codes
 * are absent (e.g. `amgdt.shx` stores diameter at U+2205, not at byte 129/130).
 * Byte 130 is a common alternate diameter slot in Autodesk GDT fonts.
 */
const PERCENT_SYMBOL_FONT_UNICODE_ALTERNATES: Readonly<
  Record<AutoCadPercentSymbolCode, readonly number[]>
> = {
  c: [0x2205, 130], // ∅ — AutoCAD .NET diameter; 130 — legacy GDT slot
  d: [],
  p: []
}

/**
 * Unicode characters that DWG converters / editors often store in place of
 * AutoCAD `%%c` / `%%d` / `%%p` control codes (cad-viewer#724).
 */
const LITERAL_PERCENT_SYMBOL_BY_CHAR: Readonly<
  Record<string, AutoCadPercentSymbolCode>
> = {
  Ø: 'c', // U+00D8 — parser expansion of %%c
  ø: 'c', // U+00F8
  '∅': 'c', // U+2205 — AutoCAD .NET / many DWG exporters
  '⌀': 'c', // U+2300 — diameter sign
  Φ: 'c', // U+03A6 — common in Chinese mechanical drawings
  φ: 'c', // U+03C6
  '°': 'd', // U+00B0 — parser expansion of %%d
  '±': 'p' // U+00B1 — parser expansion of %%p
}

/**
 * Returns ordered font code points to try for a parser-emitted percent symbol.
 */
export function getPercentSymbolLookupCodes(
  data: PercentSymbolData
): readonly number[] {
  switch (data.kind) {
    case 'named':
      return [
        ...AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES[data.code],
        ...PERCENT_SYMBOL_FONT_UNICODE_ALTERNATES[data.code]
      ]
    case 'numeric':
      return [data.charCode]
    case 'literal':
      return []
    default: {
      const exhaustiveCheck: never = data
      return exhaustiveCheck
    }
  }
}

/**
 * Maps a literal Unicode dimension symbol to a named AutoCAD percent-symbol
 * token when converters have already expanded `%%c` / `%%d` / `%%p`.
 *
 * @returns Named percent-symbol data, or `undefined` when `char` is not a
 *   known dimension-symbol substitute.
 */
export function getLiteralPercentSymbolData(
  char: string
): PercentSymbolData | undefined {
  const code = LITERAL_PERCENT_SYMBOL_BY_CHAR[char]
  if (!code) {
    return undefined
  }
  return { kind: 'named', code, char }
}
