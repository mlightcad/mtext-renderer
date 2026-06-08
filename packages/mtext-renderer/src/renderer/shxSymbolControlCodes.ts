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
  /** %%d — degree symbol (126/176 in amgdt.shx; avoid legacy 127) */
  d: [126, 176],
  /** %%p — plus/minus tolerance symbol (177 in amgdt.shx; avoid legacy 128) */
  p: [177]
}

/**
 * Unicode code points to try in GDT / symbol SHX fonts when legacy control codes
 * are absent (e.g. `amgdt.shx` stores diameter at U+2205, not at byte 129/130).
 */
const PERCENT_SYMBOL_FONT_UNICODE_ALTERNATES: Readonly<
  Record<AutoCadPercentSymbolCode, readonly number[]>
> = {
  c: [0x2205], // ∅ — AutoCAD .NET diameter; present in amgdt.shx
  d: [],
  p: []
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
