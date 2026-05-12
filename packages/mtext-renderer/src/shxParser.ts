/**
 * Re-exports from @mlightcad/shx-parser so consumers can use SHX parsing utilities
 * (e.g. character-map SVG preview) without a direct shx-parser dependency.
 *
 * `ShxParserFont` is the parser library font class; this package also exports a
 * renderer-facing `ShxFont` wrapper under `./font/shxFont`.
 */
export { ShxFont as ShxParserFont } from '@mlightcad/shx-parser'
export type { ShxFontData } from '@mlightcad/shx-parser'
