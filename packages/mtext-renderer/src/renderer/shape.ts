import * as THREE from 'three'

import { FontManager } from '../font'
import { MText } from './mtext'
import { StyleManager } from './styleManager'
import {
  ColorSettings,
  createDefaultColorSettings,
  MTextFlowDirection,
  MTextLayout,
  ShapeData,
  TextStyle
} from './types'

/**
 * Represents one AutoCAD SHAPE entity in Three.js.
 */
export class Shape extends THREE.Object3D {
  private _shapeData: ShapeData
  private _style: TextStyle
  private _fontsInStyleLoaded: boolean
  private _styleManager: StyleManager
  private _fontManager: FontManager
  private _colorSettings: ColorSettings
  private _box: THREE.Box3

  constructor(
    shapeData: ShapeData,
    style: TextStyle,
    styleManager: StyleManager,
    fontManager: FontManager,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ) {
    super()
    this._shapeData = shapeData
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
    this._fontsInStyleLoaded = false
  }

  get box() {
    return this._box
  }

  get styleManager() {
    return this._styleManager
  }

  get textStyle() {
    return this._style
  }

  createLayoutData(): MTextLayout {
    return { lines: [], chars: [] }
  }

  async asyncDraw() {
    const fonts: string[] = []
    if (!this._fontsInStyleLoaded) {
      for (const key of ['font', 'bigFont', 'extendedFont'] as const) {
        const fontName = this.getFontName(this._style[key])
        if (fontName) fonts.push(fontName)
      }
    }
    if (fonts.length > 0) {
      await this._fontManager.loadFontsByNames(fonts)
      this._fontsInStyleLoaded = true
    }
    this.syncDraw()
  }

  syncDraw() {
    const builder = new MText(
      this.createPlacementData(),
      this._style,
      this._styleManager,
      this._fontManager,
      this._colorSettings
    )
    const obj = builder.loadShape(this._shapeData, this._style)
    super.clear()
    if (!obj) {
      this._box.makeEmpty()
      return
    }

    this.add(obj)
    this._box.setFromObject(obj)
  }

  private createPlacementData() {
    return {
      text: '',
      height: this._shapeData.size,
      width: Infinity,
      widthFactor:
        this._shapeData.widthFactor ?? this._style.widthFactor ?? 1,
      position: this._shapeData.position,
      rotation: this._shapeData.rotation,
      directionVector: this._shapeData.directionVector,
      drawingDirection: MTextFlowDirection.BOTTOM_TO_TOP,
      collectCharBoxes: false
    }
  }

  private getFontName(font?: string) {
    if (!font) return undefined
    const normalized = font.trim().toLowerCase()
    if (!normalized) return undefined
    return normalized.endsWith('.shx') ? normalized.slice(0, -4) : normalized
  }
}
