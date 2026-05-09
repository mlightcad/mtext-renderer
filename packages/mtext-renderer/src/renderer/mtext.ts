import {
  getFonts,
  MTextContext,
  MTextLineAlignment,
  MTextParagraphAlignment,
  MTextParser
} from '@mlightcad/mtext-parser'
import * as THREE from 'three'

import { FontManager } from '../font'
import { buildCharBoxesFromObject } from './charBoxUtils'
import { MTextFormatOptions, MTextProcessor } from './mtextProcessor'
import { StyleManager } from './styleManager'
import {
  CharBox,
  CharBoxType,
  ColorSettings,
  createDefaultColorSettings,
  LineLayout,
  MTextAttachmentPoint,
  MTextData,
  MTextFlowDirection,
  MTextLayout,
  Point2d,
  TextStyle
} from './types'

const tempPoint = /*@__PURE__*/ new THREE.Vector3()
const tempPoint2 = /*@__PURE__*/ new THREE.Vector3()
const tempPoint3 = /*@__PURE__*/ new THREE.Vector3()
const tempVector = /*@__PURE__*/ new THREE.Vector3()
const tempScale = /*@__PURE__*/ new THREE.Vector3()
const tempQuaternion = /*@__PURE__*/ new THREE.Quaternion()
const translateTempMatrix = /*@__PURE__*/ new THREE.Matrix4()
const tempMatrix = /*@__PURE__*/ new THREE.Matrix4()
const AxisX = /*@__PURE__*/ new THREE.Vector3(1, 0, 0)

/**
 * Represents an AutoCAD MText object in Three.js.
 * This class extends THREE.Object3D to provide MText rendering capabilities,
 * including text layout, alignment, and transformation.
 */
export class MText extends THREE.Object3D {
  /** The text style configuration for this MText object */
  private _style: TextStyle
  /** The flag to indicate whether fonts specified in style are loaded */
  private _fontsInStyleLoaded: boolean
  /** The style manager instance for handling text styles */
  private _styleManager: StyleManager
  /** The font manager instance for handling font operations */
  private _fontManager: FontManager
  /** Color settings used to decided font color */
  private _colorSettings: ColorSettings
  /** The bounding box of the entire MText object */
  private _box: THREE.Box3
  /** Lazily built layout data (line geometry + char boxes). */
  private _layoutData: MTextLayout | undefined

  /** Raw mtext data to draw on demand */
  private _mtextData: MTextData

  /**
   * Extracts all unique font names used in an MText string.
   * This function searches for font commands in the format \f{fontname}| or \f{fontname}; and returns a set of unique font names.
   * Font names are converted to lowercase to ensure case-insensitive uniqueness.
   *
   * @param mtext - The MText string to analyze for font names
   * @param removeExtension - Whether to remove font file extensions (e.g., .ttf, .shx) from font names. Defaults to false.
   * @returns A Set containing all unique font names found in the MText string, converted to lowercase
   * @example
   * ```ts
   * const mtext = "\\fArial.ttf|Hello\\fTimes New Roman.otf|World";
   * const fonts = getFonts(mtext, true);
   * // Returns: Set(2) { "arial", "times new roman" }
   * ```
   */
  static getFonts(mtext: string, removeExtension: boolean = false) {
    return getFonts(mtext, removeExtension)
  }

  /**
   * Creates a new instance of MText.
   * @param text - The MText data containing text content and properties
   * @param style - The text style configuration
   * @param styleManager - The style manager instance
   * @param fontManager - The font manager instance
   * @param colorSettings - Color settings used to decided font color
   */
  constructor(
    text: MTextData,
    style: TextStyle,
    styleManager: StyleManager,
    fontManager: FontManager,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ) {
    super()
    this._style = style
    this._styleManager = styleManager
    this._fontManager = fontManager
    this._colorSettings = {
      byLayerColor: colorSettings.byLayerColor,
      byBlockColor: colorSettings.byBlockColor,
      layer: colorSettings.layer,
      color: colorSettings.color.copy()
    }
    this._box = new THREE.Box3()
    this._layoutData = undefined

    this._mtextData = text

    this._fontsInStyleLoaded = false
  }

