import {
  ChangedProperties,
  MTextContext,
  MTextParagraphAlignment,
  MTextToken,
  PercentSymbolData,
  TokenType
} from '@mlightcad/mtext-parser'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { getColorByIndex } from '../common'
import { FontManager } from '../font'
import { BaseTextShape } from '../font/baseTextShape'
import {
  TextGeometryBuilder,
  type TransformedLineGeometryEntry
} from '../font/textGeometryBuilder'
import { resolveMTextColor } from './colorUtils'
import {
  LINE_SPACING_SCALE_FACTOR,
  STACK_VERTICAL_SHIFT_FACTOR
} from './constants'
import { getPercentSymbolLookupCodes } from './shxSymbolControlCodes'
import { StyleManager } from './styleManager'
import {
  CharBox,
  CharBoxType,
  ColorSettings,
  LineLayout,
  MTextFlowDirection,
  STACK_DIVIDER_CHAR,
  TextStyle
} from './types'

/** Reusable {@link THREE.Vector3} for bounding-box size calculations without per-call allocation. */
const tempVector = /*@__PURE__*/ new THREE.Vector3()
/** Identity matrix reused when line geometries need no additional transform. */
const _identityMatrix = /*@__PURE__*/ new THREE.Matrix4()
/** Reusable scale matrix for per-glyph width-factor transforms. */
const _scaleMatrix = /*@__PURE__*/ new THREE.Matrix4()
/** Reusable skew matrix for oblique/italic glyph shearing. */
const _skewMatrix = /*@__PURE__*/ new THREE.Matrix4()
/** Reusable scale matrix for mesh-font bold simulation. */
const _boldMatrix = /*@__PURE__*/ new THREE.Matrix4()
/** Reusable translation matrix for glyph placement. */
const _translateMatrix = /*@__PURE__*/ new THREE.Matrix4()
/** Reusable bounding box for transformed line-glyph hit testing. */
const _charBox = /*@__PURE__*/ new THREE.Box3()

/**
 * Options for formatting MText.
 */
export interface MTextFormatOptions {
  /**
   * Font size.
   */
  fontSize: number
  /**
   * Scale factor of character width.
   */
  widthFactor: number
  /**
   * The line space factor.
   */
  lineSpaceFactor: number
  /**
   * The horizontal alignment.
   */
  horizontalAlignment: MTextParagraphAlignment
  /**
   * The maximum width of one line of text string.
   */
  maxWidth: number
  /**
   * The direction that the text string follows from its start to its finish.
   */
  flowDirection: MTextFlowDirection
  /**
   * The color of the current block which is used when the text color is by block.
   */
  byBlockColor: number
  /**
   * The color of the current layer which is used when the text color is by layer.
   */
  byLayerColor: number
  /**
   * Whether to remove font name extension.
   */
  removeFontExtension: boolean
  /**
   * Whether to collect per-character bounding boxes for picking.
   */
  collectCharBoxes?: boolean
}

/**
 * Extended MTextContext for rendering purposes.
 * This class extends the parser's MTextContext to add rendering-specific properties
 * while maintaining compatibility with the parser's context structure.
 */
class RenderContext extends MTextContext {
  /**
   * Scale factor applied to the font height.
   * This is typically calculated based on the font type and is used
   * to normalize font sizes across different font formats.
   */
  fontScaleFactor: number = 1

  /**
   * The current font size in drawing units.
   * This represents the height of the font and affects the overall
   * size of rendered characters.
   */
  fontSize: number = 1

  /**
   * Additional scale factor applied to the font size.
   * This allows for dynamic font size adjustments during text processing,
   * such as for superscript/subscript rendering.
   */
  fontSizeScaleFactor: number = 1

  /**
   * The width of a space character for the current font and size.
   * This is calculated based on the font type and current font size.
   */
  blankWidth: number = 0

  /**
   * Creates a new RenderContext instance with optional initial values.
   * @param init - Partial object containing initial values for context properties
   */
  constructor(init?: Partial<RenderContext>) {
    super()
    if (init) {
      Object.assign(this, init)
    }
  }

  /**
   * Creates a deep copy of the current context.
   * This is useful for saving state before applying formatting changes.
   * @returns A new RenderContext instance with identical property values
   */
  clone(): RenderContext {
    const copy = new RenderContext()
    // Copy base MTextContext properties
    copy.continueStroke = this.continueStroke
    copy.color = this.color.copy()
    copy.align = this.align
    copy.fontFace = { ...this.fontFace }
    copy.capHeight = { ...this.capHeight }
    copy.widthFactor = { ...this.widthFactor }
    copy.charTrackingFactor = { ...this.charTrackingFactor }
    copy.oblique = this.oblique
    copy.paragraph = { ...this.paragraph }

    // Copy rendering-specific properties
    copy.fontScaleFactor = this.fontScaleFactor
    copy.fontSize = this.fontSize
    copy.fontSizeScaleFactor = this.fontSizeScaleFactor
    copy.blankWidth = this.blankWidth

    return copy
  }

  /**
   * Get the current text color as a hexadecimal value for rendering.
   * @returns The color as a hex number (0xRRGGBB)
   */
  getColorAsHex(): number {
    if (this.color.isRgb && this.color.rgbValue !== null) {
      return this.color.rgbValue
    } else if (this.color.isAci && this.color.aci !== null) {
      return getColorByIndex(this.color.aci)
    }
    return 0xffffff // Default white
  }

  /**
   * Set the color using a hex value for rendering purposes.
   * @param hexColor - The color as a hex number (0xRRGGBB)
   */
  setColorFromHex(hexColor: number): void {
    const r = (hexColor >> 16) & 0xff
    const g = (hexColor >> 8) & 0xff
    const b = hexColor & 0xff
    this.color.rgb = [r, g, b]
  }
}

/**
 * Converts parsed MText tokens into positioned THREE.js geometry.
 *
 * Owns line breaking, inline/paragraph formatting, stack fractions, alignment,
 * and per-character bounding boxes used for picking.
 */
export class MTextProcessor {
  /** Active text style (font, height, oblique, big font, etc.). */
  private _style: TextStyle
  /** Layer/block color resolution settings for ByLayer and ByBlock colors. */
  private _colorSettings: ColorSettings
  /** Factory for mesh and line materials used when flushing geometry batches. */
  private _styleManager: StyleManager
  /** Resolves font files, glyph shapes, and font-format-specific metrics. */
  private _fontManager: FontManager
  /** Layout and formatting options supplied at construction time. */
  private _options: MTextFormatOptions
  /** Accumulated vertical extent of completed lines, excluding the active line. */
  private _totalHeight: number
  /** Horizontal pen position within the current visual line. */
  private _hOffset: number
  /** Maximum logical pen advance seen across all processed visual lines. */
  private _maxLineAdvance: number
  /** Vertical baseline position of the current visual line. */
  private _vOffset: number
  /** Number of visual lines processed so far (1-based while rendering). */
  private _lineCount: number
  /** THREE.js objects created for the current visual line before alignment. */
  private _currentLineObjects: THREE.Object3D[]
  /** Saved {@link RenderContext} snapshots for nested `{}` formatting groups. */
  private _contextStack: RenderContext[] = []
  /** Active inline formatting and font metric state. */
  private _currentContext: RenderContext
  /** Largest font size encountered on the current visual line. */
  private _maxFontSize: number = 0
  /**
   * The current horizontal alignment for the paragraph.
   *
   * In AutoCAD MText, paragraph-level formatting commands (such as \pqr, \pql, \pqc)
   * persist for the entire paragraph and are not scoped to inline formatting groups ({} blocks).
   * Only character-level formatting (font, bold, italic, color, etc.) is scoped to {} and managed via Context.
   * Therefore, paragraph alignment is maintained at the MTextProcessor level and not in Context,
   * so it persists until explicitly changed by another paragraph alignment command.
   */
  private _currentHorizontalAlignment: MTextParagraphAlignment
  /** Whether the most recently appended char box targeted mesh or line geometry. */
  private _lastCharBoxTarget: 'mesh' | 'line' | undefined
  /** True once a visible glyph has been placed on the current visual line. */
  private _lineHasRenderableChar: boolean
  /**
   * Font size recorded when advancing from an empty line; used to correct
   * vertical position when the first glyph on the next line uses a different height.
   */
  private _pendingEmptyLineFontSizeAdjust?: number
  /** Vertical layout metadata for each completed visual line. */
  private _lineLayouts: LineLayout[]
  /** Character indices where automatic visual line breaks occurred. */
  private _lineBreakIndices: number[]
  /** Running count of logical characters emitted into flushed geometry groups. */
  private _processedCharCount: number
  /** Line glyph entries collected for batch geometry merge within a style segment. */
  private _lineBatchEntries: TransformedLineGeometryEntry[] = []
  /** Current paragraph first-line indent in drawing units. */
  private _currentIndent: number = 0
  /** Current paragraph left margin in drawing units. */
  private _currentLeftMargin: number = 0
  /** Current paragraph right margin in drawing units. */
  private _currentRightMargin: number = 0

