import { FontManager } from '../font'
import { DefaultStyleManager } from '../renderer/defaultStyleManager'
import { MText } from '../renderer/mtext'
import { StyleManager } from '../renderer/styleManager'
import {
  ColorSettings,
  createDefaultColorSettings,
  MTextData,
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
   * Configure default fallback fonts for mesh, primary SHX, and big SHX types.
   */
  async setDefaultFonts(meshFont: string, shxFont: string, shxBigFont: string) {
    this.fontManager.defaultMeshFont = meshFont
    this.fontManager.defaultShxFont = shxFont
    this.fontManager.defaultShxBigFont = shxBigFont
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

  /**
   * Load fonts in the main thread
   */
  async loadFonts(fonts: string[]): Promise<{ loaded: string[] }> {
    await this.fontManager.loadFontsByNames(fonts)
    return { loaded: fonts }
  }

  /**
   * Get available fonts from the main thread
   */
  async getAvailableFonts(): Promise<{ fonts: Array<{ name: string[] }> }> {
    const fonts = await this.fontManager.getAvailableFonts()
    return { fonts }
  }

  destroy(): void {
    // nothing to cleanup for main thread renderer currently
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      // Guarantee the default fonts are loaded
      await this.loadFonts(FontManager.instance.getDefaultFontsToLoad())
      this.isInitialized = true
    }
  }
}
