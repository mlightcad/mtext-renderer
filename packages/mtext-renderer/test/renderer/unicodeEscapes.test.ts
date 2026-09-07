import { MTextParser, TokenType } from '@mlightcad/mtext-parser'
import { describe, expect, it } from 'vitest'

import { expandUnicodeEscapes } from '../../src/renderer/unicodeEscapes'

function wordChars(text: string) {
  const tokens = [...new MTextParser(expandUnicodeEscapes(text)).parse()]
  return tokens
    .filter(token => token.type === TokenType.WORD)
    .map(token => String(token.data))
    .join('')
}

describe('expandUnicodeEscapes', () => {
  it('decodes exactly four hex digits', () => {
    expect(expandUnicodeEscapes('\\U+2205')).toBe('∅')
    expect(expandUnicodeEscapes('\\U+4F60\\U+597D')).toBe('你好')
  })

  it('does not consume a following hex digit after \\U+XXXX (cad-viewer#615)', () => {
    expect(expandUnicodeEscapes('\\U+22054.0通')).toBe('∅4.0通')
    expect(
      expandUnicodeEscapes(
        '\\A1;\\A1;{\\fArial Unicode MS|b0|i0|c136|p34;\\U+22054.0通}'
      )
    ).toBe('\\A1;\\A1;{\\fArial Unicode MS|b0|i0|c136|p34;∅4.0通}')
  })

  it('expands UTF-16 surrogate pairs into one supplementary-plane character', () => {
    expect(expandUnicodeEscapes('\\U+D83D\\U+DE00')).toBe('😀')
    expect([...expandUnicodeEscapes('\\U+D83D\\U+DE00')]).toEqual(['😀'])
  })

  it('leaves incomplete or non-hex escapes unchanged', () => {
    expect(expandUnicodeEscapes('\\U+12')).toBe('\\U+12')
    expect(expandUnicodeEscapes('\\U+ZZZZ')).toBe('\\U+ZZZZ')
  })

  it('parses issue #615 text as diameter plus trailing digits', () => {
    expect(wordChars('\\U+22054.0通')).toBe('∅4.0通')
    expect(
      wordChars('\\A1;\\A1;{\\fArial Unicode MS|b0|i0|c136|p34;\\U+22054.0通}')
    ).toContain('∅4.0通')
  })

  it('keeps literal supplementary-plane characters intact through parsing', () => {
    expect(wordChars('Hello 😀')).toBe('Hello😀')
    const tokens = [
      ...new MTextParser(expandUnicodeEscapes('Hello 😀')).parse()
    ]
    const emojiToken = tokens.find(
      token => token.type === TokenType.WORD && String(token.data).includes('😀')
    )
    expect(emojiToken?.data).toBe('😀')
    expect([...String(emojiToken?.data)]).toEqual(['😀'])
  })
})