  /**
   * Gets the font manager instance associated with this MText object.
   * @returns The FontManager instance
   */
  get fontManager() {
    return this._fontManager
  }

  /**
   * Remove the current object from its parent and release geometry and material resource used
   * by the current object.
   */
  dispose() {
    this.disposeThreeObject(this)
  }

  /**
   * Draw the MText object. This method loads required fonts on demand and builds the object graph.
   */
  async asyncDraw() {
    // Determine fonts used in the mtext string (without extensions)
    const fonts = Array.from(MText.getFonts(this._mtextData.text || '', true))

    // Determine fonts used in font style
    if (!this._fontsInStyleLoaded) {
      if (this._style.font) {
        const fontName = this.getFontName(this._style.font)
        if (fontName) fonts.push(fontName)
      }
      if (this._style.bigFont) {
        const fontName = this.getFontName(this._style.bigFont)
        if (fontName) fonts.push(fontName)
      }
      if (this._style.extendedFont) {
        const fontName = this.getFontName(this._style.extendedFont)
        if (fontName) fonts.push(fontName)
      }
    }
    if (fonts.length > 0) {
      await this._fontManager.loadFontsByNames(fonts)
      this._fontsInStyleLoaded = true
    }

    this.syncDraw()
  }

  /**
   * Draw the MText object. This method assumes that fonts needed are loaded. If font needed
   * not found, the default font will be used.
   */
  syncDraw() {
    const obj = this.loadMText(this._mtextData, this._style)
    if (obj) {
      this._layoutData = undefined
      this._box.makeEmpty()
      const lineBounds = {
        hasLine: false,
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
      }
      this.updateBoxFromObject(obj, lineBounds)
      if (lineBounds.hasLine) {
        if (this.box.isEmpty()) {
          this.box.min.set(lineBounds.minX, lineBounds.minY, lineBounds.minZ)
          this.box.max.set(lineBounds.maxX, lineBounds.maxY, lineBounds.maxZ)
        } else {
          this.box.min.y = Math.min(this.box.min.y, lineBounds.minY)
          this.box.max.y = Math.max(this.box.max.y, lineBounds.maxY)
        }
      }
      this.add(obj)
    }
  }

  /**
   * Gets the style manager instance associated with this MText object.
   * @returns The StyleManager instance
   */
  get styleManager() {
    return this._styleManager
  }

  /**
   * Gets the text style configuration for this MText object.
   * @returns The TextStyle configuration
   */
  get textStyle() {
    return this._style
  }

  /**
   * Gets or sets the bounding box of this MText object.
   * The bounding box is calculated without considering the transformation matrix.
   * To get the bounding box with transformation, call `applyMatrix4` on this box.
   */
  get box() {
    return this._box
  }
  set box(box: THREE.Box3) {
    this._box.copy(box)
  }

  /** Creates text layout data for cursor/picking/debug usage on demand. */
  createLayoutData(): MTextLayout {
    if (this._layoutData) {
      return this._layoutData
    }

    const layout: MTextLayout = { lines: [], chars: [] }
    this.updateWorldMatrix(true, true)
    this.getLayout(this, layout.chars, layout.lines)
    this._layoutData = layout
    return layout
  }

