import { MTextParser, TokenType } from '@mlightcad/mtext-parser'
import { describe, expect, it } from 'vitest'

import { expandPercentControlCodes } from '../../src/renderer/percentControlCodes'

function parseWithPropertyCommands(text: string) {
  const parser = new MTextParser(text, undefined, {
    yieldPropertyCommands: true
  })
  return [...parser.parse()]
}

function propertyCommands(text: string) {
  return parseWithPropertyCommands(text)
    .filter(token => token.type === TokenType.PROPERTIES_CHANGED)
    .map(token => token.data?.command)
}

describe('expandPercentControlCodes', () => {
  it('expands explicit on/off stroke codes', () => {
    expect(expandPercentControlCodes('%%konstruck%%koff')).toBe(
      '\\Kstruck\\k'
    )
    expect(expandPercentControlCodes('%%oonover%%ooff')).toBe('\\Oover\\o')
    expect(expandPercentControlCodes('%%uonunder%%uoff')).toBe('\\Lunder\\l')
  })

  it('toggles standard %%k, %%o, and %%u codes', () => {
    expect(expandPercentControlCodes('%%kstruck%%k normal')).toBe(
      '\\Kstruck\\k normal'
    )
    expect(expandPercentControlCodes('%%oover%%o normal')).toBe('\\Oover\\o normal')
    expect(expandPercentControlCodes('%%uunder%%u normal')).toBe(
      '\\Lunder\\l normal'
    )
  })

  it('is case-insensitive for explicit and toggle codes', () => {
    expect(expandPercentControlCodes('%%KONx%%KOFF')).toBe('\\Kx\\k')
    expect(expandPercentControlCodes('%%OONx%%OOFF')).toBe('\\Ox\\o')
    expect(expandPercentControlCodes('%%UONx%%UOFF')).toBe('\\Lx\\l')
    expect(expandPercentControlCodes('%%Kx%%K')).toBe('\\Kx\\k')
  })

  it('does not alter symbol or numeric percent codes', () => {
    expect(expandPercentControlCodes('%%c %%d %%p %%% %%130')).toBe(
      '%%c %%d %%p %%% %%130'
    )
  })

  it('produces parser-visible decoration commands after expansion', () => {
    const expanded = expandPercentControlCodes(
      '%%konstruck%%koff %%oover%%o %%uunder%%u'
    )
    expect(propertyCommands(expanded)).toEqual(['K', 'k', 'O', 'o', 'L', 'l'])
  })

  it('matches the controlCode example stroke sequences', () => {
    const exampleStrokeText =
      '%%kstruck%%k normal\\P%%konstruck%%koff normal\\P' +
      '%%oover%%o normal\\P%%oonover%%ooff normal\\P' +
      '%%uunder%%u normal\\P%%uonunder%%uoff normal'

    const expanded = expandPercentControlCodes(exampleStrokeText)
    expect(propertyCommands(expanded)).toEqual([
      'K',
      'k',
      'K',
      'k',
      'O',
      'o',
      'O',
      'o',
      'L',
      'l',
      'L',
      'l'
    ])
  })
})
