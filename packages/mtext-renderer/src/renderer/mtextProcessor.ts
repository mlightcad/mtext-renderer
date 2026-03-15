import {
  ChangedProperties,
  MTextContext,
  MTextParagraphAlignment,
  MTextToken,
  TokenType
} from '@mlightcad/mtext-parser'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { getColorByIndex } from '../common'
import { FontManager } from '../font'
import { resolveMTextColor } from './colorUtils'
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

const tempVector = /*@__PURE__*/ new THREE.Vector3()

// The property palette of mtext can display line spacing. This magic number is inferred from value
// displayed in property palette of mtext.
const LINE_SPACING_SCALE_FACTOR = 1.666666
// Vertical compensation needed after switching normal glyph placement from
// top-anchored to baseline-anchored coordinates.
const STACK_VERTICAL_SHIFT_FACTOR = 0.3
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
 * This class represents lines of texts.
 */
export class MTextProcessor {
  private _style: TextStyle
  private _colorSettings: ColorSettings
  private _styleManager: StyleManager
  private _fontManager: FontManager
  private _options: MTextFormatOptions
  private _totalHeight: number
  private _hOffset: number
  private _vOffset: number
  private _lineCount: number
  private _currentLineObjects: THREE.Object3D[]
  private _contextStack: RenderContext[] = []
  private _currentContext: RenderContext
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
  private _lastCharBoxTarget: 'mesh' | 'line' | undefined
  private _lineHasRenderableChar: boolean
  private _pendingEmptyLineFontSizeAdjust?: number
  private _lineLayouts: LineLayout[]
  private _lineBreakIndices: number[]
  private _processedCharCount: number
  // Paragraph properties
  private _currentIndent: number = 0
  private _currentLeftMargin: number = 0
  private _currentRightMargin: number = 0

  /**
   * Construct one instance of this class and initialize some properties with default values.
   * @param style Input text style
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

  get fontManager() {
    return this._fontManager
  }

  get styleManager() {
    return this._styleManager
  }

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

  /**
   * All of THREE.js objects in current line. It contains objects in all of sections of this line.
   */
  get currentLineObjects() {
    return this._currentLineObjects
  }

  get lineLayouts() {
    return this._lineLayouts
  }

  /**
   * The horizental offset of current character in this line
   */
  get hOffset() {
    return this._hOffset
  }
  set hOffset(value: number) {
    this._hOffset = value
  }

  /**
   * The vertical offset of current character in this line
   */
  get vOffset() {
    return this._vOffset
  }
  set vOffset(value: number) {
    this._vOffset = value
  }

  get currentIndent() {
    return this._currentIndent
  }

  get currentLeftMargin() {
    return this._currentLeftMargin
  }

  get currentRightMargin() {
    return this._currentRightMargin
  }

  get maxLineWidth() {
    // The actual usable width for text in a line, considering margins
    return this.maxWidth - this._currentLeftMargin - this._currentRightMargin
  }