  /**
   * Construct one instance of this class and initialize some properties with default values.
   * @param style Input text style
   * @param colorSettings Layer/block color resolution settings
   * @param styleManager Input text style manager instance
   * @param fontManager Input font manager instance
   * @param options Input formating options
   */
  constructor(
    style: TextStyle,
    colorSettings: ColorSettings,
    styleManager: StyleManager,
    fontManager: FontManager,
    options: MTextFormatOptions
  ) {
    this._style = style
    this._colorSettings = colorSettings
    this._styleManager = styleManager
    this._fontManager = fontManager
    this._options = options
    this._totalHeight = 0
    this._hOffset = 0
    this._maxLineAdvance = 0
    this._vOffset = 0
    this._lineCount = 1
    this._currentLineObjects = []
    this._currentContext = new RenderContext({
      fontScaleFactor: this.fontManager.getFontScaleFactor(
        this.textStyle.font.toLowerCase()
      ),
      fontSize: options.fontSize,
      fontSizeScaleFactor: 1,
      italic: false,
      bold: false,
      blankWidth: this.calculateBlankWidthForFont(
        this.textStyle.font.toLowerCase(),
        options.fontSize
      )
    })
    // Set initial color
    this._currentContext.setColorFromHex(this.resolveBaseColor())
    // Set initial font face
    this._currentContext.fontFace.family = this.textStyle.font.toLowerCase()
    // Set initial width factor
    this._currentContext.widthFactor = {
      value: options.widthFactor,
      isRelative: true
    }
    // Set initial oblique angle
    this._currentContext.oblique = style.obliqueAngle || 0
    this._maxFontSize = 0
    this._currentHorizontalAlignment = options.horizontalAlignment
    this._lastCharBoxTarget = undefined
    this._lineHasRenderableChar = false
    this._pendingEmptyLineFontSizeAdjust = undefined
    this._lineLayouts = []
    this._lineBreakIndices = []
    this._processedCharCount = 0
    // Initialize paragraph properties (as factors, so initial value is 0)
    this._currentIndent = 0
    this._currentLeftMargin = 0
    this._currentRightMargin = 0
    this.initLineParams()
  }

  /**
   * Font manager used to resolve glyphs, shapes, and font metrics.
   */
  get fontManager() {
    return this._fontManager
  }

  /** Style manager used to create mesh and line materials. */
  get styleManager() {
    return this._styleManager
  }

  /** Active CAD text style for the entity being rendered. */
  get textStyle() {
    return this._style
  }

  /**
   * Total height of all lines of text
   */
  get totalHeight() {
    // 'totalHeight' should not include line space after the last line
    if (this._lineCount == 1) {
      return this.currentMaxFontSize
    } else {
      return this._totalHeight + this.currentLineHeight
    }
  }

  /**
   * The maximum width of one text line
   */
  get maxWidth() {
    return this._options.maxWidth
  }

  /**
   * Maximum logical pen advance across processed visual lines.
   *
   * Unlike visible geometry bounds, this keeps the text insertion origin tied to
   * the layout pen position even when glyphs have side bearings or overhangs.
   */
  get maxLineAdvance() {
    return this._maxLineAdvance
  }

  /**
   * The direction that the text string follows from its start to its finish.
   */
  get flowDirection() {
    return this._options.flowDirection
  }

  /**
   * The default horizontal alignment of one text line
   */
  get defaultHorizontalAlignment() {
    return this._options.horizontalAlignment
  }

  /**
   * The default scale factor of character width
   */
  get defaultWidthFactor() {
    return this._options.widthFactor
  }

  /**
   * The default font size of texts
   */
  get defaultFontSize() {
    return this._options.fontSize
  }

  /**
   * The default line space factor
   */
  get defaultLineSpaceFactor() {
    return this._options.lineSpaceFactor
  }

  /**
   * Font name of current character
   */
  get currentFont() {
    return this._currentContext.fontFace.family
  }

  /**
   * The current horizontal alignment of one text line
   */
  get currentHorizontalAlignment() {
    return this._currentHorizontalAlignment
  }

  /**
   * Font size of current character
   */
  get currentFontSize() {
    return this._currentContext.fontSize
  }

  /**
   * The drawing-space text height used for layout calculations.
   *
   * `currentFontSize` includes a font-specific scale factor so glyph outlines
   * from different font formats render at comparable visual sizes.  That scale
   * must not leak into CAD layout metrics such as line height and attachment
   * offsets, otherwise middle/bottom aligned text shifts vertically depending
   * on the active font.
   */
  get currentLayoutFontSize() {
    const scaleFactor = this._currentContext.fontScaleFactor || 1
    return this._currentContext.fontSize / scaleFactor
  }

  /**
   * The height of current line of texts
   */
  get currentLineHeight() {
    const lineSpace =
      this.defaultLineSpaceFactor *
      this.currentFontSize *
      LINE_SPACING_SCALE_FACTOR
    // Empty lines should still advance by current font size plus line spacing.
    const contentHeight =
      this.currentMaxFontSize > 0
        ? this.currentMaxFontSize
        : this.currentFontSize
    return lineSpace + contentHeight
  }

  /**
   * The maximum font size in current line. Characters in one line may have different font and font
   * size. So we need to store the maximum font size in current line in order to calculate the height
   * of current line.
   */
  get currentMaxFontSize() {
    return this._maxFontSize
  }

  /**
   * The current space setting between two characters. The meaning of this value is as follows.
   * - 1: no extra spacing (default tracking)
   * - 1.2: increases spacing by 20% of the text height
   * - 0.8: decreases spacing by 20% of the text height
   */
  get currentWordSpace() {
    return this._currentContext.charTrackingFactor.value
  }

  /**
   * The current scale factor of character width
   */
  get currentWidthFactor() {
    return this._currentContext.widthFactor.value
  }

  /** Horizontal advance for one space, including tracking and width factor. */
  get currentBlankAdvance() {
    return (
      this._currentContext.blankWidth *
      this.currentWordSpace *
      this.currentWidthFactor
    )
  }

  /**
   * All of THREE.js objects in current line. It contains objects in all of sections of this line.
   */
  get currentLineObjects() {
    return this._currentLineObjects
  }

  /** Per-line vertical layout records accumulated during rendering. */
  get lineLayouts() {
    return this._lineLayouts
  }

  /**
   * The horizental offset of current character in this line
   */
  get hOffset() {
    return this._hOffset
  }
  /** @param value New horizontal pen position within the current line. */
  set hOffset(value: number) {
    this._hOffset = value
  }

  /**
   * The vertical offset of current character in this line
   */
  get vOffset() {
    return this._vOffset
  }
  /** @param value New vertical baseline position for the current line. */
  set vOffset(value: number) {
    this._vOffset = value
  }

  /** Current paragraph first-line indent in drawing units. */
  get currentIndent() {
    return this._currentIndent
  }

  /** Current paragraph left margin in drawing units. */
  get currentLeftMargin() {
    return this._currentLeftMargin
  }

  /** Current paragraph right margin in drawing units. */
  get currentRightMargin() {
    return this._currentRightMargin
  }

  /** Usable line width after subtracting left and right paragraph margins. */
  get maxLineWidth() {
    // The actual usable width for text in a line, considering margins
    return this.maxWidth - this._currentLeftMargin - this._currentRightMargin
  }

  /**
   * Process text format information
   * @param item Inline formatting command or restore snapshot from the parser.
   */
  processFormat(item: ChangedProperties) {
    // When leaving a formatting group `{}`, parser emits a restore token with
    // `command === undefined` and a full snapshot of properties to restore.
    // We must apply these changes explicitly, otherwise the render context
    // won't match the parser's restored state.
    if (item.command === undefined) {
      this.applyPropertyChanges(item.changes)
      return
    }

    switch (item.command) {
      case 'f':
      case 'F':
        this.applyFontFaceChange(item.changes.fontFace)
        break
      case 'c':
      case 'C':
        this.applyColorCommandChanges(item.changes)
        break
      case 'W':
        this.applyWidthFactorChange(item.changes.widthFactor)
        break
      case 'H':
        this.applyCapHeightChange(item.changes.capHeight)
        break
      case 'T':
        this.applyCharTrackingChange(item.changes.charTrackingFactor)
        break
      case 'p':
        this.applyParagraphChange(item.changes.paragraph)
        break
      case 'L':
        this._currentContext.underline = true
        break
      case 'l':
        this._currentContext.underline = false
        break
      case 'O':
        this._currentContext.overline = true
        break
      case 'o':
        this._currentContext.overline = false
        break
      case 'K':
        this._currentContext.strikeThrough = true
        break
      case 'k':
        this._currentContext.strikeThrough = false
        break
      case 'Q':
        if (item.changes.oblique !== undefined) {
          this._currentContext.oblique = item.changes.oblique
        }
        break
      default:
        // TODO: handle psm, underscore, overscore, and etc.
        // For unknown commands, do nothing — properties may still be applied
        // via `command === undefined` restore tokens.
        break
    }
  }

  /**
   * Applies a full property snapshot from the parser to the current render context.
   *
   * This is used when the parser emits a restore token (`command === undefined`)
   * after exiting a formatting group `{}`. The `changes` object in that case is
   * not a delta for a specific command; it is the complete property state that
   * should be active after the restore.
   *
   * The method updates:
   * - font face + derived bold/italic/oblique settings
   * - ACI/RGB color and ByLayer/ByBlock resolution
   * - width/height/tracking factors
   * - paragraph alignment and margins
   * - underline/overline/strike-through flags
   *
   * @param changes Full property snapshot to apply to the current render context.
   */
  private applyPropertyChanges(changes: ChangedProperties['changes']) {
    this.applyFontFaceChange(changes.fontFace)
    this.applyColorCommandChanges(changes)
    this.applyWidthFactorChange(changes.widthFactor)
    this.applyCapHeightChange(changes.capHeight)
    this.applyCharTrackingChange(changes.charTrackingFactor)
    this.applyParagraphMarginsOnly(changes.paragraph)

    if (typeof changes.underline === 'boolean') {
      this._currentContext.underline = changes.underline
    }
    if (typeof changes.overline === 'boolean') {
      this._currentContext.overline = changes.overline
    }
    if (typeof changes.strikeThrough === 'boolean') {
      this._currentContext.strikeThrough = changes.strikeThrough
    }
    if (changes.oblique !== undefined) {
      this._currentContext.oblique = changes.oblique
    }
  }

