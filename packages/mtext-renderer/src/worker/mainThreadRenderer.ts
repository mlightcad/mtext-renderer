import {
  awaitRenderWork,
  checkRenderSignal,
  disposeRenderGeometry
} from '../common/renderRequest'
import { FontManager } from '../font'
import { collectIsolateMemoryStats, type IsolateMemoryStats } from '../memory'
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
import {
  MTextBaseRenderer,
  MTextObject,
  TextRenderOptions
} from './baseRenderer'

/**
 * Main thread renderer for MText objects
 * This provides the same interface as the worker but runs in the main thread
 */
export class MainThreadRenderer implements MTextBaseRenderer {
  private fontManager: FontManager
  private defaultStyleManager: StyleManager
  private initialization: Promise<void> | null = null

  constructor() {
    this.fontManager = FontManager.instance
    this.defaultStyleManager = new DefaultStyleManager()
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
    // Match worker setFontUrl: resolve fonts.json before the first draw so
    // on-demand style faces (e.g. `malgun`) are catalogued.
    try {
      await this.fontManager.getAvailableFonts()
    } catch {
      // Per-face loads still report NotFound/FailedToLoad.
    }
  }

  /**
   * Render MText directly in the main thread asynchronously. Fonts referenced by
   * the text/style are scheduled via {@link FontManager.requestFonts} when
   * {@link FontManager.lazyFontLoading} is enabled (unless
   * {@link FontManager.awaitFontsBeforeDraw} waits for them first); otherwise
   * they are awaited.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    options: TextRenderOptions = {}
  ): Promise<MTextObject> {
    const styleManager = options.styleManager ?? this.defaultStyleManager
    const signal = options.signal
    checkRenderSignal(signal)
    await awaitRenderWork(this.ensureInitialized(), signal)
    checkRenderSignal(signal)
    const mtext = new MText(
      mtextContent,
      textStyle,
      styleManager,
      this.fontManager,
      colorSettings
    )
    try {
      await mtext.asyncDraw({ signal })
      checkRenderSignal(signal)
      mtext.updateMatrixWorld(true)
      return mtext as MTextObject
    } catch (error) {
      disposeRenderGeometry(mtext)
      throw error
    }
  }

  /**
   * Render MText directly in the main thread synchronously. It is user's responsibility to ensure
   * that default font is loaded and fonts needed in mtext are loaded.
   */
  syncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    options: TextRenderOptions = {}
  ): MTextObject {
    checkRenderSignal(options.signal)
    const styleManager = options.styleManager ?? this.defaultStyleManager
    const mtext = new MText(
      mtextContent,
      textStyle,
      styleManager,
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
    colorSettings: ColorSettings = createDefaultColorSettings(),
    options: TextRenderOptions = {}
  ): Promise<MTextObject> {
    const styleManager = options.styleManager ?? this.defaultStyleManager
    const signal = options.signal
    checkRenderSignal(signal)
    await awaitRenderWork(this.ensureInitialized(), signal)
    checkRenderSignal(signal)
    const shape = new Shape(
      shapeContent,
      textStyle,
      styleManager,
      this.fontManager,
      colorSettings
    )
    try {
      await shape.asyncDraw({ signal })
      checkRenderSignal(signal)
      shape.updateMatrixWorld(true)
      return shape as unknown as MTextObject
    } catch (error) {
      disposeRenderGeometry(shape)
      throw error
    }
  }

  syncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    options: TextRenderOptions = {}
  ): MTextObject {
    checkRenderSignal(options.signal)
    const styleManager = options.styleManager ?? this.defaultStyleManager
    const shape = new Shape(
      shapeContent,
      textStyle,
      styleManager,
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
  async loadFonts(
    fonts: readonly string[],
    _options?: { scope?: 'one' | 'all' }
  ): Promise<{ loaded: string[] }> {
    const requestedFonts = [...fonts]
    await this.fontManager.loadFontsByNames(requestedFonts)
    return {
      loaded: requestedFonts.filter(name => this.fontManager.isFontLoaded(name))
    }
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

  private ensureInitialized(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        // Share catalog/default preload across overlapping requests.
        try {
          await this.fontManager.getAvailableFonts()
        } catch {
          // Per-face loads still report NotFound/FailedToLoad.
        }
        if (!this.fontManager.lazyFontLoading) {
          await this.loadFonts(this.fontManager.getFontsToLoad())
        }
      })()
      const initialization = this.initialization
      void initialization.catch(() => {
        if (this.initialization === initialization) this.initialization = null
      })
    }
    return this.initialization
  }
}
