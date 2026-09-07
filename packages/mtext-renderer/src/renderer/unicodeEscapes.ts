/**
 * AutoCAD MText `\U+nnnn` escapes use exactly four hexadecimal digits
 * (see DXF / MText documentation). Upstream `@mlightcad/mtext-parser` before
 * 1.5.1 may greedily consume 4–8 hex digits, so `\U+22054.0` becomes U+22054
 * instead of U+2205 followed by the literal `4.0`. Expanding fixed-width
 * escapes before parsing restores AutoCAD-compatible behavior.
 *
 * Adjacent high/low surrogate escapes (e.g. `\U+D83D\U+DE00`) expand to
 * UTF-16 code units that form one supplementary-plane character in JS strings.
 *
 * @see https://github.com/mlightcad/cad-viewer/issues/615
 */
const UNICODE_ESCAPE = /\\U\+([0-9A-Fa-f]{4})/g

/**
 * Replaces AutoCAD `\U+XXXX` (exactly four hex digits) with the corresponding
 * Unicode character so a following hex digit is not absorbed into the code point.
 */
export function expandUnicodeEscapes(text: string): string {
  return text.replace(UNICODE_ESCAPE, (_, hex: string) => {
    const codeUnit = parseInt(hex, 16)
    // Always emit a UTF-16 code unit so surrogate pairs concatenate correctly.
    return String.fromCharCode(codeUnit)
  })
}