  /**
   * Apply a font face change to the current render context, including
   * derived bold/italic/oblique settings based on font type.
   * @param fontFace The font face change data from the parser.
   */
  private applyFontFaceChange(
    fontFace: ChangedProperties['changes']['fontFace']
  ) {
    if (!fontFace) return
    this.changeFont(fontFace.family)
    const fontType = this.fontManager.getFontType(
      this._currentContext.fontFace.family
    )
    if (fontType === 'mesh') {
      this._currentContext.italic = fontFace.style === 'Italic'
      this._currentContext.bold = (fontFace.weight || 400) >= 700
      this._currentContext.oblique = this.textStyle.obliqueAngle || 0
    } else {
      this._currentContext.italic = false
      this._currentContext.bold = false
      if (fontFace.style === 'Italic') {
        this._currentContext.oblique = 15
      } else {
        this._currentContext.oblique = this.textStyle.obliqueAngle || 0
      }
    }
  }

  /**
   * Apply color changes for the inline color command (\c).
   * This variant ignores null ACI and only applies explicit RGB when provided.
   * @param changes The full change object for the current command.
   */
  private applyColorCommandChanges(changes: ChangedProperties['changes']) {
    if (changes.aci !== undefined && changes.aci !== null) {
      if (changes.aci === 0) {
        this._currentContext.setColorFromHex(this._options.byBlockColor)
      } else if (changes.aci === 256) {
        this._currentContext.setColorFromHex(this._options.byLayerColor)
      } else {
        this._currentContext.color.aci = changes.aci
      }
    } else if (changes.rgb) {
      this._currentContext.color.rgb = changes.rgb
    }
  }

  /**
   * Apply color changes from a full snapshot restore.
   * This variant accepts null to switch back to ACI-based color.
   * @param changes The full snapshot of properties to restore.
   */
  private applyColorSnapshotChanges(changes: ChangedProperties['changes']) {
    if (changes.aci !== undefined) {
      if (changes.aci === null) {
        this._currentContext.color.aci = null
      } else if (changes.aci === 0) {
        this._currentContext.setColorFromHex(this._options.byBlockColor)
      } else if (changes.aci === 256) {
        this._currentContext.setColorFromHex(this._options.byLayerColor)
      } else {
        this._currentContext.color.aci = changes.aci
      }
    }

    if (changes.rgb !== undefined) {
      // rgb can be null to indicate switching back to ACI-based color
      this._currentContext.color.rgb = changes.rgb
    }
  }

  /**
   * Apply width factor changes, resolving relative factors to absolute values.
   * @param widthFactor Width factor change data.
   */
  private applyWidthFactorChange(
    widthFactor: ChangedProperties['changes']['widthFactor']
  ) {
    if (!widthFactor) return
    if (widthFactor.isRelative) {
      this._currentContext.widthFactor = {
        value: widthFactor.value * this.maxWidth,
        isRelative: false
      }
    } else {
      this._currentContext.widthFactor = {
        value: widthFactor.value * 0.85,
        isRelative: false
      }
    }
  }

  /**
   * Apply cap height changes, either as a relative scale or absolute font height.
   * @param capHeight Cap height change data.
   */
  private applyCapHeightChange(
    capHeight: ChangedProperties['changes']['capHeight']
  ) {
    if (!capHeight) return
    if (capHeight.isRelative) {
      this.changeFontSizeScaleFactor(capHeight.value)
    } else {
      this.changeFontHeight(capHeight.value)
    }
  }

  /**
   * Apply character tracking (spacing) changes.
   * @param charTrackingFactor Character tracking change data.
   */
  private applyCharTrackingChange(
    charTrackingFactor: ChangedProperties['changes']['charTrackingFactor']
  ) {
    if (!charTrackingFactor) return
    if (charTrackingFactor.isRelative) {
      this._currentContext.charTrackingFactor = {
        value: charTrackingFactor.value + 1,
        isRelative: false
      }
    } else {
      this._currentContext.charTrackingFactor = {
        value: charTrackingFactor.value,
        isRelative: false
      }
    }
  }

  /**
   * Applies indent and margins from a paragraph snapshot only.
   *
   * Used when exiting `{}` formatting groups: the parser restores full context
   * including `paragraph.align`, but paragraph alignment is not scoped to `{}`
   * (see class comment on `_currentHorizontalAlignment`). Restoring align here
   * would undo an active `\\p...` alignment before the line is finalized.
   */
  private applyParagraphMarginsOnly(
    paragraph: ChangedProperties['changes']['paragraph']
  ) {
    if (!paragraph) return
    if (typeof paragraph.indent === 'number') {
      this._currentIndent = paragraph.indent * this.defaultFontSize
      this._hOffset += this._currentIndent
    }
    if (typeof paragraph.left === 'number') {
      this._currentLeftMargin = paragraph.left * this.defaultFontSize
    }
    if (typeof paragraph.right === 'number') {
      this._currentRightMargin = paragraph.right * this.defaultFontSize
    }
  }

  /**
   * Apply paragraph-level changes such as alignment and margins.
   * @param paragraph Paragraph change data.
   */
  private applyParagraphChange(
    paragraph: ChangedProperties['changes']['paragraph']
  ) {
    if (!paragraph) return
    if ('align' in paragraph) {
      this._currentHorizontalAlignment =
        paragraph.align as MTextParagraphAlignment
    }
    if (typeof paragraph.indent === 'number') {
      this._currentIndent = paragraph.indent * this.defaultFontSize
      this._hOffset += this._currentIndent
    }
    if (typeof paragraph.left === 'number') {
      this._currentLeftMargin = paragraph.left * this.defaultFontSize
    }
    if (typeof paragraph.right === 'number') {
      this._currentRightMargin = paragraph.right * this.defaultFontSize
    }
  }

  /**
   * Reset paragraph properties to their default values from options.
   */
  private resetParagraphProperties() {
    this._currentIndent = 0
    this._currentLeftMargin = 0
    this._currentRightMargin = 0
    this._currentHorizontalAlignment = this._options.horizontalAlignment
  }

  /**
   * Start a new paragraph by processing current geometries, resetting paragraph properties,
   * and starting a new line with indent applied.
   * @param geometries Current text geometries to process
   * @param lineGeometries Current line geometries to process
   * @param meshCharBoxes Mesh char boxes to flush with the current line
   * @param lineCharBoxes Line char boxes to flush with the current line
   * @param group The group to add processed geometries to
   */
  private startNewParagraph(
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[],
    group: THREE.Group
  ) {
    this.recordVisualLineBreak(meshCharBoxes, lineCharBoxes)
    this.processGeometries(
      geometries,
      lineGeometries,
      meshCharBoxes,
      lineCharBoxes,
      group
    )
    this.advanceToNextLine(false) // Mark as first line of paragraph, apply indent

    // Reset paragraph properties to defaults at the start of a new paragraph
    this.resetParagraphProperties()
  }

  /**
   * Renders one SHX shape glyph for AutoCAD SHAPE entities.
   *
   * @param shapeName Optional SHX shape name from the SHAPE entity.
   * @param shapeNumber Optional SHX shape number from the SHAPE entity.
   * @returns A single styled THREE.js object for the resolved shape, or `undefined` when lookup fails.
   */
  processShapeGlyph(
    shapeName?: string,
    shapeNumber?: number
  ): THREE.Object3D | undefined {
    const resolved = this.resolveShapeGlyph(shapeName, shapeNumber)
    if (!resolved) {
      return undefined
    }

    this._lineBatchEntries = []
    const geometries: THREE.BufferGeometry[] = []
    const lineGeometries: THREE.BufferGeometry[] = []
    const meshCharBoxes: CharBox[] = []
    const lineCharBoxes: CharBox[] = []
    const charY =
      this.flowDirection === MTextFlowDirection.BOTTOM_TO_TOP
        ? 0
        : -this.currentLayoutFontSize

    const advance = this.buildShapeGeometry(
      resolved.shape,
      resolved.label,
      0,
      charY,
      geometries,
      lineGeometries,
      meshCharBoxes,
      lineCharBoxes
    )

    this._totalHeight = this.currentLayoutFontSize
    this._maxFontSize = this.currentLayoutFontSize
    this._maxLineAdvance = advance

    const object = this.toThreeObject(
      geometries,
      lineGeometries,
      meshCharBoxes,
      lineCharBoxes,
      CharBoxType.CHAR
    )
    if (object) {
      object.userData.logicalAdvanceWidth = advance
    }
    return object
  }

  /**
   * Resolves a SHX shape glyph by name and/or numeric code for SHAPE entities.
   *
   * Name lookup is attempted first; numeric lookup is used when the name is absent
   * or does not match. Unlike MText, failed SHAPE lookups do not fall back to `?`.
   *
   * @param shapeName Optional SHX shape name.
   * @param shapeNumber Optional SHX shape number.
   * @returns Resolved shape and display label, or `undefined` when not found.
   */
  private resolveShapeGlyph(
    shapeName?: string,
    shapeNumber?: number
  ): { shape: BaseTextShape; label: string } | undefined {
    const size = this.currentLayoutFontSize
    const fontName = this.textStyle.font.toLowerCase()
    const trimmedName = shapeName?.trim()
    const hasNumber = shapeNumber != null && shapeNumber !== 0

    if (trimmedName) {
      const byName = this.fontManager.getShapeByName(trimmedName, fontName, size)
      if (byName) {
        return { shape: byName, label: trimmedName }
      }
    }

    if (hasNumber) {
      const byCode = this.fontManager.getShapeByCode(shapeNumber!, fontName, size)
      if (byCode) {
        return { shape: byCode, label: String.fromCharCode(shapeNumber!) }
      }
    }

    // SHAPE entities have no "?" placeholder when name/number lookup fails.
    return undefined
  }

