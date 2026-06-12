/**
 * Built-in MText and SHAPE example content for the interactive demo.
 *
 * @remarks
 * Keys match the `data-example` attribute on buttons in `index.html`.
 * Most entries are raw MText format strings passed directly to the renderer.
 * A few entries are **marker tokens** (e.g. `'multiple'`, `'shapes'`) that
 * trigger specialized multi-entity render paths in {@link MTextRendererExample}.
 */
export const EXAMPLE_TEXTS = {
  /** Basic formatting: colors, control codes, font switches, Unicode escapes. */
  basic:
    '\\P{\\C1;Hello World 材料 装车位置}\\P\\P{\\C2;Diameter: %%c50}\\P{\\C3;Temperature: 25%%d}\\P{\\C4;Tolerance: %%p0.1}\\P{\\C6;\\LUnderlined\\l, \\OOverlined\\o, \\KStriked\\k}\\P{\\C7;\\Q15;Oblique 15 deg}\\P{\\C8;\\FArial|b1;Bold Text}\\P{\\C9;\\FArial|i1;Italic Text}\\P{\\C10;\\FArial|b1|i1;Bold Italic Text}\\P{\\C11;Normal height \\H0.16;Absolute font height 0.16}\\PUnicode: \\U+4F60\\U+597D (should display 你好){\\P}',
  /** Paragraph styles, width factors, and character spacing. */
  complex:
    '{\\C1;\\W2;Title}\\P{\\C2;This is a paragraph with different styles.}\\P{\\C3;\\W1.5;Subtitle}\\P{\\C4;• First item\\P• Second item\\P• Third item}\\P{\\T2;Absolute character spacing: 2, }{\\T0.2x;Relative character spacing: 0.2}\\P{\\W0.8;Footer text}',
  /** AutoCAD percent control codes (`%%c`, `%%d`, toggles, etc.). */
  controlCode:
    '{Circle diameter dimensioning symbol: %%c},\\P{Degree symbol: %%d}\\P{Plus/minus tolerance symbol: %%p}\\P{A single percent sign: %%%}\\P{Unicode character: %%130 %%131 \\Ftssdeng;%%1326@600}\\P{Strikethrough toggle (%%k): %%kstruck%%k normal}\\P{Strikethrough explicit: %%konstruck%%koff normal}\\P{Overscore toggle (%%o): %%oover%%o normal}\\P{Overscore explicit: %%oonover%%ooff normal}\\P{Underscore toggle (%%u): %%uunder%%u normal}\\P{Underscore explicit: %%uonunder%%uoff normal}',
  /** Indexed, true-color, ByLayer/ByBlock color contexts. */
  color:
    '{\\C0;By Block}\\P{\\C1;Red Text}\\P{\\C2;Yellow Text}\\P{\\C3;Green Text}\\P{\\C4;Cyan Text}\\P{\\C5;Blue Text}\\P{\\C6;Magenta Text}\\P{\\C7;White Text}\\P{\\C256;By Layer}\\P{\\c16761035;Pink (0x0FFC0CB)}\\PRestore ByLayer\\P\\C1;Old Context Color: Red, {\\C2; New Context Color: Yellow, } Restored Context Color: Red',
  /** SHX, BigFont, and TrueType font switches with CJK samples. */
  font: '{\\C1;\\W2;\\FSimSun;SimSun 宋体}\\P{\\F仿宋_gb2312;SimFang 仿宋（面积、材料、8、①④⑧⑩⑫㉔㉚）}\\P{\\C2;\\W0.5;\\FArial;Arial Text}\\P{\\C3;30;\\Faehalf.shx;SHX Text “250~280”}\\P{\\C4;\\Fgbcbig.shx;东亚字符集字体}\\P{\\C5;\\Q1;\\FSimHei;SimHei Text，黑体}\\P{\\C6;\\Q0.5;\\FSimKai;SimKai 楷体}',
  /** Demonstrates default-font preset fallback chains (text + symbol). */
  defaultFonts:
    '{\\C1;Primary \\Ftxt;txt (SHX) — Latin: Hello %%c50}\\P{\\C2;CJK falls back via preset chain: 材料 装车 直径 你好}\\P{\\C3;Symbol %%c %%d %%p — may use gdt in chain}\\P{\\C4;Switch preset above and re-render to compare fallback order}',
  /** Stacked fractions, subscripts, and superscripts (`\\S` codes). */
  stacking:
    '%%c30{\\C3;\\H0.7x;\\S+0.021^  0;}\\P{\\C1;Basic Fractions:}\\P{\\C2;The value is \\S1/2; and \\S3/4; of the total.}\\P{\\C3;\\H0.16;Stacked Fractions:}\\P{\\C4;\\S1 2/3 4; represents \\Sx^ y; in the equation \\S1#2;.}\\P{\\C5;Complex Fractions:}\\P{\\C6;The result \\S1/2/3; is between \\S1^ 2^ 3; and \\S1#2#3;.}\\P{\\C7;Subscript Examples:}\\P{\\C8;H\\S^ 2;O (Water)}\\P{\\C9;CO\\S^ 2; (Carbon Dioxide)}\\P{\\C10;x\\S^ 2; + y\\S^ 2;}\\P{\\C11;Superscript Examples:}\\P{\\C12;E = mc\\S2^ ; (Energy)}\\P{\\C13;x\\S2^ ; + y\\S2^ ; = r\\S2^ ; (Circle)}\\P{\\C14;Combined Examples:}\\P{\\C15;H\\S^ 2;O\\S2^ ; (Hydrogen Peroxide)}\\P{\\C16;Fe\\S^ 2;+\\S3^ ; (Iron Ion)}',
  /** Paragraph alignment codes (`\\pql`, `\\pqc`, `\\pqr`). */
  alignment:
    '{\\pql;Left aligned paragraph.}\\P{\\pqc;Center aligned paragraph.}\\P{\\pqr;Right aligned paragraph.}\\P{\\pqc;Center again.}\\P{\\pql;Back to left.}',
  /** Paragraph indent and margin control codes. */
  paragraph:
    '{\\pql;\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This paragraph has an indent of 2 units, left margin of 5 units, and right margin of 5 units. The first line is indented.}\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This is the second line of the same paragraph, showing the effect of margins.}}',
  /** Marker: render ten MText entities in a 3×4 grid (see {@link createMultipleMTextData}). */
  multiple: 'multiple',
  /** Marker: render SHX shape numbers 128–132 from `complex.shx` (see {@link createShapeTestData}). */
  shapes: 'shapes',
  /** Marker: 3×4 attachment-point grid with insertion crosshairs (see {@link createAttachmentPointTestData}). */
  attachmentGrid: 'attachmentGrid',
  /** Marker: large WCS sample with insertion rebase enabled (see {@link LargeCoordinatesExample}). */
  largeCoordinatesRebase: 'largeCoordinatesRebase',
  /** Marker: same large WCS sample without rebase — exposes float32 precision issues. */
  largeCoordinatesNoRebase: 'largeCoordinatesNoRebase'
} as const

/**
 * Valid key for {@link EXAMPLE_TEXTS} and example-button `data-example` attributes.
 */
export type ExampleTextKey = keyof typeof EXAMPLE_TEXTS
