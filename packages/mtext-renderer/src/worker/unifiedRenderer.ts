import { FontCacheManager } from '../cache'
import { DefaultFontsPreset, FontLoadStatus, FontManager } from '../font'
import {
  collectIsolateMemoryStats,
  type MemoryUsageReport,
  readJsHeapStats} from '../memory'
import { StyleManager } from '../renderer'
import {
  ColorSettings,
  createDefaultColorSettings,
  MTextData,
  ShapeData,
  TextStyle
} from '../renderer/types'
import { MTextBaseRenderer, MTextObject } from './baseRenderer'
import { MainThreadRenderer } from './mainThreadRenderer'
import { WebWorkerRenderer, WebWorkerRendererConfig } from './webWorkerRenderer'

export type RenderMode = 'main' | 'worker'

/**
 * Unified renderer that can work in both main thread and web worker modes
 */
export class UnifiedRenderer {
  private webWorkerRenderer: WebWorkerRenderer | null = null
  private mainThreadRenderer: MainThreadRenderer
  private renderer: MTextBaseRenderer
  private defaultMode: RenderMode
  private workerConfig: WebWorkerRendererConfig
  private webWorkerConfigured = false
  /**
   * Constructor
   *
   * @param defaultMode - Default rendering mode. Default is 'main' which means rendering in main thread.
   * @param workerConfig - Configuration options for WebWorkerRenderer which is used
   *                     when render mode is 'worker'.
   */
  constructor(
    defaultMode: RenderMode = 'main',
    workerConfig: WebWorkerRendererConfig = {}
  ) {
    this.defaultMode = defaultMode
    this.workerConfig = workerConfig
    this.mainThreadRenderer = new MainThreadRenderer()
    this.renderer = this.mainThreadRenderer
    if (defaultMode === 'worker') {
      this.renderer = this.ensureWebWorkerRenderer()
    }
  }

  private ensureWebWorkerRenderer(): WebWorkerRenderer {
    if (!this.webWorkerRenderer) {
      this.webWorkerRenderer = new WebWorkerRenderer(this.workerConfig)
      this.webWorkerRenderer.styleManager = this.mainThreadRenderer.styleManager
      this.webWorkerConfigured = false
    }
    return this.webWorkerRenderer
  }

  private async activateWebWorkerRenderer(): Promise<WebWorkerRenderer> {
    const renderer = this.ensureWebWorkerRenderer()
    if (!this.webWorkerConfigured) {
      await renderer.setDefaultFonts(
        [...FontManager.instance.defaultFonts],
        [...FontManager.instance.symbolFonts]
      )
      this.webWorkerConfigured = true
    }
    return renderer
  }

  /**
   * Sets one new style manager to override the default style manager.
   *
   * Both renderers receive the override so that `syncRenderMText`
   * (which always uses `mainThreadRenderer`) and `asyncRenderMText`
   * (which may use either renderer) produce materials from the same
   * manager.
   *
   * @param value - New style manager
   */
  setStyleManager(value: StyleManager) {
    this.mainThreadRenderer.styleManager = value
    if (this.webWorkerRenderer) {
      this.webWorkerRenderer.styleManager = value
    }
  }

  /**
   * Sets the default rendering mmode
   * @param mode The default rendering mode
   */
  setDefaultMode(mode: RenderMode): void {
    if (this.defaultMode === mode) {
      return
    }
    this.defaultMode = mode
    if (mode === 'worker') {
      this.renderer = this.ensureWebWorkerRenderer()
    } else {
      this.renderer = this.mainThreadRenderer
    }
  }

  /**
   * Set URL to load fonts
   * @param value - URL to load fonts
   */
  setFontUrl(value: string) {
    return this.renderer.setFontUrl(value)
  }

  /**
   * Get the default rendering mode
   */
  getDefaultMode(): RenderMode {
    return this.defaultMode
  }