  /**
   * Builds geometry for one glyph and appends it to the output buffers.
   *
   * @returns Horizontal advance width after width factor and oblique skew.
   */
  private buildShapeGeometry(
    shape: BaseTextShape,
    label: string,
    charX: number,
    charY: number,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ): number {
    const { matrix, obliqueExtraAdvance } = this.buildCharTransformMatrix(
      charX,
      charY,
      this.currentLayoutFontSize
    )
    const canonical = shape.toGeometry()
    this.appendCharGeometry(
      shape,
      label,
      canonical,
      matrix,
      geometries,
      meshCharBoxes,
      lineCharBoxes
    )

    return (
      shape.width * this.currentWidthFactor +
      obliqueExtraAdvance * this.currentWidthFactor
    )
  }

  /**
   * Builds the world transform for one glyph (width factor, oblique, bold, translate).
   *
   * @param charX Horizontal glyph origin in drawing space.
   * @param charY Vertical glyph origin in drawing space.
   * @param charHeight Layout font height used for oblique advance calculation.
   * @returns Composite transform matrix and extra horizontal advance introduced by oblique skew.
   */
  private buildCharTransformMatrix(
    charX: number,
    charY: number,
    charHeight: number
  ): { matrix: THREE.Matrix4; obliqueExtraAdvance: number } {
    _scaleMatrix.makeScale(this.currentWidthFactor, 1, 1)

    let obliqueAngle = this._currentContext.oblique
    if (this._currentContext.italic) {
      obliqueAngle += 15
    }

    let obliqueExtraAdvance = 0
    if (obliqueAngle) {
      const angleRad = (obliqueAngle * Math.PI) / 180
      _skewMatrix.set(
        1,
        Math.tan(angleRad),
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      )
      obliqueExtraAdvance = Math.tan(angleRad) * charHeight
    } else {
      _skewMatrix.identity()
    }

    const fontType = this.fontManager.getFontType(this.currentFont)
    if (this._currentContext.bold && fontType === 'mesh') {
      _boldMatrix.makeScale(1.06, 1.06, 1)
    } else {
      _boldMatrix.identity()
    }

    _translateMatrix.makeTranslation(charX, charY, 0)

    const matrix = new THREE.Matrix4()
    matrix
      .copy(_translateMatrix)
      .multiply(_boldMatrix)
      .multiply(_skewMatrix)
      .multiply(_scaleMatrix)

    return { matrix, obliqueExtraAdvance }
  }

  /**
   * Appends one glyph's geometry to the active batch buffers and optional char boxes.
   *
   * Mesh fonts (`ShapeGeometry`) are transformed immediately; line fonts are queued in
   * {@link _lineBatchEntries} for later merge via {@link TextGeometryBuilder.mergeLineGeometries}.
   *
   * @param shape Source text shape for the glyph.
   * @param label Character label stored on geometry and char boxes.
   * @param canonical Untransformed glyph geometry from the font.
   * @param matrix World transform to apply to the glyph.
   * @param geometries Accumulator for mesh (`ShapeGeometry`) primitives.
   * @param meshCharBoxes Accumulator for mesh-glyph picking boxes.
   * @param lineCharBoxes Accumulator for line-glyph picking boxes.
   */
  private appendCharGeometry(
    shape: BaseTextShape,
    label: string,
    canonical: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    geometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ): void {
    if (canonical instanceof THREE.ShapeGeometry) {
      const geometry = canonical.clone()
      geometry.applyMatrix4(matrix)
      geometries.push(geometry)

      if (this._options.collectCharBoxes !== false) {
        geometry.userData.char = label
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox()
        }
        meshCharBoxes.push({
          type: CharBoxType.CHAR,
          box: new THREE.Box3().copy(geometry.boundingBox!),
          char: label,
          children: []
        })
        this._lastCharBoxTarget = 'mesh'
      }
      return
    }

    this._lineBatchEntries.push({ geometry: canonical, matrix })

