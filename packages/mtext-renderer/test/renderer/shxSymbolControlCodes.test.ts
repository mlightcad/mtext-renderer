import { describe, expect, it } from 'vitest'

import {
  AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES,
  getShxControlCodeCandidates,
  isAutoCadNumericPercentControlCodeChar,
  isAutoCadPercentSymbolChar
} from '../../src/renderer/shxSymbolControlCodes'

describe('shxSymbolControlCodes', () => {
  it('maps all named AutoCAD percent symbols to SHX control-code candidates', () => {
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.c).toEqual([129])
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.d).toEqual([126, 176])
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.p).toEqual([177])
  })

  it('recognizes Unicode expansions for %%c, %%d, and %%p', () => {
    expect(isAutoCadPercentSymbolChar('Ø')).toBe(true)
    expect(isAutoCadPercentSymbolChar('∅')).toBe(true)
    expect(isAutoCadPercentSymbolChar('°')).toBe(true)
    expect(isAutoCadPercentSymbolChar('±')).toBe(true)
    expect(isAutoCadPercentSymbolChar('9')).toBe(false)
  })

  it('returns ordered candidates for each percent-symbol Unicode expansion', () => {
    expect(getShxControlCodeCandidates('Ø')).toEqual([
      String.fromCharCode(129),
      '\u2205'
    ])
    expect(getShxControlCodeCandidates('∅')).toEqual([
      String.fromCharCode(129),
      '\u2205'
    ])
    expect(getShxControlCodeCandidates('°')).toEqual([
      String.fromCharCode(126),
      String.fromCharCode(176)
    ])
    expect(getShxControlCodeCandidates('±')).toEqual([String.fromCharCode(177)])
    expect(getShxControlCodeCandidates('A')).toEqual([])
  })

  it('recognizes numeric %%ddd SHX control-code characters', () => {
    expect(isAutoCadNumericPercentControlCodeChar(String.fromCharCode(130))).toBe(
      true
    )
    expect(isAutoCadNumericPercentControlCodeChar(String.fromCharCode(132))).toBe(
      true
    )
    expect(isAutoCadNumericPercentControlCodeChar('°')).toBe(false)
    expect(isAutoCadNumericPercentControlCodeChar('A')).toBe(false)
    expect(isAutoCadNumericPercentControlCodeChar('9')).toBe(false)
  })
})