  /**
   * Render MText using the current mode asynchronously.
   * @param colorSettings - Optional color context (ByLayer, ByBlock colors).
   * @param mode - Rendering mode used. If undefined, the default rendering mode is used.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    mode?: RenderMode
  ): Promise<MTextObject> {
    const effectiveMode = mode ?? this.defaultMode
    if (effectiveMode === 'worker') {
      const renderer = await this.activateWebWorkerRenderer()
      return renderer.asyncRenderMText(mtextContent, textStyle, colorSettings)
    }
    return this.mainThreadRenderer.asyncRenderMText(
      mtextContent,
      textStyle,
      colorSettings
    )
  }

  /**
   * Render MText using the current mode synchronously. Main thread render is always used
   * for this function because web worker renderer doesn't support rendering synchronously.
   * @param colorSettings - Optional color context (ByLayer, ByBlock colors).
   */
  syncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    return this.mainThreadRenderer.syncRenderMText(
      mtextContent,
      textStyle,
      colorSettings
    )
  }

  async asyncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings(),
    _mode?: RenderMode
  ): Promise<MTextObject> {
    return this.mainThreadRenderer.asyncRenderShape(
      shapeContent,
      textStyle,
      colorSettings
    )
  }

  syncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    return this.mainThreadRenderer.syncRenderShape(
      shapeContent,
      textStyle,
      colorSettings
    )
  }

  /**
   * Sets the default font fallback chain on the active renderer and workers.
   */
  async setDefaultFonts(
    fonts: DefaultFontsPreset | string | readonly string[]
  ): Promise<void> {
    FontManager.instance.setDefaultFonts(fonts)
    if (this.webWorkerRenderer) {
      await this.webWorkerRenderer.setDefaultFonts(
        [...FontManager.instance.defaultFonts],
        [...FontManager.instance.symbolFonts]
      )
      this.webWorkerConfigured = true
    }
  }

  /**
   * Returns font names for a predefined default-font preset.
   */
  getDefaultFontsPreset(preset: DefaultFontsPreset): readonly string[] {
    return FontManager.instance.getDefaultFontsPreset(preset)
  }

  /**
   * Returns symbol-font names for a predefined preset.
   */
  getSymbolFontsPreset(preset: DefaultFontsPreset): readonly string[] {
    return FontManager.instance.getSymbolFontsPreset(preset)
  }

  /**
   * Load fonts using the current mode
   */
  async loadFonts(fonts: readonly string[]): Promise<{ loaded: string[] }> {
    return this.renderer.loadFonts(fonts)
  }

  /**
   * Get available fonts using the current mode
   */
  async getAvailableFonts(): Promise<{ fonts: Array<{ name: string[] }> }> {
    return this.renderer.getAvailableFonts()
  }

  /**
   * Estimates memory used by mtext-renderer across the main thread and workers.
   *
   * @remarks
   * `totalEstimatedBytes` covers **live** isolate memory only (fonts still loaded
   * in memory, caches, materials). IndexedDB font blobs are reported separately
   * under {@link MemoryUsageReport.indexedDbFontCache} and are **not** included
   * in the total — they remain after {@link FontManager.release}. Disposed /
   * released font caches are excluded. Application-held scene graphs are not
   * included. Collecting IndexedDB stats temporarily loads cached blobs into
   * the JS heap.
   */
  async estimateMemoryUsage(): Promise<MemoryUsageReport> {
    const mainThread = collectIsolateMemoryStats(FontManager.instance, {
      id: 'main',
      styleManager: this.mainThreadRenderer.styleManager
    })

    const workers = this.webWorkerRenderer
      ? await this.webWorkerRenderer.estimateMemoryUsage()
      : []

    let indexedDbFontCache: MemoryUsageReport['indexedDbFontCache'] = {
      fontCount: 0,
      totalBytes: 0,
      fonts: []
    }
    try {
      indexedDbFontCache = await FontCacheManager.instance.getStorageStats()
    } catch {
      // IndexedDB may be unavailable (Node tests, private mode, etc.)
    }

    const totalEstimatedBytes =
      mainThread.totalEstimatedBytes +
      workers.reduce((sum, worker) => sum + worker.totalEstimatedBytes, 0)

    return {
      collectedAt: Date.now(),
      totalEstimatedBytes,
      mainThread,
      workers,
      indexedDbFontCache,
      jsHeap: readJsHeapStats()
    }
  }

  /**
   * Parse and cache a user-uploaded font file in IndexedDB.
   * Always runs on the main-thread {@link FontManager} so the cache is shared
   * with the web worker renderer.
   */
  async cacheFont(
    data: ArrayBuffer | File,
    fileName?: string,
    aliases?: string[],
    encoding?: string
  ): Promise<FontLoadStatus> {
    return FontManager.instance.cacheFont(data, fileName, aliases, encoding)
  }

  /**
   * Terminate web workers and release their memory.
   *
   * The unified renderer keeps working on the main thread. Workers are
   * recreated lazily the next time worker rendering is requested.
   * Safe to call when no workers were created.
   */
  terminateWorkers(): void {
    this.webWorkerRenderer?.terminate()
    this.webWorkerRenderer = null
    this.webWorkerConfigured = false
    this.renderer = this.mainThreadRenderer
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.terminateWorkers()
    this.mainThreadRenderer.destroy()
  }
}