    if (this._options.collectCharBoxes !== false) {
      if (!canonical.boundingBox) {
        canonical.computeBoundingBox()
      }
      _charBox.copy(canonical.boundingBox!).applyMatrix4(matrix)
      lineCharBoxes.push({
        type: CharBoxType.CHAR,
        box: new THREE.Box3().copy(_charBox),
        char: label,
        children: []
      })
      this._lastCharBoxTarget = 'line'
    }
  }

  /**
   * Creates a two-point line decoration geometry (underline, overline, strike-through).
   *
   * @param lineGeometries Accumulator for line-based decoration geometry.
   * @param vertices Six floats: start `(x,y,z)` and end `(x,y,z)` in drawing space.
   */
  private pushDecorationLine(
    lineGeometries: THREE.BufferGeometry[],
    vertices: number[]
  ): void {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
    geometry.setIndex([0, 1])
    geometry.userData = { isDecoration: true }
    lineGeometries.push(geometry)
  }

  /**
   * Render the specified texts
   * @param tokens Parsed MText token stream from the parser.
   * @returns A {@link THREE.Group} containing merged line/mesh objects and layout metadata.
   */
  processText(tokens: Generator<MTextToken>) {
    this._lastCharBoxTarget = undefined
    this._lineBatchEntries = []
    const geometries: THREE.BufferGeometry[] = []
    const lineGeometries: THREE.BufferGeometry[] = []
    const meshCharBoxes: CharBox[] = []
    const lineCharBoxes: CharBox[] = []

    const group: THREE.Group = new THREE.Group()

    for (const token of tokens) {
      if (token.type === TokenType.NEW_PARAGRAPH) {
        this.startNewParagraph(
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes,
          group
        )
      } else if (token.type === TokenType.WORD) {
        const words = token.data
        if (Array.isArray(words)) {
          words.forEach(word =>
            this.processWord(
              word,
              geometries,
              lineGeometries,
              meshCharBoxes,
              lineCharBoxes
            )
          )
        } else if (typeof words === 'string' && words.length > 0) {
          this.processWord(
            words,
            geometries,
            lineGeometries,
            meshCharBoxes,
            lineCharBoxes
          )
        }
      } else if (token.type === TokenType.SPACE) {
        this.processBlank(meshCharBoxes, lineCharBoxes)
      } else if (token.type === TokenType.PERCENT_SYMBOL) {
        this.processPercentSymbol(
          token.data as PercentSymbolData,
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes
        )
      } else if (token.type === TokenType.PROPERTIES_CHANGED) {
        // FLUSH before changing style: ensures all geometries up to this point use the previous style.
        // This is critical for correct color/formatting application within a line.
        this.processGeometries(
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes,
          group
        )

        const item = token.data as ChangedProperties
        if (item.command === undefined) {
          // Restore contexts to match parser depth.
          while (this._contextStack.length > item.depth) {
            this._currentContext = this._contextStack.pop()!
          }
          this.processFormat(item)
        } else {
          // Snapshot context once per depth level. Multiple commands in one {}
          // must share the same base context so restore works correctly.
          while (this._contextStack.length < item.depth) {
            this._contextStack.push(this._currentContext.clone())
          }
          this.processFormat(item)
        }
      } else if (token.type === TokenType.STACK) {
        // Flush pending regular text first so it won't be grouped into this stack char box.
        this.processGeometries(
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes,
          group
        )

        const stackData = token.data as string[]
        this.processStack(
          stackData,
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes
        )
        const stackType =
          stackData[2] === '^' ? CharBoxType.CHAR : CharBoxType.STACK
        this.processGeometries(
          geometries,
          lineGeometries,
          meshCharBoxes,
          lineCharBoxes,
          group,
          stackType
        )
      }
    }

    if (
      geometries.length > 0 ||
      lineGeometries.length > 0 ||
      this._lineBatchEntries.length > 0
    ) {
      this.processGeometries(
        geometries,
        lineGeometries,
        meshCharBoxes,
        lineCharBoxes,
        group
      )
    }
    // Keep char boxes even when no visible geometry exists (empty lines, spaces only).
    else if (meshCharBoxes.length > 0 || lineCharBoxes.length > 0) {
      this.processGeometries(
        geometries,
        lineGeometries,
        meshCharBoxes,
        lineCharBoxes,
        group
      )
    }

    this.processLastLine()
    this.captureCurrentLineAdvance()
    this.recordCurrentLineLayout()
    group.userData.lineLayouts = this._lineLayouts.map((line, index) => ({
      ...line,
      breakIndex:
        index < this._lineLayouts.length - 1
          ? this._lineBreakIndices[index]
          : undefined
    }))
    group.userData.logicalAdvanceWidth = this._maxLineAdvance
    return group
  }

  /**
   * Flushes pending geometry and char boxes into a styled THREE.js object on `group`.
   *
   * When only char boxes exist (spaces, empty lines), creates a marker object with
   * layout metadata and no visible geometry.
   *
   * @param geometries Pending mesh geometries for the current style segment.
   * @param lineGeometries Pending line geometries and decorations for the current style segment.
   * @param meshCharBoxes Mesh-glyph char boxes collected since the last flush.
   * @param lineCharBoxes Line-glyph char boxes collected since the last flush.
   * @param group Parent group receiving the created object.
   * @param charBoxType Char-box classification stored on the flushed object.
   */
  private processGeometries(
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[],
    group: THREE.Group,
    charBoxType: CharBoxType = CharBoxType.CHAR
  ) {
    const finalCharCount = this.countFinalCharBoxes(
      meshCharBoxes,
      lineCharBoxes,
      charBoxType
    )

    if (geometries.length > 0 || lineGeometries.length > 0 || this._lineBatchEntries.length > 0) {
      const object = this.toThreeObject(
        geometries,
        lineGeometries,
        meshCharBoxes,
        lineCharBoxes,
        charBoxType
      )
      group.add(object)
      this._currentLineObjects.push(object)
      geometries.length = 0
      lineGeometries.length = 0
      this._lineBatchEntries = []
      meshCharBoxes.length = 0
      lineCharBoxes.length = 0
      this._processedCharCount += finalCharCount
    } else if (meshCharBoxes.length > 0 || lineCharBoxes.length > 0) {
      const object = new THREE.Object3D()
      object.userData.bboxIntersectionCheck = true
      object.userData.charBoxType = charBoxType
      object.userData.layout = {
        chars: [...meshCharBoxes, ...lineCharBoxes]
      }
      group.add(object)
      this._currentLineObjects.push(object)
      meshCharBoxes.length = 0
      lineCharBoxes.length = 0
      this._processedCharCount += finalCharCount
    }
  }

  /**
   * Lays out and renders one parser word token, breaking to a new visual line when needed.
   *
   * @param word Character sequence for a single word token.
   * @param geometries Mesh geometry accumulator for the active style segment.
   * @param lineGeometries Line geometry accumulator for the active style segment.
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   */
  private processWord(
    word: string,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ) {
    const resolvedChars: Array<{ char: string; shape?: BaseTextShape }> = []
    let wordWidth = 0

    for (let i = 0; i < word.length; i++) {
      const char = word[i]
      const resolved = this.resolveCharShape(char)
      const shape = resolved?.shape
      resolvedChars.push({ char, shape })

      if (shape) {
        if (
          this.currentHorizontalAlignment == MTextParagraphAlignment.DISTRIBUTED
        ) {
          wordWidth += shape.width * this.currentWidthFactor
        } else {
          wordWidth +=
            shape.width * this.currentWordSpace * this.currentWidthFactor
        }
      } else {
        wordWidth += this.currentBlankAdvance
      }
    }

    if (this.hOffset + wordWidth > (this.maxLineWidth || Infinity)) {
      if (this._vOffset <= 0 && this._currentLineObjects.length <= 0) {
        // Do nothing
      } else {
        this.recordVisualLineBreak(meshCharBoxes, lineCharBoxes)
        this.advanceToNextLine(false)
      }
    }

    for (const { char } of resolvedChars) {
      this.processChar(
        char,
        geometries,
        lineGeometries,
        meshCharBoxes,
        lineCharBoxes
      )
    }
  }

  /**
   * Renders an MText stack token (`\S...;`) as fraction, superscript, subscript, or tolerance layout.
   *
   * @param stackData Parser stack payload: `[numerator, denominator, divider]`.
   * @param geometries Mesh geometry accumulator.
   * @param lineGeometries Line geometry accumulator.
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   */
  private processStack(
    stackData: string[],
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ) {
    const [numerator, denominator, divider] = stackData

    // Store current position and state
    const currentHOffset = this._hOffset
    const currentVOffset = this._vOffset
    const currentWordSpace = this._currentContext.charTrackingFactor.value
    const currentStackFontSize = this.currentFontSize
    const currentFontSizeScaleFactor = this._currentContext.fontSizeScaleFactor

    // First pass: calculate widths
    this._hOffset = currentHOffset
    this._currentContext.charTrackingFactor = { value: 1, isRelative: false }
    let numeratorWidth = 0
    for (let i = 0; i < numerator.length; i++) {
      const shape = this.getCharShape(numerator[i])
      if (shape) {
        numeratorWidth += shape.width * this.currentWidthFactor
      }
    }

    this._hOffset = currentHOffset
    let denominatorWidth = 0
    for (let i = 0; i < denominator.length; i++) {
      const shape = this.getCharShape(denominator[i])
      if (shape) {
        denominatorWidth += shape.width * this.currentWidthFactor
      }
    }

    const fractionWidth = Math.max(numeratorWidth, denominatorWidth)
    const numeratorOffset = (fractionWidth - numeratorWidth) / 2
    const denominatorOffset = (fractionWidth - denominatorWidth) / 2

    // Handle different stack types based on divider
    if (divider === '^') {
      // Superscript case
      if (numerator && !denominator) {
        this._currentContext.fontSizeScaleFactor =
          currentFontSizeScaleFactor * 0.7
        this.calcuateLineParams()

        const superscriptGeometries: THREE.BufferGeometry[] = []
        const superscriptLineGeometries: THREE.BufferGeometry[] = []
        const superscriptMeshCharBoxes: CharBox[] = []
        const superscriptLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset
        this._vOffset = this.convertTopAlignedVOffset(
          currentVOffset + currentStackFontSize * 0.1,
          this.currentFontSize
        )
        for (let i = 0; i < numerator.length; i++) {
          this.processChar(
            numerator[i],
            superscriptGeometries,
            superscriptLineGeometries,
            superscriptMeshCharBoxes,
            superscriptLineCharBoxes
          )
        }
        geometries.push(...superscriptGeometries)
        lineGeometries.push(...superscriptLineGeometries)
        meshCharBoxes.push(...superscriptMeshCharBoxes)
        lineCharBoxes.push(...superscriptLineCharBoxes)
        this._hOffset = currentHOffset + numeratorWidth

        this._currentContext.fontSizeScaleFactor = currentFontSizeScaleFactor
        this.calcuateLineParams()
      }

      // Subscript case
      else if (!numerator && denominator) {
        this._currentContext.fontSizeScaleFactor =
          currentFontSizeScaleFactor * 0.7
        this.calcuateLineParams()

        const subscriptGeometries: THREE.BufferGeometry[] = []
        const subscriptLineGeometries: THREE.BufferGeometry[] = []
        const subscriptMeshCharBoxes: CharBox[] = []
        const subscriptLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset
        this._vOffset = this.convertTopAlignedVOffset(
          currentVOffset - currentStackFontSize * 0.6,
          this.currentFontSize
        )
        for (let i = 0; i < denominator.length; i++) {
          this.processChar(
            denominator[i],
            subscriptGeometries,
            subscriptLineGeometries,
            subscriptMeshCharBoxes,
            subscriptLineCharBoxes
          )
        }
        geometries.push(...subscriptGeometries)
        lineGeometries.push(...subscriptLineGeometries)
        meshCharBoxes.push(...subscriptMeshCharBoxes)
        lineCharBoxes.push(...subscriptLineCharBoxes)
        this._hOffset = currentHOffset + denominatorWidth

        this._currentContext.fontSizeScaleFactor = currentFontSizeScaleFactor
        this.calcuateLineParams()
      }

      // Tolerance / vertical stack with both upper and lower parts (e.g. \S+0.021^0;).
      // Stack elements are left-aligned, with the lower part bottom aligned to the main text bottom.
      else if (numerator && denominator) {
        const fontScaleFactor = this._currentContext.fontScaleFactor || 1
        const mainLayoutFontSize =
          (this._maxFontSize || this.currentFontSize) / fontScaleFactor
        const toleranceUsesDefaultScale =
          Math.abs(this.currentLayoutFontSize - mainLayoutFontSize) < 1e-6
        if (toleranceUsesDefaultScale) {
          this._currentContext.fontSizeScaleFactor =
            currentFontSizeScaleFactor * 0.7
          this.calcuateLineParams()
        }

        const stackWidth = Math.max(numeratorWidth, denominatorWidth)
        const upperOffset = 0
        const lowerOffset = 0
        const stackLayoutFontSize = this.currentLayoutFontSize
        const lowerBaseline =
          currentVOffset - mainLayoutFontSize + stackLayoutFontSize
        const upperBaseline = lowerBaseline + this.currentFontSize

        const upperGeometries: THREE.BufferGeometry[] = []
        const upperLineGeometries: THREE.BufferGeometry[] = []
        const upperMeshCharBoxes: CharBox[] = []
        const upperLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset + upperOffset
        this._vOffset = upperBaseline
        for (let i = 0; i < numerator.length; i++) {
          this.processChar(
            numerator[i],
            upperGeometries,
            upperLineGeometries,
            upperMeshCharBoxes,
            upperLineCharBoxes
          )
        }
        geometries.push(...upperGeometries)
        lineGeometries.push(...upperLineGeometries)
        meshCharBoxes.push(...upperMeshCharBoxes)
        lineCharBoxes.push(...upperLineCharBoxes)

        const lowerGeometries: THREE.BufferGeometry[] = []
        const lowerLineGeometries: THREE.BufferGeometry[] = []
        const lowerMeshCharBoxes: CharBox[] = []
        const lowerLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset + lowerOffset
        this._vOffset = lowerBaseline
        for (let i = 0; i < denominator.length; i++) {
          this.processChar(
            denominator[i],
            lowerGeometries,
            lowerLineGeometries,
            lowerMeshCharBoxes,
            lowerLineCharBoxes
          )
        }
        geometries.push(...lowerGeometries)
        lineGeometries.push(...lowerLineGeometries)
        meshCharBoxes.push(...lowerMeshCharBoxes)
        lineCharBoxes.push(...lowerLineCharBoxes)
        this._hOffset = currentHOffset + stackWidth

        if (toleranceUsesDefaultScale) {
          this._currentContext.fontSizeScaleFactor = currentFontSizeScaleFactor
          this.calcuateLineParams()
        }
      }
    } else {
      // Fraction case
      // Second pass: render numerator
      const numeratorGeometries: THREE.BufferGeometry[] = []
      const numeratorLineGeometries: THREE.BufferGeometry[] = []
      const numeratorMeshCharBoxes: CharBox[] = []
      const numeratorLineCharBoxes: CharBox[] = []

      this._hOffset = currentHOffset + numeratorOffset
      this._vOffset = this.convertTopAlignedVOffset(
        currentVOffset + this.currentFontSize * 0.3,
        this.currentFontSize
      )
      for (let i = 0; i < numerator.length; i++) {
        this.processChar(
          numerator[i],
          numeratorGeometries,
          numeratorLineGeometries,
          numeratorMeshCharBoxes,
          numeratorLineCharBoxes
        )
      }
      geometries.push(...numeratorGeometries)
      lineGeometries.push(...numeratorLineGeometries)
      meshCharBoxes.push(...numeratorMeshCharBoxes)
      lineCharBoxes.push(...numeratorLineCharBoxes)

      // Keep logical char order for stacks: numerator -> divider -> denominator.
      if (divider === '/' || divider === '#') {
        this.recordStackDivider(
          currentHOffset,
          currentVOffset,
          fractionWidth,
          meshCharBoxes,
          lineCharBoxes
        )
      }

      // Render denominator
      const denominatorGeometries: THREE.BufferGeometry[] = []
      const denominatorLineGeometries: THREE.BufferGeometry[] = []
      const denominatorMeshCharBoxes: CharBox[] = []
      const denominatorLineCharBoxes: CharBox[] = []

      this._hOffset = currentHOffset + denominatorOffset
      this._vOffset = this.convertTopAlignedVOffset(
        currentVOffset - this.currentFontSize * 0.6,
        this.currentFontSize
      )
      for (let i = 0; i < denominator.length; i++) {
        this.processChar(
          denominator[i],
          denominatorGeometries,
          denominatorLineGeometries,
          denominatorMeshCharBoxes,
          denominatorLineCharBoxes
        )
      }
      geometries.push(...denominatorGeometries)
      lineGeometries.push(...denominatorLineGeometries)
      meshCharBoxes.push(...denominatorMeshCharBoxes)
      lineCharBoxes.push(...denominatorLineCharBoxes)

      // Render fraction line if needed
      if (divider === '/' || divider === '#') {
        const lineGeometry = new THREE.BufferGeometry()
        const lineVertices = new Float32Array([
          currentHOffset,
          currentVOffset -
            this.currentFontSize * 0.8 +
            this.defaultFontSize * STACK_VERTICAL_SHIFT_FACTOR,
          0,
          currentHOffset + fractionWidth,
          currentVOffset -
            this.currentFontSize * 0.8 +
            this.defaultFontSize * STACK_VERTICAL_SHIFT_FACTOR,
          0
        ])
        lineGeometry.setAttribute(
          'position',
          new THREE.BufferAttribute(lineVertices, 3)
        )
        lineGeometry.setIndex([0, 1])
        lineGeometry.userData = { isDecoration: true }
        lineGeometries.push(lineGeometry)
      }

      this._hOffset = currentHOffset + fractionWidth
    }

    // Restore state
    this._vOffset = currentVOffset
    this._currentContext.charTrackingFactor = {
      value: currentWordSpace,
      isRelative: false
    }
  }

  /**
   * Records a zero-height char box for a stack fraction divider in logical char order.
   *
   * @param startX Horizontal start of the fraction bar in drawing space.
   * @param currentVOffset Vertical baseline of the stack relative to the main line.
   * @param width Horizontal extent of the fraction bar.
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   */
  private recordStackDivider(
    startX: number,
    currentVOffset: number,
    width: number,
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ) {
    if (this._options.collectCharBoxes === false) return

    const y =
      currentVOffset -
      this.currentFontSize * 0.8 +
      this.defaultFontSize * STACK_VERTICAL_SHIFT_FACTOR
    const box = new THREE.Box3(
      new THREE.Vector3(startX, y, 0),
      new THREE.Vector3(startX + width, y, 0)
    )

    const target = this.resolveCharBoxTarget(meshCharBoxes, lineCharBoxes)
    if (target === 'mesh') {
      meshCharBoxes.push({
        type: CharBoxType.CHAR,
        box,
        char: STACK_DIVIDER_CHAR,
        children: []
      })
    } else {
      lineCharBoxes.push({
        type: CharBoxType.CHAR,
        box,
        char: STACK_DIVIDER_CHAR,
        children: []
      })
    }
  }

  /**
   * Convert a legacy top-anchored vOffset (used by stack/sub/sup logic) into
   * the current baseline-anchored coordinate system.
   *
   * @param legacyTopAlignedVOffset Vertical position in the legacy top-anchored system.
   * @param fontSize Font size associated with the legacy offset.
   * @returns Baseline-anchored vertical offset for the current layout model.
   */
  private convertTopAlignedVOffset(
    legacyTopAlignedVOffset: number,
    fontSize: number
  ): number {
    return (
      legacyTopAlignedVOffset -
      fontSize +
      this.defaultFontSize +
      this.defaultFontSize * STACK_VERTICAL_SHIFT_FACTOR
    )
  }

  /**
   * Advances the pen by one space width and optionally records a space char box.
   *
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   */
  private processBlank(meshCharBoxes: CharBox[], lineCharBoxes: CharBox[]) {
    if (this._options.collectCharBoxes !== false) {
      const charX = this._hOffset
      const charY =
        this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP
          ? this._vOffset
          : this._vOffset - this.currentLayoutFontSize
      const box = new THREE.Box3(
        new THREE.Vector3(charX, charY, 0),
        new THREE.Vector3(
          charX + this.currentBlankAdvance,
          charY + this.currentLayoutFontSize,
          0
        )
      )
      const target = this.resolveCharBoxTarget(meshCharBoxes, lineCharBoxes)
      if (target === 'mesh') {
        meshCharBoxes.push({
          type: CharBoxType.CHAR,
          box,
          char: ' ',
          children: []
        })
      } else {
        lineCharBoxes.push({
          type: CharBoxType.CHAR,
          box,
          char: ' ',
          children: []
        })
      }
    }
    this._hOffset += this.currentBlankAdvance
  }

  /**
   * Records the character index where a visual line break occurs.
   *
   * @param meshCharBoxes Optional pending mesh char boxes included in the break index.
   * @param lineCharBoxes Optional pending line char boxes included in the break index.
   */
  private recordVisualLineBreak(
    meshCharBoxes?: CharBox[],
    lineCharBoxes?: CharBox[]
  ) {
    const breakIndex =
      this._processedCharCount +
      this.countFinalCharBoxes(
        meshCharBoxes ?? [],
        lineCharBoxes ?? [],
        CharBoxType.CHAR
      )
    this._lineBreakIndices.push(breakIndex)
  }

  /**
   * Appends vertical layout metadata for the current visual line to {@link _lineLayouts}.
   */
  private recordCurrentLineLayout() {
    const yBase =
      this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP
        ? this._vOffset
        : this._vOffset - this.defaultFontSize
    const height = this.currentLineHeight
    this._lineLayouts.push({
      y: yBase + height / 2,
      height
    })
  }

  /**
   * Renders a percent-control-code symbol (`%%...`) or its literal fallback character.
   *
   * @param data Parser payload describing the percent symbol kind and lookup data.
   * @param geometries Mesh geometry accumulator.
   * @param lineGeometries Line geometry accumulator.
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   */
  private processPercentSymbol(
    data: PercentSymbolData,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ): void {
    if (data.kind === 'literal') {
      this.processChar(data.char, geometries, lineGeometries, meshCharBoxes, lineCharBoxes)
      return
    }

    const shape = this.resolvePercentSymbolShape(data)
    this.processChar(
      data.char,
      geometries,
      lineGeometries,
      meshCharBoxes,
      lineCharBoxes,
      shape
    )
  }

  /**
   * Renders one character glyph, including decorations and line-break handling.
   *
   * Missing glyphs are treated as spaces. When the pen exceeds {@link maxLineWidth},
   * a visual line break is recorded before placement.
   *
   * @param char Character to render.
   * @param geometries Mesh geometry accumulator.
   * @param lineGeometries Line geometry accumulator.
   * @param meshCharBoxes Mesh char-box accumulator.
   * @param lineCharBoxes Line char-box accumulator.
   * @param shapeOverride Optional pre-resolved shape (used by percent symbols and stacks).
   */
  private processChar(
    char: string,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[],
    shapeOverride?: BaseTextShape
  ): void {
    const resolved = shapeOverride
      ? { shape: shapeOverride, sourceFont: this.currentFont }
      : this.resolveCharShape(char)
    const shape = resolved?.shape
    if (!shape) {
      this.processBlank(meshCharBoxes, lineCharBoxes)
      return
    }

    if (!this._lineHasRenderableChar) {
      this.applyPendingEmptyLineYAdjust()
    }

    if (this.hOffset > (this.maxLineWidth || Infinity)) {
      this.recordVisualLineBreak(meshCharBoxes, lineCharBoxes)
      this.advanceToNextLine(false)
    }

    const charX = this.hOffset
    const charY =
      this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP
        ? this.vOffset
        : this.vOffset - this.currentLayoutFontSize
    const charHeight = this.currentLayoutFontSize
    const charWidth = shape.width * this.currentWidthFactor

    const { matrix, obliqueExtraAdvance } = this.buildCharTransformMatrix(
      charX,
      charY,
      charHeight
    )
    const canonical = shape.toGeometry()
    this.appendCharGeometry(
      shape,
      char,
      canonical,
      matrix,
      geometries,
      meshCharBoxes,
      lineCharBoxes
    )

    const horizontalAdvance =
      shape.width * this.currentWidthFactor +
      obliqueExtraAdvance * this.currentWidthFactor
    if (
      this.currentHorizontalAlignment == MTextParagraphAlignment.DISTRIBUTED
    ) {
      this._hOffset += horizontalAdvance
    } else {
      this._hOffset +=
        shape.width * this.currentWordSpace * this.currentWidthFactor +
        obliqueExtraAdvance * this.currentWidthFactor
    }
    this._lineHasRenderableChar = true

    const lineOffset = charHeight * 0.05
    const lineZ = 0.001
    if (this._currentContext.underline) {
      const underlineY = charY - lineOffset
      this.pushDecorationLine(lineGeometries, [
        charX,
        underlineY,
        lineZ,
        charX + charWidth,
        underlineY,
        lineZ
      ])
    }

    if (this._currentContext.overline) {
      const overlineY = charY + charHeight + lineOffset
      this.pushDecorationLine(lineGeometries, [
        charX,
        overlineY,
        lineZ,
        charX + charWidth,
        overlineY,
        lineZ
      ])
    }

    if (this._currentContext.strikeThrough) {
      const strikeY = charY + charHeight / 2 - charHeight * 0.2
      this.pushDecorationLine(lineGeometries, [
        charX,
        strikeY,
        lineZ,
        charX + charWidth,
        strikeY,
        lineZ
      ])
    }
  }

  /**
   * Applies horizontal alignment to the final visual line after all tokens are processed.
   */
  private processLastLine() {
    this.processAlignment()
  }

  /**
   * Initializes line metric state from the current font and default text height.
   */
  private initLineParams() {
    this.calcuateLineParams()
  }

  /**
   * Switches the active font family and recomputes derived line metrics.
   *
   * @param fontName Font family name from an inline `\f` command or text style.
   */
  private changeFont(fontName: string) {
    let processedFontName = fontName
    if (this._options.removeFontExtension) {
      processedFontName = fontName.replace(/\.(ttf|otf|woff|shx)$/, '')
    }
    this._currentContext.fontFace.family =
      this.fontManager.findAndReplaceFont(processedFontName)
    this.calcuateLineParams()
    this._currentContext.blankWidth = this.calculateBlankWidthForFont(
      this._currentContext.fontFace.family,
      this.currentLayoutFontSize
    )
  }

  /**
   * Recalculates font scale factor and drawing-space font size from defaults and scale factors.
   *
   * @param newFontHeight Optional absolute font height override in drawing units.
   */
  private calcuateLineParams(newFontHeight?: number) {
    this._currentContext.fontScaleFactor = this.fontManager.getFontScaleFactor(
      this.currentFont
    )

    const fontHeight =
      newFontHeight || this.defaultFontSize || this.textStyle.fixedTextHeight
    this._currentContext.fontSize =
      fontHeight *
      this._currentContext.fontScaleFactor *
      this._currentContext.fontSizeScaleFactor
  }

  /**
   * Returns whether a shape contributes visible stroke or mesh geometry for rendering.
   *
   * @param shape Candidate text shape.
   * @param char Character being resolved (spaces may still be renderable when width > 0).
   * @returns `true` when the shape should be drawn instead of replaced with the not-found glyph.
   */
  private shapeHasStrokeGeometry(shape: BaseTextShape, char: string): boolean {
    const hasStroke =
      typeof shape.hasStrokeGeometry === 'function'
        ? shape.hasStrokeGeometry()
        : shape.width > 0
    if (hasStroke) {
      return true
    }
    return char === ' ' && shape.width > 0
  }

  /**
   * Resolves the best available shape for a percent-control-code symbol.
   *
   * Tries symbol-font lookup codes first, then falls back to the primary font glyph.
   *
   * @param data Parser percent-symbol payload.
   * @returns A renderable text shape for the symbol.
   */
  private resolvePercentSymbolShape(
    data: PercentSymbolData
  ): BaseTextShape | undefined {
    for (const lookupCode of getPercentSymbolLookupCodes(data)) {
      const symbolShape = this.fontManager.getCodeShapeFromSymbolFonts(
        lookupCode,
        this.currentFontSize
      )
      if (symbolShape && this.shapeHasStrokeGeometry(symbolShape, data.char)) {
        if (this.currentFontSize > this._maxFontSize) {
          this._maxFontSize = this.currentFontSize
        }
        return symbolShape
      }
    }
    return this.getCharShape(data.char)
  }

  /**
   * Resolves the text shape for one character using primary font, big font, defaults, and symbol fonts.
   *
   * Updates {@link _maxFontSize} when the active font size exceeds the current line maximum.
   * Falls back to the not-found glyph when no renderable geometry is available.
   *
   * @param char Character to resolve.
   * @returns Renderable text shape and the font that supplied it.
   */
  private resolveCharShape(
    char: string
  ): { shape: BaseTextShape; sourceFont: string } | undefined {
    const primaryFont = this.currentFont
    const bigFont = this.textStyle.bigFont?.trim()
    let shape: BaseTextShape | undefined
    let sourceFont = primaryFont

    if (this.canProbeFontOwnership()) {
      if (this.fontHasChar(primaryFont, char)) {
        shape = this.fontManager.getCharShape(
          char,
          primaryFont,
          this.currentFontSize
        )
      }
    } else {
      shape = this.fontManager.getCharShape(
        char,
        primaryFont,
        this.currentFontSize
      )
    }

    if (!shape && bigFont) {
      shape = this.fontManager.getCharShape(
        char,
        bigFont,
        this.currentFontSize
      )
      if (shape) {
        sourceFont = bigFont
      }
    }

    if (!shape) {
      shape = this.fontManager.getCharShapeFromDefaults(
        char,
        this.currentFontSize
      )
      if (shape) {
        sourceFont = primaryFont
      }
    }

    if (!shape) {
      const code = char.codePointAt(0)
      if (code != null) {
        shape = this.fontManager.getCodeShapeFromSymbolFonts(
          code,
          this.currentFontSize
        )
        if (shape) {
          sourceFont = primaryFont
        }
      }
    }

    if (!shape || !this.shapeHasStrokeGeometry(shape, char)) {
      shape = this.fontManager.getNotFoundTextShape(this.currentFontSize)
      if (!shape) {
        return undefined
      }
      sourceFont = primaryFont
    }

    if (this.currentFontSize > this._maxFontSize) {
      this._maxFontSize = this.currentFontSize
    }
    return { shape, sourceFont }
  }

  private canProbeFontOwnership(): boolean {
    return typeof this.fontManager.getFontByName === 'function'
  }

  private fontHasChar(fontName: string, char: string): boolean {
    const getFontByName = this.fontManager.getFontByName
    if (typeof getFontByName !== 'function') {
      return false
    }
    const font = getFontByName.call(this.fontManager, fontName, false)
    return font?.hasChar(char) ?? false
  }

  /**
   * Returns the renderable shape for one character, discarding font provenance metadata.
   *
   * @param char Character to resolve.
   * @returns Renderable text shape, or `undefined` when resolution fails entirely.
   */
  private getCharShape(char: string) {
    return this.resolveCharShape(char)?.shape
  }

  /**
   * Finalizes the current visual line and starts the next one.
   *
   * Records layout metadata, resets horizontal pen state, updates vertical offset,
   * and reapplies paragraph alignment to objects on the completed line.
   *
   * @param collectBreakIndex When `true`, records a char index for automatic wrapping.
   */
  private advanceToNextLine(collectBreakIndex = true) {
    if (collectBreakIndex) {
      this.recordVisualLineBreak()
    }
    this.captureCurrentLineAdvance()
    this.recordCurrentLineLayout()
    this._hOffset = 0
    if (!this._lineHasRenderableChar) {
      this._pendingEmptyLineFontSizeAdjust = this.currentFontSize
    } else {
      this._pendingEmptyLineFontSizeAdjust = undefined
    }
    if (this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP) {
      this._vOffset += this.currentLineHeight
    } else {
      this._vOffset -= this.currentLineHeight
    }
    this._lineCount++
    this.processAlignment()
    this._currentLineObjects = []
    if (this._lineCount == 2) {
      this._totalHeight = this.currentMaxFontSize
    } else {
      this._totalHeight = this._totalHeight + this.currentLineHeight
    }
    // Reset maxFontSize for the new line
    this._maxFontSize = 0
    this._lineHasRenderableChar = false
  }

  /**
   * Updates {@link _maxLineAdvance} from the current line's horizontal pen position.
   */
  private captureCurrentLineAdvance() {
    if (Number.isFinite(this._hOffset)) {
      this._maxLineAdvance = Math.max(this._maxLineAdvance, this._hOffset)
    }
  }

  /**
   * Counts logical characters represented by pending char boxes for break-index accounting.
   *
   * Stack char boxes collapse numerator, divider, and denominator into one logical token.
   *
   * @param meshCharBoxes Pending mesh char boxes.
   * @param lineCharBoxes Pending line char boxes.
   * @param charBoxType Classification of the geometry group being flushed.
   * @returns Number of logical characters contributed by the pending boxes.
   */
  private countFinalCharBoxes(
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[],
    charBoxType: CharBoxType
  ): number {
    const entries = [...meshCharBoxes, ...lineCharBoxes].filter(
      entry => entry.char !== STACK_DIVIDER_CHAR
    )
    if (charBoxType !== CharBoxType.STACK) {
      return entries.length
    }

    const isSpaceChar = (entry: CharBox) =>
      entry.type === CharBoxType.CHAR && entry.char.trim().length === 0
    const isContentChar = (entry: CharBox) =>
      entry.type === CharBoxType.CHAR && entry.char.trim().length > 0
    const firstContentIdx = entries.findIndex(isContentChar)
    if (firstContentIdx < 0) return entries.filter(isSpaceChar).length

    let lastContentIdx = -1
    for (let i = entries.length - 1; i >= 0; i--) {
      if (isContentChar(entries[i])) {
        lastContentIdx = i
        break
      }
    }

    const prefixTokens = entries.slice(0, firstContentIdx).filter(isSpaceChar)
    const suffixTokens = entries.slice(lastContentIdx + 1).filter(isSpaceChar)
    return prefixTokens.length + 1 + suffixTokens.length
  }

  /**
   * Corrects vertical offset when the first glyph on a line uses a different font size
   * than the empty line that preceded it.
   */
  private applyPendingEmptyLineYAdjust() {
    if (this._pendingEmptyLineFontSizeAdjust === undefined) return
    const fontDelta =
      this.currentFontSize - this._pendingEmptyLineFontSizeAdjust
    if (fontDelta !== 0) {
      if (this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP) {
        this._vOffset += fontDelta
      } else {
        this._vOffset -= fontDelta
      }
    }
    this._pendingEmptyLineFontSizeAdjust = undefined
  }

  /**
   * Chooses whether subsequent char boxes should attach to mesh or line geometry owners.
   *
   * @param meshCharBoxes Mesh char boxes already collected on the current line.
   * @param lineCharBoxes Line char boxes already collected on the current line.
   * @returns Target geometry family for the next char box.
   */
  private resolveCharBoxTarget(
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ): 'mesh' | 'line' {
    if (this._lastCharBoxTarget) return this._lastCharBoxTarget
    if (meshCharBoxes.length > 0 && lineCharBoxes.length === 0) return 'mesh'
    if (lineCharBoxes.length > 0 && meshCharBoxes.length === 0) return 'line'
    return this.fontManager.getFontType(this.currentFont) === 'mesh'
      ? 'mesh'
      : 'line'
  }

  /**
   * Applies translation on the specified buffer geometries according to text alignment setting.
   *
   * Translates both geometry vertices and attached char boxes on the current visual line.
   */
  private processAlignment() {
    const geometryEntries: Array<{
      geometry: THREE.BufferGeometry
      owner: THREE.Object3D
    }> = []
    this.currentLineObjects.forEach(object =>
      object.traverse(obj => {
        if ('geometry' in obj) {
          geometryEntries.push({
            geometry: obj.geometry as THREE.BufferGeometry,
            owner: obj as THREE.Object3D
          })
        }
      })
    )
    if (geometryEntries.length == 0) return

    let bbox: THREE.Box3 | undefined
    geometryEntries.forEach((entry, i) => {
      if (!entry.geometry.boundingBox) {
        entry.geometry.computeBoundingBox()
      }
      if (i === 0) {
        bbox = entry.geometry.boundingBox as THREE.Box3
      } else {
        bbox!.union(entry.geometry.boundingBox as THREE.Box3)
      }
    })
    if (!bbox) return

    const resolvedBBox = bbox
    const size = resolvedBBox.getSize(tempVector)
    const translateCharBoxes = (owner: THREE.Object3D, dx: number) => {
      const charBoxes = owner.userData?.layout?.chars as CharBox[] | undefined

      if (charBoxes && charBoxes.length > 0) {
        const translation = new THREE.Vector3(dx, 0, 0)
        charBoxes.forEach(entry => entry.box?.translate(translation))
      }
    }

    const applyLeftAlignment = () => {
      const dx = Number.isFinite(this.maxLineWidth)
        ? this._currentLeftMargin - resolvedBBox.min.x
        : this._currentLeftMargin

      const translated = new Set<THREE.Object3D>()
      geometryEntries.forEach(entry => {
        entry.geometry.translate(dx, 0, 0)
        if (!translated.has(entry.owner)) {
          translateCharBoxes(entry.owner, dx)
          translated.add(entry.owner)
        }
      })
    }

    switch (this.currentHorizontalAlignment) {
      case MTextParagraphAlignment.LEFT:
      case MTextParagraphAlignment.JUSTIFIED: {
        applyLeftAlignment()
        break
      }
      case MTextParagraphAlignment.CENTER: {
        if (!Number.isFinite(this.maxLineWidth)) {
          applyLeftAlignment()
          break
        }
        const dx =
          this._currentLeftMargin +
          (this.maxLineWidth - size.x) / 2 -
          resolvedBBox.min.x

        const translated = new Set<THREE.Object3D>()
        geometryEntries.forEach(entry => {
          entry.geometry.translate(dx, 0, 0)
          if (!translated.has(entry.owner)) {
            translateCharBoxes(entry.owner, dx)
            translated.add(entry.owner)
          }
        })
        break
      }
      case MTextParagraphAlignment.RIGHT: {
        if (!Number.isFinite(this.maxLineWidth)) {
          applyLeftAlignment()
          break
        }
        const dx =
          this._currentLeftMargin +
          this.maxLineWidth -
          size.x -
          resolvedBBox.min.x

        const translated = new Set<THREE.Object3D>()
        geometryEntries.forEach(entry => {
          entry.geometry.translate(dx, 0, 0)
          if (!translated.has(entry.owner)) {
            translateCharBoxes(entry.owner, dx)
            translated.add(entry.owner)
          }
        })
        break
      }
      case MTextParagraphAlignment.DISTRIBUTED: {
        if (!Number.isFinite(this.maxLineWidth)) {
          applyLeftAlignment()
          break
        }
        const gap =
          geometryEntries.length > 1
            ? (this.maxLineWidth - size.x) / (geometryEntries.length - 1)
            : 0
        const translated = new Set<THREE.Object3D>()
        geometryEntries.forEach((entry, index) => {
          const dx =
            gap * index + (this._currentLeftMargin - resolvedBBox.min.x)

          entry.geometry.translate(dx, 0, 0)
          if (!translated.has(entry.owner)) {
            translateCharBoxes(entry.owner, dx)
            translated.add(entry.owner)
          }
        })
        break
      }
      default:
        break
    }
  }

  /**
   * Resolves horizontal advance for an ASCII space in the active font.
   *
   * AutoCAD uses each font's own space glyph metrics (SHX pen advance or TrueType
   * horizontal advance). A fixed fraction of text height (e.g. 50% for SHX) is only
   * a rough fallback when the font has no space definition.
   *
   * @param font Font family name.
   * @param fontSize Font size in drawing units.
   * @returns Horizontal advance width for one space character.
   */
  private calculateBlankWidthForFont(font: string, fontSize: number) {
    const spaceShape = this.fontManager.getCharShape(' ', font, fontSize)
    if (spaceShape && spaceShape.width > 0) {
      return spaceShape.width
    }
    const fontType = this.fontManager.getFontType(font)
    return fontType === 'shx' ? fontSize * 0.5 : fontSize * 0.3
  }

  /**
   * Converts pending mesh and line geometries into a styled THREE.js object.
   *
   * @param geometries Mesh (`ShapeGeometry`) primitives for the current style segment.
   * @param lineGeometries Line primitives and decorations for the current style segment.
   * @param meshCharBoxes Mesh char boxes to attach to the created object.
   * @param lineCharBoxes Line char boxes to attach to the created object.
   * @param charBoxType Char-box classification stored on the created object.
   * @returns A mesh, line segments object, or small group containing both.
   */
  private toThreeObject(
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[],
    charBoxType: CharBoxType
  ) {
    const meshGroup = new THREE.Group()

    const materialColorSettings = this.getMaterialColorSettings()
    const meshMaterial = this.styleManager.getMeshBasicMaterial(
      materialColorSettings
    )
    const lineMaterial = this.styleManager.getLineBasicMaterial(
      materialColorSettings
    )

    const shouldCollectCharBoxes = this._options.collectCharBoxes !== false

    // Mesh font (ShapeGeometry)
    const meshGeoms = geometries.filter(g => g instanceof THREE.ShapeGeometry)

    if (meshGeoms.length > 0) {
      const mergedMeshGeom =
        meshGeoms.length > 1 ? mergeGeometries(meshGeoms) : meshGeoms[0]
      const mesh = new THREE.Mesh(mergedMeshGeom, meshMaterial)
      mesh.userData.bboxIntersectionCheck = true
      mesh.userData.charBoxType = charBoxType
      if (shouldCollectCharBoxes && meshCharBoxes.length > 0) {
        mesh.userData.layout = { chars: meshCharBoxes.slice() }
      }

      meshGroup.add(mesh)
    }

    // All line-based geometries: SHX font batch + decorations + legacy line geoms
    const lineEntries: TransformedLineGeometryEntry[] = [
      ...this._lineBatchEntries,
      ...lineGeometries.map(geometry => ({
        geometry,
        matrix: _identityMatrix
      })),
      ...geometries
        .filter(g => !(g instanceof THREE.ShapeGeometry))
        .map(geometry => ({ geometry, matrix: _identityMatrix }))
    ]

    if (lineEntries.length > 0) {
      const mergedLineGeom = TextGeometryBuilder.mergeLineGeometries(lineEntries)
      const lineMesh = new THREE.LineSegments(mergedLineGeom, lineMaterial)
      lineMesh.userData.bboxIntersectionCheck = true
      lineMesh.userData.charBoxType = charBoxType
      if (shouldCollectCharBoxes && lineCharBoxes.length > 0) {
        lineMesh.userData.layout = { chars: lineCharBoxes.slice() }
      }

      meshGroup.add(lineMesh)
    }

    // Reduce hierarchy if only one child
    if (meshGroup.children.length === 1) {
      return meshGroup.children[0]
    } else {
      return meshGroup
    }
  }

  /**
   * Multiplies the active font-size scale factor and recomputes line metrics.
   *
   * @param value Relative scale multiplier (for example `0.7` for superscript).
   */
  private changeFontSizeScaleFactor(value: number) {
    this._currentContext.fontSizeScaleFactor *= value
    this.calcuateLineParams()
  }

  /**
   * Sets an absolute font height override and recomputes line metrics.
   *
   * @param value Font height in drawing units.
   */
  private changeFontHeight(value: number) {
    this.calcuateLineParams(value)
  }

  /**
   * Resolves the initial text color from entity color settings.
   *
   * @returns Base color as `0xRRGGBB`.
   */
  private resolveBaseColor(): number {
    return resolveMTextColor(this._colorSettings)
  }

  /**
   * Builds color settings for material creation from the current render context.
   *
   * @returns Color settings including the active inline color snapshot.
   */
  private getMaterialColorSettings(): ColorSettings {
    return {
      byLayerColor: this._colorSettings.byLayerColor,
      byBlockColor: this._colorSettings.byBlockColor,
      layer: this._colorSettings.layer,
      color: this._currentContext.color.copy()
    }
  }
}