  /**
   * Calculates intersections between a ray and this MText object.
   * Overrides the base THREE.Object3D raycast method to use the text's bounding boxes.
   * @param raycaster - The raycaster to use for intersection testing
   * @param intersects - Array to store intersection results
   */
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const layout = this.createLayoutData()
    layout.chars.forEach(entry => {
      if (entry.box && raycaster.ray.intersectBox(entry.box, tempPoint)) {
        const distance = raycaster.ray.origin.distanceTo(tempPoint)
        intersects.push({
          distance: distance,
          point: tempPoint.clone(),
          object: this,
          face: null,
          faceIndex: undefined,
          uv: undefined
        })
      }
    })
  }

  /**
   * Loads and processes MText data to create a Three.js object.
   * @param mtextData - The MText data to process
   * @param style - The text style configuration
   * @returns The created Three.js object, or undefined if creation fails
   */
  private loadMText(mtextData: MTextData, style: TextStyle) {
    const { object, height: layoutHeight } = this.createMTextGroup(
      mtextData,
      style
    )
    if (!object) {
      return undefined
    }

    object.matrix.decompose(tempVector, tempQuaternion, tempScale)
    if (mtextData.position) {
      tempVector.x += mtextData.position.x
      tempVector.y += mtextData.position.y
      object.matrix.compose(tempVector, tempQuaternion, tempScale)
    }

    // When the caller does not pre-declare the text width (e.g. AcDbText
    // and AcDbAttribute, which let the renderer's own font metrics drive
    // layout), `mtextData.width` is `Infinity`. Using that value verbatim
    // in `calculateAnchorPoint` would yield NaN for any centered/right
    // attachment. Measure the bbox of the just-built object so the anchor
    // is computed from the *real* rendered glyph extent — independent of
    // font, kerning, or character composition.
    let width = mtextData.width
    let height = layoutHeight
    object.updateWorldMatrix(true, true)
    const bbox = new THREE.Box3().setFromObject(object)
    if (!bbox.isEmpty()) {
      const measuredHeight = bbox.max.y - bbox.min.y
      if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
        height = measuredHeight
      }
    }
    if (!Number.isFinite(width)) {
      const measured = bbox.max.x - bbox.min.x
      width = Number.isFinite(measured) && measured > 0 ? measured : 0
    }
    const anchorPoint = this.calculateAnchorPoint(
      width,
      height,
      mtextData.attachmentPoint,
      mtextData.drawingDirection
    )

    const translateCharBoxEntries = (entries: CharBox[] | undefined) => {
      if (!entries || entries.length === 0) return
      const translation = new THREE.Vector3(anchorPoint.x, anchorPoint.y, 0)
      const translateEntry = (entry: CharBox) => {
        entry.box?.translate(translation)
        if (entry.children && entry.children.length > 0) {
          entry.children.forEach(translateEntry)
        }
      }
      entries.forEach(translateEntry)
    }

    const translateLineLayouts = (lines: LineLayout[] | undefined) => {
      if (!lines || lines.length === 0) return
      lines.forEach(line => {
        line.y += anchorPoint.y
      })
    }

    object.traverse(obj => {
      if ('geometry' in obj) {
        const geometry = obj.geometry as THREE.BufferGeometry
        geometry.translate(anchorPoint.x, anchorPoint.y, 0)
      } else {
        // Char-box-only placeholder objects (e.g., trailing empty lines)
        // need the same anchor translation as geometry-bearing objects.
        translateCharBoxEntries(
          obj.userData?.layout?.chars as CharBox[] | undefined
        )
      }
      translateLineLayouts(
        obj.userData?.lineLayouts as LineLayout[] | undefined
      )
      obj.layers.enableAll()
    })

    let rotateAngle = mtextData.rotation || 0
    if (mtextData.directionVector) {
      const dv = mtextData.directionVector
      const vec = new THREE.Vector3(dv.x, dv.y, dv.z)
      const v = vec.clone().cross(AxisX)
      const angle = AxisX.angleTo(vec)
      rotateAngle = v.z > 0 ? -angle : angle
    }

    object.matrix.compose(tempVector, tempQuaternion, tempScale)
    const translate = mtextData.position
      ? tempVector.clone().sub(mtextData.position)
      : tempVector
    translateTempMatrix.makeTranslation(-translate.x, -translate.y, 0)
    tempMatrix.makeRotationZ(rotateAngle)
    object.matrix.multiply(translateTempMatrix)
    object.matrix.multiply(tempMatrix)
    object.matrix.multiply(translateTempMatrix.invert())
    object.matrix.decompose(object.position, object.quaternion, object.scale)
    return object
  }

  /**
   * Creates a group of text elements from MText data.
   * @param mtextData - The MText data to process
   * @param style - The text style configuration
   * @returns An object containing the created Three.js object and its height
   */
  private createMTextGroup(mtextData: MTextData, style: TextStyle) {
    if (style && style.font && style.font.endsWith('.shx')) {
      const fontFileAndStyleName = `${style.font}_${style.name}`
      if (!this.styleManager.unsupportedTextStyles[fontFileAndStyleName]) {
        this.styleManager.unsupportedTextStyles[fontFileAndStyleName] = 0
      }
      this.styleManager.unsupportedTextStyles[fontFileAndStyleName]++
    }

    const maxWidth = mtextData.width || 0
    // Internal paragraph alignment: only meaningful for multi-line MText
    // with a declared FINITE `width`. For unconstrained text (Infinity,
    // used by AcDbText/AcDbAttribute), forcing LEFT avoids generating
    // `Infinity - size.x` in the CENTER/RIGHT/DISTRIBUTED branches of the
    // layout pass — which translates to `geometry.translate(Infinity,…)`
    // and contaminates every vertex with NaN.
    const widthIsFinite = Number.isFinite(maxWidth) && maxWidth > 0
    let horizontalAlignment = MTextParagraphAlignment.LEFT
    if (widthIsFinite && mtextData.attachmentPoint) {
      // Left column: TopLeft, MiddleLeft, BottomLeft, BaselineLeft
      if (
        [
          MTextAttachmentPoint.TopLeft,
          MTextAttachmentPoint.MiddleLeft,
          MTextAttachmentPoint.BottomLeft,
          MTextAttachmentPoint.BaselineLeft
        ].includes(mtextData.attachmentPoint)
      ) {
        horizontalAlignment = MTextParagraphAlignment.LEFT
      } else if (
        [
          MTextAttachmentPoint.TopCenter,
          MTextAttachmentPoint.MiddleCenter,
          MTextAttachmentPoint.BottomCenter,
          MTextAttachmentPoint.BaselineCenter
        ].includes(mtextData.attachmentPoint)
      ) {
        horizontalAlignment = MTextParagraphAlignment.CENTER
      } else if (
        [
          MTextAttachmentPoint.TopRight,
          MTextAttachmentPoint.MiddleRight,
          MTextAttachmentPoint.BottomRight,
          MTextAttachmentPoint.BaselineRight
        ].includes(mtextData.attachmentPoint)
      ) {
        horizontalAlignment = MTextParagraphAlignment.RIGHT
      }
    }

    let verticalAlignment = MTextLineAlignment.BOTTOM
    if (mtextData.attachmentPoint) {
      if (
        [
          MTextAttachmentPoint.TopLeft,
          MTextAttachmentPoint.TopCenter,
          MTextAttachmentPoint.TopRight
        ].includes(mtextData.attachmentPoint)
      ) {
        verticalAlignment = MTextLineAlignment.TOP
      } else if (
        [
          MTextAttachmentPoint.MiddleLeft,
          MTextAttachmentPoint.MiddleCenter,
          MTextAttachmentPoint.MiddleRight
        ].includes(mtextData.attachmentPoint)
      ) {
        verticalAlignment = MTextLineAlignment.MIDDLE
      } else {
        // Bottom* and Baseline* both map to BOTTOM internally — the
        // baseline-vs-bottom distinction is only meaningful for the
        // anchor offset, not the line layout pass.
        verticalAlignment = MTextLineAlignment.BOTTOM
      }
    }

    const defaultFontSize = mtextData.height || style.fixedTextHeight || 0
    const defaultWidthFactor = mtextData.widthFactor || style.widthFactor || 1.0
    const defaultLineSpaceFactor = mtextData.lineSpaceFactor || 0.3
    const flowDirection =
      mtextData.drawingDirection ?? MTextFlowDirection.LEFT_TO_RIGHT
    const textLineFormatOptions: MTextFormatOptions = {
      fontSize: defaultFontSize,
      widthFactor: defaultWidthFactor,
      lineSpaceFactor: defaultLineSpaceFactor,
      horizontalAlignment: horizontalAlignment,
      maxWidth: maxWidth,
      flowDirection: flowDirection,
      byBlockColor: this._colorSettings.byBlockColor,
      byLayerColor: this._colorSettings.byLayerColor,
      removeFontExtension: true,
      collectCharBoxes: mtextData.collectCharBoxes ?? true
    }

    const context = new MTextContext()
    context.fontFace.family = style.font
    context.capHeight = {
      value: defaultFontSize,
      isRelative: false
    }
    // Absolute value (\Wvalue;)
    // – Sets the text width factor directly to the specified value, overriding the current
    // width factor from the text style or previous formatting.
    // Relative value (\Wvaluex;)
    // – Multiplies the current width factor by the specified value, scaling it relative to
    // the existing width setting.
    context.widthFactor = {
      value: defaultWidthFactor,
      isRelative: false
    }
    context.align = verticalAlignment
    context.paragraph.align = horizontalAlignment
    const textLine = new MTextProcessor(
      style,
      this._colorSettings,
      this.styleManager,
      this.fontManager,
      textLineFormatOptions
    )
    const parser = new MTextParser(mtextData.text, context, {
      resetParagraphParameters: true,
      yieldPropertyCommands: true
    })
    const tokens = parser.parse()
    const object = textLine.processText(tokens)
    return {
      object: object,
      height: textLine.totalHeight
    }
  }

  /**
   * Calculates the anchor point for text positioning based on alignment and flow direction.
   * @param width - The width of the text
   * @param height - The height of the text
   * @param attachmentPoint - The attachment point for text alignment
   * @param flowDirection - The text flow direction
   * @returns The calculated anchor point coordinates
   */
  private calculateAnchorPoint(
    width: number,
    height: number,
    attachmentPoint?: MTextAttachmentPoint,
    flowDirection?: MTextFlowDirection
  ): Point2d {
    let anchorX = 0,
      anchorY = 0
    switch (attachmentPoint) {
      case undefined:
      case MTextAttachmentPoint.TopLeft:
        anchorX = 0
        anchorY = 0
        break
      case MTextAttachmentPoint.TopCenter:
        anchorX -= width / 2
        anchorY = 0
        break
      case MTextAttachmentPoint.TopRight:
        anchorX -= width
        anchorY = 0
        break
      case MTextAttachmentPoint.MiddleLeft:
        anchorX = 0
        anchorY += height / 2
        break
      case MTextAttachmentPoint.MiddleCenter:
        anchorX -= width / 2
        anchorY += height / 2
        break
      case MTextAttachmentPoint.MiddleRight:
        anchorX -= width
        anchorY += height / 2
        break
      case MTextAttachmentPoint.BottomLeft:
      case MTextAttachmentPoint.BaselineLeft:
        // Baseline ≈ Bottom for SHX/single-line text where descender is
        // negligible. Treating them identically keeps the public API
        // expressive without requiring per-font descender metrics.
        anchorX = 0
        anchorY += height
        break
      case MTextAttachmentPoint.BottomCenter:
      case MTextAttachmentPoint.BaselineCenter:
        anchorX -= width / 2
        anchorY += height
        break
      case MTextAttachmentPoint.BottomRight:
      case MTextAttachmentPoint.BaselineRight:
        anchorX -= width
        anchorY += height
        break
    }
    if (flowDirection == MTextFlowDirection.BOTTOM_TO_TOP) {
      anchorY -= height
    }
    return { x: anchorX, y: anchorY }
  }

  /**
   * Recursively calculates bounding boxes for an object and its children.
   * @param object - The Three.js object to process
   * @param boxes - Array to store the calculated bounding boxes
   */
  private getLayout(
    object: THREE.Object3D,
    chars: CharBox[],
    lines: LineLayout[]
  ) {
    object.updateWorldMatrix(false, false)
    const objectCharBoxes = object.userData?.layout?.chars as
      | CharBox[]
      | undefined
    const objectLineLayouts = object.userData?.lineLayouts as
      | LineLayout[]
      | undefined
    if (objectLineLayouts && objectLineLayouts.length > 0) {
      objectLineLayouts.forEach(line => {
        tempPoint.set(0, line.y, 0).applyMatrix4(object.matrixWorld)
        tempPoint2
          .set(0, line.y - line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        tempPoint3
          .set(0, line.y + line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        lines.push({
          y: tempPoint.y,
          height: Math.abs(tempPoint3.y - tempPoint2.y),
          breakIndex: line.breakIndex
        })
      })
    }

    if (objectCharBoxes && objectCharBoxes.length > 0) {
      const charBoxType = object.userData?.charBoxType as
        | CharBoxType
        | undefined
      const entries = buildCharBoxesFromObject(
        objectCharBoxes,
        object.matrixWorld,
        charBoxType
      )
      chars.push(...entries)
      return
    }

    if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
      const geometry = object.geometry
      if (!geometry.userData?.isDecoration) {
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox()
        }
        const box = new THREE.Box3().copy(geometry.boundingBox)
        box.applyMatrix4(object.matrixWorld)
        chars.push({
          type: CharBoxType.CHAR,
          box,
          char: '',
          children: []
        })
      }
    }

    const children = object.children
    for (let i = 0, l = children.length; i < l; i++) {
      this.getLayout(children[i], chars, lines)
    }
  }

  private updateBoxFromObject(
    object: THREE.Object3D,
    lineBounds: {
      hasLine: boolean
      minX: number
      maxX: number
      minY: number
      maxY: number
      minZ: number
      maxZ: number
    }
  ) {
    object.updateWorldMatrix(false, false)

    const objectLineLayouts = object.userData?.lineLayouts as
      | LineLayout[]
      | undefined
    if (objectLineLayouts && objectLineLayouts.length > 0) {
      objectLineLayouts.forEach(line => {
        tempPoint2
          .set(0, line.y - line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        tempPoint3
          .set(0, line.y + line.height / 2, 0)
          .applyMatrix4(object.matrixWorld)
        lineBounds.hasLine = true
        lineBounds.minX = Math.min(lineBounds.minX, tempPoint2.x, tempPoint3.x)
        lineBounds.maxX = Math.max(lineBounds.maxX, tempPoint2.x, tempPoint3.x)
        lineBounds.minY = Math.min(lineBounds.minY, tempPoint2.y, tempPoint3.y)
        lineBounds.maxY = Math.max(lineBounds.maxY, tempPoint2.y, tempPoint3.y)
        lineBounds.minZ = Math.min(lineBounds.minZ, tempPoint2.z, tempPoint3.z)
        lineBounds.maxZ = Math.max(lineBounds.maxZ, tempPoint2.z, tempPoint3.z)
      })
    }

    const objectCharBoxes = object.userData?.layout?.chars as
      | CharBox[]
      | undefined
    if (objectCharBoxes && objectCharBoxes.length > 0) {
      const charBoxType = object.userData?.charBoxType as
        | CharBoxType
        | undefined
      const entries = buildCharBoxesFromObject(
        objectCharBoxes,
        object.matrixWorld,
        charBoxType
      )
      entries.forEach(entry => {
        if (entry.box) this.box.union(entry.box)
      })
      return
    }

    if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
      const geometry = object.geometry
      if (!geometry.userData?.isDecoration) {
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox()
        }
        const box = new THREE.Box3().copy(geometry.boundingBox)
        box.applyMatrix4(object.matrixWorld)
        this.box.union(box)
      }
    }

    const children = object.children
    for (let i = 0, l = children.length; i < l; i++) {
      this.updateBoxFromObject(children[i], lineBounds)
    }
  }

  /**
   * Remove the specified object from its parent and release geometry and material resource used
   * by the object.
   * @param obj - Input object to dispose
   */
  private disposeThreeObject(obj: THREE.Object3D) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obj.traverse((child: any) => {
      if (child.geometry && typeof child.geometry.dispose === 'function') {
        try {
          child.geometry.dispose()
        } catch {
          /* ignore */
        }
      }
      if (child.material) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const disposeMat = (mat: any) => {
          if (mat && typeof mat.dispose === 'function') {
            try {
              mat.dispose()
            } catch {
              /* ignore */
            }
          }
        }
        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMat)
        } else {
          disposeMat(child.material)
        }
      }
    })
  }
  private getFontName(fontFileName: string) {
    if (fontFileName) {
      const lastDotIndex = fontFileName.lastIndexOf('.')
      if (lastDotIndex >= 0) {
        return fontFileName.substring(0, lastDotIndex).toLowerCase()
      } else {
        return fontFileName.toLowerCase()
      }
    }
  }
}
