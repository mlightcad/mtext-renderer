import { FontManager } from '../font'
import {
  collectIsolateMemoryStats,
  type IsolateMemoryStats
} from '../memory'
import { DefaultStyleManager } from '../renderer/defaultStyleManager'
import { MText } from '../renderer/mtext'
import { Shape } from '../renderer/shape'
import { StyleManager } from '../renderer/styleManager'
import {
  ColorSettings,
  createDefaultColorSettings,
  MTextData,
  ShapeData,
  TextStyle
} from '../renderer/types'
import { MTextBaseRenderer, MTextObject } from './baseRenderer'

/**
 * Main thread renderer for MText objects
 * This provides the same interface as the worker but runs in the main thread
 */
export class MainThreadRenderer implements MTextBaseRenderer {
  private fontManager: FontManager
  private defaultStyleManager: StyleManager
  private isInitialized: boolean

  constructor() {
    this.fontManager = FontManager.instance
    this.defaultStyleManager = new DefaultStyleManager()
    this.isInitialized = false
  }

  /**
   * Used to manage materials used by texts
   */
  get styleManager(): StyleManager {
    return this.defaultStyleManager
  }
  set styleManager(value: StyleManager) {
    this.defaultStyleManager = value
  }

  /**
   * Set URL to load fonts
   * @param value - URL to load fonts
   */
  async setFontUrl(value: string) {
    this.fontManager.baseUrl = value
  }

  /**
   * Render MText directly in the main thread asynchronously. It will ensure that default font
   * is loaded. And fonts needed in mtext are loaded on demand.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): Promise<MTextObject> {
    await this.ensureInitialized()
    const mtext = new MText(
      mtextContent,
      textStyle,
      this.defaultStyleManager,
      this.fontManager,
      colorSettings
    )
    await mtext.asyncDraw()
    mtext.updateMatrixWorld(true)
    return mtext as MTextObject
  }

  /**
   * Render MText directly in the main thread synchronously. It is user's responsibility to ensure
   * that default font is loaded and fonts needed in mtext are loaded.
   */
  syncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    const mtext = new MText(
      mtextContent,
      textStyle,
      this.defaultStyleManager,
      this.fontManager,
      colorSettings
    )
    mtext.syncDraw()
    mtext.updateMatrixWorld(true)
    return mtext as MTextObject
  }

  async asyncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): Promise<MTextObject> {
    await this.ensureInitialized()
    const shape = new Shape(
      shapeContent,
      textStyle,
      this.defaultStyleManager,
      this.fontManager,
      colorSettings
    )
    await shape.asyncDraw()
    shape.updateMatrixWorld(true)
    return shape as unknown as MTextObject
  }

  syncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    const shape = new Shape(
      shapeContent,
      textStyle,
      this.defaultStyleManager,
      this.fontManager,
      colorSettings
    )
    shape.syncDraw()
    shape.updateMatrixWorld(true)
    return shape as unknown as MTextObject
  }

  /**
   * Load fonts in the main thread
   */
  async loadFonts(fonts: readonly string[]): Promise<{ loaded: string[] }> {
    await this.fontManager.loadFontsByNames(fonts)
    return { loaded: [...fonts] }
  }

  /**
   * Get available fonts from the main thread
   */
  async getAvailableFonts(): Promise<{ fonts: Array<{ name: string[] }> }> {
    const fonts = await this.fontManager.getAvailableFonts()
    return { fonts }
  }

  /**
   * Estimates memory used by fonts and materials in the main-thread isolate.
   */
  estimateMemoryUsage(): IsolateMemoryStats {
    return collectIsolateMemoryStats(this.fontManager, {
      id: 'main',
      styleManager: this.defaultStyleManager
    })
  }

  destroy(): void {
    // nothing to cleanup for main thread renderer currently
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      // Guarantee the default font is loaded
      await this.loadFonts(FontManager.instance.getFontsToLoad())
      this.isInitialized = true
    }
  }
}
