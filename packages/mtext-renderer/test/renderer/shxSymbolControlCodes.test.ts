import type { PercentSymbolData } from '@mlightcad/mtext-parser'

import { describe, expect, it } from 'vitest'

import {
  AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES,
  getLiteralPercentSymbolData,
  getPercentSymbolLookupCodes
} from '../../src/renderer/shxSymbolControlCodes'

describe('shxSymbolControlCodes', () => {
  it('maps all named AutoCAD percent symbols to SHX control-code candidates', () => {
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.c).toEqual([129])
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.d).toEqual([176])
    expect(AUTOCAD_PERCENT_SYMBOL_CONTROL_CODES.p).toEqual([177])
  })

  it('returns ordered lookup codes for named percent-symbol tokens', () => {
    const diameter: PercentSymbolData = { kind: 'named', code: 'c', char: 'Ø' }
    const degree: PercentSymbolData = { kind: 'named', code: 'd', char: '°' }
    const plusMinus: PercentSymbolData = { kind: 'named', code: 'p', char: '±' }

    expect(getPercentSymbolLookupCodes(diameter)).toEqual([129, 0x2205, 130])
    expect(getPercentSymbolLookupCodes(degree)).toEqual([176])
    expect(getPercentSymbolLookupCodes(plusMinus)).toEqual([177])
  })

  it('maps literal converter-expanded dimension symbols to named percent codes', () => {
    expect(getLiteralPercentSymbolData('∅')).toEqual({
      kind: 'named',
      code: 'c',
      char: '∅'
    })
    expect(getLiteralPercentSymbolData('Φ')).toEqual({
      kind: 'named',
      code: 'c',
      char: 'Φ'
    })
    expect(getLiteralPercentSymbolData('°')).toEqual({
      kind: 'named',
      code: 'd',
      char: '°'
    })
    expect(getLiteralPercentSymbolData('±')).toEqual({
      kind: 'named',
      code: 'p',
      char: '±'
    })
    expect(getLiteralPercentSymbolData('A')).toBeUndefined()
  })

  it('returns lookup code for numeric percent-symbol tokens', () => {
    const ch132: PercentSymbolData = {
      kind: 'numeric',
      charCode: 132,
      char: String.fromCharCode(132)
    }

    expect(getPercentSymbolLookupCodes(ch132)).toEqual([132])
  })

  it('returns no symbol-font lookups for literal percent tokens', () => {
    const literal: PercentSymbolData = { kind: 'literal', char: '%' }

    expect(getPercentSymbolLookupCodes(literal)).toEqual([])
  })
})
