/**
 * AutoCAD percent-sign control codes that toggle or set text decorations.
 *
 * Standard TEXT codes (AutoCAD 2026 help):
 * - `%%k` toggles strikethrough
 * - `%%o` toggles overscore
 * - `%%u` toggles underscore
 *
 * Some drawings also use explicit on/off spellings such as `%%kon` / `%%koff`.
 * The upstream mtext parser only understands `\K`/`\k`, `\O`/`\o`, and `\L`/`\l`,
 * so we expand percent codes to those inline commands before parsing.
 */
const EXPLICIT_PERCENT_CODES: ReadonlyArray<readonly [RegExp, string]> = [
  [/%%koff/gi, '\\k'],
  [/%%kon/gi, '\\K'],
  [/%%ooff/gi, '\\o'],
  [/%%oon/gi, '\\O'],
  [/%%uoff/gi, '\\l'],
  [/%%uon/gi, '\\L']
]

const TOGGLE_PERCENT_CODE = /%%([kou])/gi

/**
 * Expands AutoCAD `%%` stroke control codes into `\K`/`\k`, `\O`/`\o`, and `\L`/`\l`
 * inline formatting commands understood by {@link @mlightcad/mtext-parser}.
 */
export function expandPercentControlCodes(text: string): string {
  let result = text
  for (const [pattern, replacement] of EXPLICIT_PERCENT_CODES) {
    result = result.replace(pattern, replacement)
  }

  let strikeThrough = false
  let overline = false
  let underline = false

  return result.replace(TOGGLE_PERCENT_CODE, (_, letter: string) => {
    switch (letter.toLowerCase()) {
      case 'k':
        strikeThrough = !strikeThrough
        return strikeThrough ? '\\K' : '\\k'
      case 'o':
        overline = !overline
        return overline ? '\\O' : '\\o'
      case 'u':
        underline = !underline
        return underline ? '\\L' : '\\l'
      default:
        return `%%${letter}`
    }
  })
}