  /**
   * Process text format information
   * @param item Input mtext inline codes
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
   */
  private applyPropertyChanges(changes: ChangedProperties['changes']) {
    this.applyFontFaceChange(changes.fontFace)
    this.applyColorCommandChanges(changes)
    this.applyWidthFactorChange(changes.widthFactor)
    this.applyCapHeightChange(changes.capHeight)
    this.applyCharTrackingChange(changes.charTrackingFactor)
    this.applyParagraphChange(changes.paragraph)

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
        value: widthFactor.value * 0.93,
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
   * Apply paragraph-level changes such as alignment and margins.
   * @param paragraph Paragraph change data.
   */
  private applyParagraphChange(
    paragraph: ChangedProperties['changes']['paragraph']
  ) {
    if (!paragraph) return
    if (paragraph.align) {
      this._currentHorizontalAlignment = paragraph.align
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
   * Render the specified texts
   * @param item Input texts to render
   */
  processText(tokens: Generator<MTextToken>) {
    this._lastCharBoxTarget = undefined
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

    if (geometries.length > 0 || lineGeometries.length > 0) {
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
    this.recordCurrentLineLayout()
    group.userData.lineLayouts = this._lineLayouts.map((line, index) => ({
      ...line,
      breakIndex:
        index < this._lineLayouts.length - 1
          ? this._lineBreakIndices[index]
          : undefined
    }))
    return group
  }

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

    if (geometries.length > 0 || lineGeometries.length > 0) {
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

  private processWord(
    word: string,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ) {
    // --- Word-level wrapping logic ---
    // 1. Measure word width
    let wordWidth = 0
    for (let i = 0; i < word.length; i++) {
      const shape = this.getCharShape(word[i])
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
        wordWidth += this._currentContext.blankWidth
      }
    }
    // 2. If word would overflow, start a new line first (no indent for wrapped lines)
    if (this.hOffset + wordWidth > (this.maxLineWidth || Infinity)) {
      // SPECIAL CASE:
      // If this is the first word of the current paragraph (no rendered objects yet), do not wrap.
      if (this._vOffset <= 0 && this._currentLineObjects.length <= 0) {
        // Do nothing
      } else {
        this.recordVisualLineBreak(meshCharBoxes, lineCharBoxes)
        this.advanceToNextLine(false) // Start a new line for wrapped words
      }
    }
    // 3. Render the word character by character
    for (let i = 0; i < word.length; i++) {
      this.processChar(
        word[i],
        geometries,
        lineGeometries,
        meshCharBoxes,
        lineCharBoxes
      )
    }
  }

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
    const currentFontSize = this._currentContext.fontSize
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
      // Scale down font size to 70% for subscript and superscript
      this._currentContext.fontSizeScaleFactor =
        currentFontSizeScaleFactor * 0.7
      this.calcuateLineParams()

      // Superscript case
      if (numerator && !denominator) {
        const superscriptGeometries: THREE.BufferGeometry[] = []
        const superscriptLineGeometries: THREE.BufferGeometry[] = []
        const superscriptMeshCharBoxes: CharBox[] = []
        const superscriptLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset
        this._vOffset = this.convertTopAlignedVOffset(
          currentVOffset + currentFontSize * 0.1,
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
      }

      // Subscript case
      else if (!numerator && denominator) {
        const subscriptGeometries: THREE.BufferGeometry[] = []
        const subscriptLineGeometries: THREE.BufferGeometry[] = []
        const subscriptMeshCharBoxes: CharBox[] = []
        const subscriptLineCharBoxes: CharBox[] = []

        this._hOffset = currentHOffset
        this._vOffset = this.convertTopAlignedVOffset(
          currentVOffset - currentFontSize * 0.6,
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
      }

      // Restore original font size
      this._currentContext.fontSizeScaleFactor = currentFontSizeScaleFactor
      this.calcuateLineParams()
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
        lineGeometry.setIndex(null)
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

  private processBlank(meshCharBoxes: CharBox[], lineCharBoxes: CharBox[]) {
    if (this._options.collectCharBoxes !== false) {
      const charX = this._hOffset
      const charY =
        this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP
          ? this._vOffset
          : this._vOffset - this.defaultFontSize
      const box = new THREE.Box3(
        new THREE.Vector3(charX, charY, 0),
        new THREE.Vector3(
          charX + this._currentContext.blankWidth,
          charY + this.currentFontSize,
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
    this._hOffset += this._currentContext.blankWidth
  }

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

  private processChar(
    char: string,
    geometries: THREE.BufferGeometry[],
    lineGeometries: THREE.BufferGeometry[],
    meshCharBoxes: CharBox[],
    lineCharBoxes: CharBox[]
  ): void {
    const shape = this.getCharShape(char)
    if (!shape) {
      this.processBlank(meshCharBoxes, lineCharBoxes)
      return
    }

    if (!this._lineHasRenderableChar) {
      this.applyPendingEmptyLineYAdjust()
    }

    const geometry = shape.toGeometry()
    geometry.scale(this.currentWidthFactor, 1, 1)

    // Apply oblique/skew transformation if needed (oblique or italic)
    let obliqueAngle = this._currentContext.oblique
    if (this._currentContext.italic) {
      obliqueAngle += 15 // Simulate italic with a 15 degree skew
    }
    if (obliqueAngle) {
      const angleRad = (obliqueAngle * Math.PI) / 180
      const skewMatrix = new THREE.Matrix4()
      skewMatrix.set(
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
      geometry.applyMatrix4(skewMatrix)
    }

    // Simulate bold for mesh fonts by stroking the geometry
    const fontType = this.fontManager.getFontType(this.currentFont)
    if (this._currentContext.bold && fontType === 'mesh') {
      // Expand geometry slightly to simulate bold
      // This is a simple approach: scale up slightly from the center
      const boldScale = 1.06 // 6% wider
      geometry.scale(boldScale, boldScale, 1)
    }

    if (this.hOffset > (this.maxLineWidth || Infinity)) {
      this.recordVisualLineBreak(meshCharBoxes, lineCharBoxes)
      this.advanceToNextLine(false)
    }

    const charX = this.hOffset
    const charY =
      this.flowDirection == MTextFlowDirection.BOTTOM_TO_TOP
        ? this.vOffset
        : this.vOffset - this.defaultFontSize
    const charWidth = shape.width * this.currentWidthFactor
    const charHeight = this.currentFontSize

    geometry.translate(charX, charY, 0)

    if (
      this.currentHorizontalAlignment == MTextParagraphAlignment.DISTRIBUTED
    ) {
      this._hOffset += shape.width * this.currentWidthFactor
    } else {
      this._hOffset +=
        shape.width * this.currentWordSpace * this.currentWidthFactor
    }
    geometries.push(geometry)
    this._lineHasRenderableChar = true

    if (this._options.collectCharBoxes !== false) {
      geometry.userData.char = char
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox()
      }
      const box = new THREE.Box3().copy(geometry.boundingBox!)
      if (geometry instanceof THREE.ShapeGeometry) {
        this._lastCharBoxTarget = 'mesh'
        meshCharBoxes.push({
          type: CharBoxType.CHAR,
          box,
          char,
          children: []
        })
      } else {
        this._lastCharBoxTarget = 'line'
        lineCharBoxes.push({
          type: CharBoxType.CHAR,
          box,
          char,
          children: []
        })
      }
    }

    // Underline, overline, strikeThrough
    const lineOffset = charHeight * 0.05
    const lineZ = 0.001
    if (this._currentContext.underline) {
      const underlineGeom = new THREE.BufferGeometry()
      const underlineY = charY - lineOffset
      underlineGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([
            charX,
            underlineY,
            lineZ,
            charX + charWidth,
            underlineY,
            lineZ
          ]),
          3
        )
      )
      underlineGeom.setIndex(null)
      underlineGeom.userData = { isDecoration: true }
      lineGeometries.push(underlineGeom)
    }

    if (this._currentContext.overline) {
      const overlineGeom = new THREE.BufferGeometry()
      const overlineY = charY + charHeight + lineOffset
      overlineGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([
            charX,
            overlineY,
            lineZ,
            charX + charWidth,
            overlineY,
            lineZ
          ]),
          3
        )
      )
      overlineGeom.setIndex(null)
      overlineGeom.userData = { isDecoration: true }
      lineGeometries.push(overlineGeom)
    }

    if (this._currentContext.strikeThrough) {
      const strikeGeom = new THREE.BufferGeometry()
      const strikeY = charY + charHeight / 2 - charHeight * 0.2
      strikeGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array([
            charX,
            strikeY,
            lineZ,
            charX + charWidth,
            strikeY,
            lineZ
          ]),
          3
        )
      )
      strikeGeom.setIndex(null)
      strikeGeom.userData = { isDecoration: true }
      lineGeometries.push(strikeGeom)
    }
  }

  private processLastLine() {
    this.processAlignment()
  }

  private initLineParams() {
    this.calcuateLineParams()
  }

  private changeFont(fontName: string) {
    let processedFontName = fontName
    if (this._options.removeFontExtension) {
      processedFontName = fontName.replace(/\.(ttf|otf|woff|shx)$/, '')
    }
    this._currentContext.fontFace.family =
      this.fontManager.findAndReplaceFont(processedFontName)
    this._currentContext.blankWidth = this.calculateBlankWidthForFont(
      this._currentContext.fontFace.family,
      this._currentContext.fontSize
    )
    this.calcuateLineParams()
  }

  /**
   * Calcuate font size, line space, line height and other parameters.
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
   * Get text shape of the specified character
   * @param char Input one character
   * @returns Return the text shape of the specified character
   */
  private getCharShape(char: string) {
    let shape = this.fontManager.getCharShape(
      char,
      this.currentFont,
      this.currentFontSize
    )
    if (this.textStyle.bigFont && !shape) {
      shape = this.fontManager.getCharShape(
        char,
        this.textStyle.bigFont,
        this.currentFontSize
      )
    }
    if (!shape) {
      // When the text cannot be found in the font file, all font files are searched until the text is found.
      shape = this.fontManager.getCharShape(char, '', this.currentFontSize)
    }
    if (!shape) {
      shape = this.fontManager.getNotFoundTextShape(this.currentFontSize)
    }

    // Store the maximum font size in current line
    if (this.currentFontSize > this._maxFontSize) {
      this._maxFontSize = this.currentFontSize
    }
    return shape
  }

  private advanceToNextLine(collectBreakIndex = true) {
    if (collectBreakIndex) {
      this.recordVisualLineBreak()
    }
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
   * Apply translation on the specified buffer geometries according to text alignment setting
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

    switch (this.currentHorizontalAlignment) {
      case MTextParagraphAlignment.LEFT: {
        const dx = this._currentLeftMargin - resolvedBBox.min.x

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
      case MTextParagraphAlignment.CENTER: {
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
   * In AutoCAD, the width of a regular space character (ASCII 32, the space key on the keyboard) in MText
   * depends on the current font and text height, and is not a fixed value.
   * Specifically:
   * - Space width ≈ Text height × space width ratio defined by the font
   * - For common TrueType fonts (like Arial), the space width is typically about 1/4 to 1/3 of the text height.
   * For example, if the text height is 10 (units), the space width would be approximately 2.5 to 3.3 units.
   * - For SHX fonts (AutoCAD's built-in vector fonts, such as txt.shx), the space width is often half the text height.
   * So if the text height is 10, the space width is typically 5 units.
   */
  private calculateBlankWidthForFont(font: string, fontSize: number) {
    const fontType = this.fontManager.getFontType(font)
    return fontType === 'shx' ? fontSize * 0.5 : fontSize * 0.3
  }

  /**
   * Convert the text shape geometries to three.js object
   * @param geometries Input text shape geometries
   * @returns Return three.js object created from the specified text shape geometries
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

    // All line-based geometries: SHX font + underline/overline/strikeThrough
    const allLineGeoms = [
      ...lineGeometries,
      ...geometries.filter(g => !(g instanceof THREE.ShapeGeometry))
    ]
    if (allLineGeoms.length > 0) {
      const mergedLineGeom =
        allLineGeoms.length > 1
          ? mergeGeometries(allLineGeoms)
          : allLineGeoms[0]
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

  private changeFontSizeScaleFactor(value: number) {
    this._currentContext.fontSizeScaleFactor *= value
    this.calcuateLineParams()
  }

  private changeFontHeight(value: number) {
    this.calcuateLineParams(value)
  }

  private resolveBaseColor(): number {
    return resolveMTextColor(this._colorSettings)
  }

  private getMaterialColorSettings(): ColorSettings {
    return {
      byLayerColor: this._colorSettings.byLayerColor,
      byBlockColor: this._colorSettings.byBlockColor,
      layer: this._colorSettings.layer,
      color: this._currentContext.color.copy()
    }
  }
}
