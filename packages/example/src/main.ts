import {
  FontManager,
  formatMemoryUsageReport,
  MText,
  MTextColor,
  MTextData,
  MTextObject,
  RenderMode,
  UnifiedRenderer
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import { DebugOverlayManager } from './debugOverlayManager'
import { ExampleFontManager } from './exampleFontManager'
import {
  buildShapeDataFromInputs,
  createAttachmentPointTestData,
  createMultipleMTextData,
  createShapeTestData,
  createShapeTextStyle,
  LargeCoordinatesExample,
  validateShapeInputs
} from './exampleTestData'
import { EXAMPLE_TEXTS, type ExampleTextKey } from './exampleTexts'
import { SceneBoundsHelper } from './sceneBoundsHelper'
import { SceneViewport } from './sceneViewport'
import { WcsCoordinateDisplay } from './wcsCoordinateDisplay'

/**
 * Root controller for the interactive MText renderer example page.
 *
 * @remarks
 * Wires DOM controls to {@link UnifiedRenderer}, delegates viewport and bounds work
 * to {@link SceneViewport} / {@link SceneBoundsHelper}, and orchestrates MText and
 * SHAPE render passes. Example-button content comes from {@link EXAMPLE_TEXTS}; specialized
 * multi-entity scenarios use factories in {@link exampleTestData}.
 */
class MTextRendererExample {
  /** Three.js viewport (scene, camera, renderer, controls). */
  private readonly viewport: SceneViewport
  /** Bounds, rebase, and zoom-to-fit helper. */
  private readonly boundsHelper: SceneBoundsHelper
  /** Mouse WCS coordinate HUD. */
  private readonly wcsDisplay: WcsCoordinateDisplay
  /** Debug bounding boxes, crosshairs, and layout overlays. */
  private readonly debugOverlays: DebugOverlayManager
  /** Font preset, cache, and select UI. */
  private readonly fontManager: ExampleFontManager
  /** Main-thread / worker rendering facade. */
  private readonly unifiedRenderer: UnifiedRenderer
  /** Currently displayed root object (single MText, group, or SHAPE batch). */
  private currentMText: MTextObject | null = null
  /**
   * When set, {@link renderCurrentContent} routes through large-coordinate test data
   * even if the user clicks Render without re-selecting the example button.
   */
  private largeCoordinatesExampleKey: string | null = null
  /** Debounce timer for redrawing after lazy {@link FontManager.events.fontLoaded}. */
  private lazyRedrawTimer: ReturnType<typeof setTimeout> | null = null
  /** Guards against overlapping auto-redraws while fonts keep arriving. */
  private isLazyRedrawing = false
  /** Set when a font loads during an in-flight lazy redraw so we reschedule. */
  private lazyRedrawPending = false
  /** Fonts reported by `fontLoaded` since the last user-initiated render. */
  private lazyFontsLoadedSinceRender: string[] = []
  /** When true, the next {@link renderCurrentContent} was triggered by lazy redraw. */
  private isAutoLazyRedraw = false

  /** `#mtext-input` — editable MText format string for manual renders. */
  private readonly mtextInput: HTMLTextAreaElement
  /** `#render-btn` — triggers {@link renderCurrentContent}. */
  private readonly renderBtn: HTMLButtonElement
  /** `#status` — timing, preset, and error messages. */
  private readonly statusDiv: HTMLDivElement
  /** `#content-type` — switches between MText and SHAPE modes. */
  private readonly contentTypeSelect: HTMLSelectElement
  /** `#mtext-panel` — MText-specific controls container. */
  private readonly mtextPanel: HTMLDivElement
  /** `#shape-panel` — SHAPE-specific controls container. */
  private readonly shapePanel: HTMLDivElement
  /** `#shape-name` — optional SHX shape name lookup. */
  private readonly shapeNameInput: HTMLInputElement
  /** `#shape-number` — optional SHX shape number lookup. */
  private readonly shapeNumberInput: HTMLInputElement
  /** `#shape-size` — nominal SHAPE height. */
  private readonly shapeSizeInput: HTMLInputElement
  /** `#shape-width-factor` — horizontal width factor for SHAPE. */
  private readonly shapeWidthFactorInput: HTMLInputElement
  /** `#shape-rotation` — rotation in degrees for SHAPE. */
  private readonly shapeRotationInput: HTMLInputElement
  /** `#shape-font-select` — SHX font used for SHAPE rendering. */
  private readonly shapeFontSelect: HTMLSelectElement
  /** `#show-bounding-box` — toggles green logical/geometry bounds overlay. */
  private readonly showBoundingBoxCheckbox: HTMLInputElement
  /** `#show-char-boxes` — toggles per-character layout boxes. */
  private readonly showCharBoxesCheckbox: HTMLInputElement
  /** `#show-line-boxes` — toggles per-line strip boxes. */
  private readonly showLineBoxesCheckbox: HTMLInputElement
  /** `#render-mode` — main thread vs Web Worker rendering. */
  private readonly renderModeSelect: HTMLSelectElement
  /** `#by-layer-color` — RGB hex for ByLayer (256) color resolution. */
  private readonly byLayerColorInput: HTMLInputElement
  /** `#by-block-color` — RGB hex for ByBlock (0) color resolution. */
  private readonly byBlockColorInput: HTMLInputElement
  /** `#font-cache-input` — local font file picker for IndexedDB caching. */
  private readonly fontCacheInput: HTMLInputElement
  /** `#font-cache-btn` — submits {@link ExampleFontManager.cacheSelectedFontFile}. */
  private readonly fontCacheBtn: HTMLButtonElement
  /** `#memory-stats-btn` — refreshes {@link UnifiedRenderer.estimateMemoryUsage}. */
  private readonly memoryStatsBtn: HTMLButtonElement
  /** `#release-fonts-btn` — calls {@link FontManager.release} then refreshes stats. */
  private readonly releaseFontsBtn: HTMLButtonElement
  /** `#memory-stats` — formatted memory report output. */
  private readonly memoryStatsPre: HTMLPreElement
  /** `#font-select` — primary text-style font. */
  private readonly fontSelect: HTMLSelectElement
  /** `#default-fonts-preset` — CJK / symbol fallback chain preset. */
  private readonly defaultFontsPresetSelect: HTMLSelectElement
  /** `#lazy-font-loading` — toggles {@link FontManager.lazyFontLoading}. */
  private readonly lazyFontLoadingCheckbox: HTMLInputElement
  /** DXF layer name passed in {@link getColorSettings} for ByLayer color resolution. */
  private readonly defaultLayerName = '0'

  /** Bootstraps viewport, helpers, DOM bindings, fonts, and the initial render. */
  constructor() {
    const renderArea = document.getElementById('render-area') as HTMLElement
    this.viewport = new SceneViewport(renderArea)
    this.boundsHelper = new SceneBoundsHelper(
      this.viewport.camera,
      this.viewport.controls,
      () => this.viewport.getSize()
    )
    this.debugOverlays = new DebugOverlayManager(this.boundsHelper)

    this.unifiedRenderer = new UnifiedRenderer('main', {
      workerUrl: new URL(
        '../../mtext-renderer/src/worker/mtextWorker.ts',
        import.meta.url
      )
    })

    this.mtextInput = document.getElementById(
      'mtext-input'
    ) as HTMLTextAreaElement
    this.renderBtn = document.getElementById('render-btn') as HTMLButtonElement
    this.statusDiv = document.getElementById('status') as HTMLDivElement
    this.contentTypeSelect = document.getElementById(
      'content-type'
    ) as HTMLSelectElement
    this.mtextPanel = document.getElementById('mtext-panel') as HTMLDivElement
    this.shapePanel = document.getElementById('shape-panel') as HTMLDivElement
    this.shapeFontSelect = document.getElementById(
      'shape-font-select'
    ) as HTMLSelectElement
    this.shapeNameInput = document.getElementById(
      'shape-name'
    ) as HTMLInputElement
    this.shapeNumberInput = document.getElementById(
      'shape-number'
    ) as HTMLInputElement
    this.shapeSizeInput = document.getElementById(
      'shape-size'
    ) as HTMLInputElement
    this.shapeWidthFactorInput = document.getElementById(
      'shape-width-factor'
    ) as HTMLInputElement
    this.shapeRotationInput = document.getElementById(
      'shape-rotation'
    ) as HTMLInputElement
    this.showBoundingBoxCheckbox = document.getElementById(
      'show-bounding-box'
    ) as HTMLInputElement
    this.showCharBoxesCheckbox = document.getElementById(
      'show-char-boxes'
    ) as HTMLInputElement
    this.showLineBoxesCheckbox = document.getElementById(
      'show-line-boxes'
    ) as HTMLInputElement
    this.renderModeSelect = document.getElementById(
      'render-mode'
    ) as HTMLSelectElement
    this.byLayerColorInput = document.getElementById(
      'by-layer-color'
    ) as HTMLInputElement
    this.byBlockColorInput = document.getElementById(
      'by-block-color'
    ) as HTMLInputElement
    this.fontCacheInput = document.getElementById(
      'font-cache-input'
    ) as HTMLInputElement
    this.fontCacheBtn = document.getElementById(
      'font-cache-btn'
    ) as HTMLButtonElement
    this.memoryStatsBtn = document.getElementById(
      'memory-stats-btn'
    ) as HTMLButtonElement
    this.releaseFontsBtn = document.getElementById(
      'release-fonts-btn'
    ) as HTMLButtonElement
    this.memoryStatsPre = document.getElementById(
      'memory-stats'
    ) as HTMLPreElement

    this.fontSelect = document.getElementById(
      'font-select'
    ) as HTMLSelectElement
    this.defaultFontsPresetSelect = document.getElementById(
      'default-fonts-preset'
    ) as HTMLSelectElement
    this.lazyFontLoadingCheckbox = document.getElementById(
      'lazy-font-loading'
    ) as HTMLInputElement
    this.fontManager = new ExampleFontManager(
      this.unifiedRenderer,
      this.statusDiv,
      this.fontSelect,
      this.shapeFontSelect,
      this.defaultFontsPresetSelect,
      this.fontCacheInput,
      this.fontCacheBtn
    )

    void this.fontManager.setLazyFontLoading(
      this.lazyFontLoadingCheckbox.checked
    )
    FontManager.instance.events.fontLoaded.addEventListener(payload => {
      this.onLazyFontLoaded(payload.fontName)
    })

    const wcsCoordsDiv = document.getElementById('wcs-coords') as HTMLDivElement
    this.wcsDisplay = new WcsCoordinateDisplay(
      wcsCoordsDiv,
      this.viewport,
      this.boundsHelper
    )
    this.wcsDisplay.bind(this.viewport.renderer.domElement)

    this.setupEventListeners()
    this.fontManager
      .initialize(true)
      .then(() => {
        void this.renderCurrentContent()
      })
      .catch(error => {
        console.error('Failed to initialize fonts:', error)
        this.statusDiv.textContent = 'Failed to initialize fonts'
        this.statusDiv.style.color = '#f00'
      })

    this.viewport.startAnimationLoop()
  }

  /** Releases worker threads and renderer resources on page unload. */
  public destroy(): void {
    this.unifiedRenderer.destroy()
  }

  private readonly controlsPanelMinWidth = 360
  private readonly controlsPanelMaxWidthRatio = 0.72
  private readonly controlsPanelStorageKey = 'mtext-example-controls-width'

  /** Wires the vertical splitter so the left controls panel can be resized. */
  private setupControlsPanelResize(): void {
    const controls = document.getElementById('controls') as HTMLElement | null
    const splitter = document.getElementById(
      'panel-splitter'
    ) as HTMLElement | null
    if (!controls || !splitter) {
      return
    }

    const stored = Number(localStorage.getItem(this.controlsPanelStorageKey))
    if (Number.isFinite(stored) && stored > 0) {
      this.setControlsPanelWidth(stored)
    } else {
      this.clampControlsPanelWidth()
    }

    let dragging = false

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return
      }
      this.setControlsPanelWidth(event.clientX)
      this.viewport.resize()
    }

    const stopDragging = (event: PointerEvent) => {
      if (!dragging) {
        return
      }
      dragging = false
      splitter.classList.remove('is-dragging')
      document.body.classList.remove('is-resizing-panel')
      try {
        splitter.releasePointerCapture(event.pointerId)
      } catch {
        // ignore if capture was already released
      }
      localStorage.setItem(
        this.controlsPanelStorageKey,
        String(Math.round(controls.getBoundingClientRect().width))
      )
      this.viewport.resize(() => this.fitView())
    }

    splitter.addEventListener('pointerdown', event => {
      if (event.button !== 0) {
        return
      }
      dragging = true
      splitter.classList.add('is-dragging')
      document.body.classList.add('is-resizing-panel')
      splitter.setPointerCapture(event.pointerId)
    })
    splitter.addEventListener('pointermove', onPointerMove)
    splitter.addEventListener('pointerup', stopDragging)
    splitter.addEventListener('pointercancel', stopDragging)

    splitter.addEventListener('keydown', event => {
      const step = event.shiftKey ? 40 : 16
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        this.setControlsPanelWidth(controls.getBoundingClientRect().width - step)
        this.viewport.resize(() => this.fitView())
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        this.setControlsPanelWidth(controls.getBoundingClientRect().width + step)
        this.viewport.resize(() => this.fitView())
      }
    })
  }

  /** Clamps the controls panel width into the allowed range for the current viewport. */
  private clampControlsPanelWidth(): void {
    const controls = document.getElementById('controls') as HTMLElement | null
    if (!controls) {
      return
    }
    this.setControlsPanelWidth(controls.getBoundingClientRect().width)
  }

  /** Applies a pixel width to `#controls`, clamped between min and max bounds. */
  private setControlsPanelWidth(width: number): void {
    const controls = document.getElementById('controls') as HTMLElement | null
    if (!controls) {
      return
    }
    const maxWidth = Math.max(
      this.controlsPanelMinWidth,
      Math.floor(window.innerWidth * this.controlsPanelMaxWidthRatio)
    )
    const next = Math.min(
      maxWidth,
      Math.max(this.controlsPanelMinWidth, Math.round(width))
    )
    controls.style.setProperty('--controls-width', `${next}px`)
  }

  /** Registers all UI event handlers for controls, examples, and window resize. */
  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      this.clampControlsPanelWidth()
      this.viewport.resize(() => this.fitView())
    })
    this.setupControlsPanelResize()

    this.renderBtn.addEventListener('click', async () => {
      this.beginUserRender()
      await this.renderCurrentContent()
    })

    this.contentTypeSelect.addEventListener('change', () => {
      this.updateContentPanels()
      this.beginUserRender()
      void this.renderCurrentContent()
    })
    this.updateContentPanels()

    ;[
      this.shapeFontSelect,
      this.shapeNameInput,
      this.shapeNumberInput,
      this.shapeSizeInput,
      this.shapeWidthFactorInput,
      this.shapeRotationInput
    ].forEach(element => {
      element.addEventListener('change', () => {
        if (this.contentTypeSelect.value === 'shape') {
          this.beginUserRender()
          void this.renderCurrentContent()
        }
      })
    })

    this.fontSelect.addEventListener('change', async () => {
      await this.fontManager.applyDefaultFontsPreset()
      this.beginUserRender()
      await this.renderCurrentContent()
    })

    this.defaultFontsPresetSelect.addEventListener('change', async () => {
      await this.fontManager.applyDefaultFontsPreset()
      this.beginUserRender()
      await this.renderCurrentContent()
    })

    this.lazyFontLoadingCheckbox.addEventListener('change', async () => {
      await this.applyLazyFontLoadingMode(this.lazyFontLoadingCheckbox.checked)
    })

    document.querySelectorAll('.example-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const exampleType = (button as HTMLElement).dataset
          .example as ExampleTextKey | undefined
        if (!exampleType || !(exampleType in EXAMPLE_TEXTS)) {
          return
        }

        const content = EXAMPLE_TEXTS[exampleType]
        this.beginUserRender()

        if (content === 'shapes') {
          this.contentTypeSelect.value = 'shape'
          this.updateContentPanels()
          await this.renderCurrentContent('shapes')
        } else if (
          content === 'multiple' ||
          content === 'attachmentGrid' ||
          LargeCoordinatesExample.isExample(content)
        ) {
          this.contentTypeSelect.value = 'mtext'
          this.updateContentPanels()
          if (LargeCoordinatesExample.isExample(content)) {
            this.mtextInput.value = LargeCoordinatesExample.DEFAULT_TEXT
            this.largeCoordinatesExampleKey = content
          } else {
            this.largeCoordinatesExampleKey = null
          }
          await this.renderCurrentContent(content)
        } else {
          this.contentTypeSelect.value = 'mtext'
          this.updateContentPanels()
          this.largeCoordinatesExampleKey = null
          this.mtextInput.value = content
          await this.renderCurrentContent(content)
        }
      })
    })

    this.showBoundingBoxCheckbox.addEventListener('change', () => {
      this.debugOverlays.setBoundingBoxVisible(
        this.showBoundingBoxCheckbox.checked
      )
    })

    this.showCharBoxesCheckbox.addEventListener('change', () => {
      this.debugOverlays.setCharBoxOverlayVisibility(
        this.showCharBoxesCheckbox.checked
      )
    })

    this.showLineBoxesCheckbox.addEventListener('change', () => {
      this.debugOverlays.setLineBoxOverlayVisibility(
        this.showLineBoxesCheckbox.checked
      )
    })

    this.renderModeSelect.addEventListener('change', async () => {
      const mode = this.renderModeSelect.value as RenderMode
      this.unifiedRenderer.setDefaultMode(mode)
      this.statusDiv.textContent = `Switched to ${mode} thread rendering`
      this.statusDiv.style.color = '#0f0'
      await this.fontManager.initialize(false)
      this.beginUserRender()
      await this.renderCurrentContent()
    })

    this.byLayerColorInput.addEventListener('change', async () => {
      this.beginUserRender()
      await this.renderCurrentContent()
    })
    this.byBlockColorInput.addEventListener('change', async () => {
      this.beginUserRender()
      await this.renderCurrentContent()
    })

    this.fontCacheBtn.addEventListener('click', async () => {
      await this.fontManager.cacheSelectedFontFile(() => {
        this.beginUserRender()
        return this.renderCurrentContent()
      })
    })
    this.fontCacheInput.addEventListener('change', () => {
      this.fontManager.updateCacheButtonState()
    })
    this.fontManager.updateCacheButtonState()

    this.memoryStatsBtn.addEventListener('click', () => {
      void this.refreshMemoryStats()
    })
    this.releaseFontsBtn.addEventListener('click', () => {
      void this.releaseLoadedFonts()
    })
  }

  /** Marks the next render as user-initiated (resets lazy font-load tracking). */
  private beginUserRender(): void {
    this.isAutoLazyRedraw = false
    this.lazyRedrawPending = false
    this.lazyFontsLoadedSinceRender = []
    if (this.lazyRedrawTimer != null) {
      clearTimeout(this.lazyRedrawTimer)
      this.lazyRedrawTimer = null
    }
  }

  /**
   * Applies the Lazy Font Loading checkbox: updates {@link FontManager},
   * clears in-memory fonts when enabling lazy mode, and preloads when disabling.
   */
  private async applyLazyFontLoadingMode(enabled: boolean): Promise<void> {
    await this.fontManager.setLazyFontLoading(enabled)
    if (enabled) {
      FontManager.instance.release()
      this.unifiedRenderer.terminateWorkers()
      await this.fontManager.applyDefaultFontsPreset()
      this.statusDiv.textContent =
        'Lazy font loading ON — fonts released; next render loads on demand'
      this.statusDiv.style.color = '#0f0'
    } else {
      await this.fontManager.applyDefaultFontsPreset()
      this.statusDiv.textContent =
        'Lazy font loading OFF — fonts preloaded before render'
      this.statusDiv.style.color = '#0f0'
    }
    this.beginUserRender()
    await this.renderCurrentContent()
  }

  /**
   * Handles {@link FontManager.events.fontLoaded} by scheduling a debounced redraw
   * so glyph fallbacks are replaced once background loads finish.
   */
  private onLazyFontLoaded(fontName: string): void {
    if (!this.fontManager.isLazyFontLoading()) {
      return
    }
    if (!this.lazyFontsLoadedSinceRender.includes(fontName)) {
      this.lazyFontsLoadedSinceRender.push(fontName)
    }
    this.statusDiv.textContent = `Lazy: loaded ${fontName} (${this.lazyFontsLoadedSinceRender.join(', ')}) — redrawing...`
    this.statusDiv.style.color = '#ffa500'
    this.scheduleLazyRedraw()
  }

  /** Debounces {@link redrawAfterLazyFontLoad} so bursty fontLoaded events coalesce. */
  private scheduleLazyRedraw(): void {
    if (this.lazyRedrawTimer != null) {
      clearTimeout(this.lazyRedrawTimer)
    }
    this.lazyRedrawTimer = setTimeout(() => {
      this.lazyRedrawTimer = null
      void this.redrawAfterLazyFontLoad()
    }, 120)
  }

  /** Re-renders current content after one or more lazy fonts finished loading. */
  private async redrawAfterLazyFontLoad(): Promise<void> {
    if (!this.fontManager.isLazyFontLoading()) {
      return
    }
    if (this.isLazyRedrawing) {
      // Font(s) arrived mid-redraw — run again after the current pass finishes.
      this.lazyRedrawPending = true
      return
    }
    this.isLazyRedrawing = true
    this.isAutoLazyRedraw = true
    this.lazyRedrawPending = false
    try {
      await this.renderCurrentContent()
      const fonts = this.lazyFontsLoadedSinceRender.join(', ')
      this.statusDiv.textContent = `Lazy: re-rendered after [${fonts}] (${this.renderModeSelect.value})`
      this.statusDiv.style.color = '#0f0'
    } catch (error) {
      console.error('Lazy redraw failed:', error)
    } finally {
      this.isLazyRedrawing = false
      this.isAutoLazyRedraw = false
      if (this.lazyRedrawPending) {
        this.lazyRedrawPending = false
        this.scheduleLazyRedraw()
      }
    }
  }

  /**
   * Preloads default, style, and inline fonts when lazy loading is disabled.
   */
  private async ensureFontsLoadedForMText(
    texts: string[],
    textFont: string
  ): Promise<void> {
    if (this.fontManager.isLazyFontLoading()) {
      return
    }
    const fonts = new Set<string>([
      ...FontManager.instance.getFontsToLoad(),
      textFont,
      ...this.fontManager.getFontsToPreload()
    ])
    for (const text of texts) {
      for (const font of MText.getFonts(text || '', true)) {
        fonts.add(font)
      }
    }
    await this.unifiedRenderer.loadFonts([...fonts].filter(Boolean))
  }

  /**
   * Collects and displays a live memory estimate from {@link UnifiedRenderer}.
   */
  private async refreshMemoryStats(): Promise<void> {
    try {
      this.memoryStatsBtn.disabled = true
      const report = await this.unifiedRenderer.estimateMemoryUsage()
      this.memoryStatsPre.textContent = formatMemoryUsageReport(report)
      this.statusDiv.textContent = 'Memory stats refreshed'
      this.statusDiv.style.color = '#0f0'
    } catch (error) {
      console.error('Failed to estimate memory usage:', error)
      this.memoryStatsPre.textContent =
        error instanceof Error ? error.message : String(error)
      this.statusDiv.textContent = 'Failed to refresh memory stats'
      this.statusDiv.style.color = '#f00'
    } finally {
      this.memoryStatsBtn.disabled = false
    }
  }

  /**
   * Releases main-thread loaded fonts (and recreates workers so their isolates
   * are empty too), then refreshes the memory panel.
   */
  private async releaseLoadedFonts(): Promise<void> {
    FontManager.instance.release()
    this.unifiedRenderer.terminateWorkers()
    this.beginUserRender()
    this.statusDiv.textContent =
      'Released loaded fonts (main + workers). Render again to observe lazy/non-lazy loading.'
    this.statusDiv.style.color = '#0f0'
    await this.refreshMemoryStats()
  }

  /** Toggles MText vs SHAPE panel visibility and related control enabled state. */
  private updateContentPanels(): void {
    const isShape = this.contentTypeSelect.value === 'shape'
    this.mtextPanel.classList.toggle('hidden', isShape)
    this.shapePanel.classList.toggle('hidden', !isShape)
    this.renderBtn.textContent = isShape ? 'Render Shape' : 'Render'
    this.showCharBoxesCheckbox.disabled = isShape
    this.showLineBoxesCheckbox.disabled = isShape
  }

  /**
   * Renders the active content type using optional explicit example content.
   *
   * @param content - Example marker or MText string; defaults to textarea or large-coordinate key.
   */
  private async renderCurrentContent(content?: string): Promise<void> {
    if (this.contentTypeSelect.value === 'shape') {
      await this.renderShape(content)
      return
    }
    await this.renderMText(
      content ?? (this.largeCoordinatesExampleKey ?? this.mtextInput.value)
    )
  }

  /** Removes the current root object and resets overlay / WCS offset state. */
  private clearSceneContent(): void {
    if (this.currentMText) {
      this.viewport.scene.remove(this.currentMText)
      this.currentMText = null
    }
    this.debugOverlays.clear()
    this.boundsHelper.resetOriginOffset()
  }

  /** Frames {@link currentMText} in the orthographic viewport. */
  private fitView(): void {
    this.boundsHelper.zoomToFit(this.currentMText)
  }

  /**
   * Parses a hex color field (`#RRGGBB` or `RRGGBB`).
   *
   * @param input - Color `<input type="color">` or text field.
   * @param fallback - Value used when parsing fails.
   */
  private parseColorInput(input: HTMLInputElement, fallback: number): number {
    const value = input.value?.trim()
    if (!value) return fallback

    const normalized = value.startsWith('#') ? value.slice(1) : value
    const parsed = Number.parseInt(normalized, 16)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  /** Builds {@link import('@mlightcad/mtext-renderer').ColorSettings} from ByLayer / ByBlock inputs. */
  private getColorSettings() {
    return {
      byLayerColor: this.parseColorInput(this.byLayerColorInput, 0xffffff),
      byBlockColor: this.parseColorInput(this.byBlockColorInput, 0xffffff),
      layer: this.defaultLayerName,
      color: new MTextColor(256)
    }
  }

  /** @returns Whether a SHAPE render produced no drawable geometry. */
  private isShapeRenderEmpty(shapeObj: MTextObject): boolean {
    return shapeObj.children.length === 0 || shapeObj.box.isEmpty()
  }

  /**
   * Renders one SHAPE entity from panel inputs or the five-glyph `shapes` grid example.
   *
   * @param content - When `'shapes'`, renders shape numbers 128–132; otherwise uses panel fields.
   */
  private async renderShape(content?: string): Promise<void> {
    try {
      const startTime = performance.now()
      this.statusDiv.textContent = 'Rendering SHAPE...'
      this.statusDiv.style.color = '#ffa500'

      this.clearSceneContent()
      const colorSettings = this.getColorSettings()
      const shapeFont = this.fontManager.getSelectedShapeFont() || 'complex'
      if (!this.fontManager.isLazyFontLoading()) {
        await this.unifiedRenderer.loadFonts([
          ...FontManager.instance.getFontsToLoad(),
          shapeFont
        ])
      }

      const isGrid = content === 'shapes'

      if (!isGrid) {
        const shapeData = this.readShapeDataFromInputs()
        const hasName = Boolean(shapeData.name?.trim())
        const hasNumber =
          shapeData.shapeNumber != null && shapeData.shapeNumber > 0
        if (!hasName && !hasNumber) {
          this.statusDiv.textContent = 'Provide a shape name or shape number'
          this.statusDiv.style.color = '#f00'
          return
        }
      }

      const items = isGrid
        ? createShapeTestData(shapeFont)
        : [
            {
              shapeData: this.readShapeDataFromInputs(),
              textStyle: createShapeTextStyle(
                shapeFont,
                Number(this.shapeSizeInput.value) || 24
              )
            }
          ]

      const shapeObjects = await Promise.all(
        items.map(({ shapeData, textStyle }) =>
          this.unifiedRenderer.asyncRenderShape(
            shapeData,
            textStyle,
            colorSettings
          )
        )
      )

      if (!isGrid) {
        const shapeObj = shapeObjects[0]
        if (this.isShapeRenderEmpty(shapeObj)) {
          this.statusDiv.textContent = validateShapeInputs(
            items[0].shapeData,
            shapeFont
          )
          this.statusDiv.style.color = '#f00'
          return
        }
      }

      const group = new THREE.Group()
      let combinedBox: THREE.Box3 | null = null

      if (isGrid) {
        items.forEach(({ shapeData }) => {
          group.add(
            this.debugOverlays.createInsertionCrosshair(
              shapeData.position.x,
              shapeData.position.y,
              14
            )
          )
        })
      } else {
        const { position } = items[0].shapeData
        group.add(
          this.debugOverlays.createInsertionCrosshair(position.x, position.y, 18)
        )
      }

      shapeObjects.forEach(shapeObj => {
        group.add(shapeObj)
        if (shapeObj.box && !shapeObj.box.isEmpty()) {
          if (combinedBox === null) {
            combinedBox = shapeObj.box.clone()
          } else {
            combinedBox.union(shapeObj.box)
          }
          if (
            this.showBoundingBoxCheckbox.checked &&
            !shapeObj.box.isEmpty()
          ) {
            group.add(this.debugOverlays.createMTextBox(shapeObj.box))
          }
        }
      })

      ;(group as unknown as MTextObject).box = combinedBox ?? new THREE.Box3()
      this.currentMText = group as unknown as MTextObject
      this.viewport.scene.add(this.currentMText)

      const renderTime = performance.now() - startTime
      const label = isGrid
        ? `${shapeObjects.length} SHX shapes (128–132)`
        : `SHAPE #${items[0].shapeData.shapeNumber ?? items[0].shapeData.name ?? '?'}`
      const modeLabel = this.fontManager.isLazyFontLoading() ? 'lazy' : 'non-lazy'
      this.statusDiv.textContent = `Rendered ${label} in ${renderTime.toFixed(2)}ms (${modeLabel}; SHAPE uses main-thread sync path)`
      this.statusDiv.style.color = '#0f0'
      this.boundsHelper.rebaseSceneOrigin(this.currentMText)
      this.fitView()
    } catch (error) {
      console.error('Error rendering SHAPE:', error)
      this.statusDiv.textContent = 'Error rendering SHAPE'
      this.statusDiv.style.color = '#f00'
    }
  }

  /** Reads numeric and string SHAPE panel fields into {@link ShapeData}. */
  private readShapeDataFromInputs() {
    return buildShapeDataFromInputs({
      size: Number(this.shapeSizeInput.value) || 24,
      widthFactor: Number(this.shapeWidthFactorInput.value) || 1,
      rotationDeg: Number(this.shapeRotationInput.value) || 0,
      shapeNumber: Number(this.shapeNumberInput.value),
      shapeName: this.shapeNameInput.value.trim()
    })
  }

  /**
   * Renders MText from an example marker, multi-entity test batch, or raw format string.
   *
   * @param content - Example key (`multiple`, `attachmentGrid`, large-coordinate markers)
   *   or literal MText passed to a single-entity render.
   */
  private async renderMText(content: string): Promise<void> {
    try {
      const startTime = performance.now()
      const lazy = this.fontManager.isLazyFontLoading()
      this.statusDiv.textContent = lazy
        ? 'Rendering MText (lazy)...'
        : 'Rendering MText (non-lazy preload)...'
      this.statusDiv.style.color = '#ffa500'
      this.clearSceneContent()

      const colorSettings = this.getColorSettings()
      const textFont = this.fontManager.getSelectedTextFont()
      const multiData =
        content === 'multiple'
          ? createMultipleMTextData(textFont)
          : content === 'attachmentGrid'
            ? createAttachmentPointTestData(textFont)
            : LargeCoordinatesExample.isExample(content)
              ? LargeCoordinatesExample.createTestData(
                  this.mtextInput.value,
                  textFont
                )
              : null

      if (multiData) {
        const texts = LargeCoordinatesExample.isExample(content)
          ? LargeCoordinatesExample.parseTexts(this.mtextInput.value)
          : multiData.map(item => item.mtextData.text || '')

        if (LargeCoordinatesExample.isExample(content) && texts.length < 2) {
          this.statusDiv.textContent =
            'Large Coordinates expects two MText blocks separated by \\P\\P in the text area'
          this.statusDiv.style.color = '#f00'
          return
        }

        await this.ensureFontsLoadedForMText(texts, textFont)

        const mtextObjects = await Promise.all(
          multiData.map(({ mtextData, textStyle }) =>
            this.unifiedRenderer.asyncRenderMText(
              mtextData,
              textStyle,
              colorSettings
            )
          )
        )

        const group = new THREE.Group()
        let combinedBox: THREE.Box3 | null = null

        mtextObjects.forEach(mtextObj => {
          this.debugOverlays.attachCharBoxOverlay(
            mtextObj,
            this.showCharBoxesCheckbox.checked
          )
          this.debugOverlays.attachLineBoxOverlay(
            mtextObj,
            this.showLineBoxesCheckbox.checked
          )
          group.add(mtextObj)

          if (mtextObj.box && !mtextObj.box.isEmpty()) {
            if (combinedBox === null) {
              combinedBox = mtextObj.box.clone()
            } else {
              combinedBox.union(mtextObj.box)
            }
          }
        })

        ;(group as unknown as MTextObject).box =
          combinedBox ?? new THREE.Box3()

        this.currentMText = group as unknown as MTextObject
        this.viewport.scene.add(this.currentMText)

        if (LargeCoordinatesExample.isExample(content)) {
          LargeCoordinatesExample.layoutPair(mtextObjects)
          this.boundsHelper.refreshDrawableBounds(this.currentMText)
        } else {
          this.boundsHelper.rebaseSceneOrigin(this.currentMText)
        }

        this.debugOverlays.addMTextDebugOverlays(
          group,
          mtextObjects,
          content,
          {
            showBoundingBox: this.showBoundingBoxCheckbox.checked,
            multiData
          }
        )

        const renderTime = performance.now() - startTime
        const label =
          content === 'attachmentGrid'
            ? 'attachment-point grid'
            : content === 'largeCoordinates'
              ? 'large-coordinates MText (fonts via \\F)'
              : 'MText batch'
        this.statusDiv.textContent = this.formatRenderStatus(
          `Rendered ${mtextObjects.length}/${multiData.length} (${label}) in ${renderTime.toFixed(2)}ms`,
          lazy
        )
      } else {
        await this.ensureFontsLoadedForMText([content], textFont)

        const mtextContent: MTextData = {
          text: content,
          height: 24,
          width: 820,
          position: new THREE.Vector3(70, 530, 0)
        }

        this.currentMText = await this.unifiedRenderer.asyncRenderMText(
          mtextContent,
          {
            name: 'Standard',
            standardFlag: 0,
            fixedTextHeight: 24,
            widthFactor: 1,
            obliqueAngle: 0,
            textGenerationFlag: 0,
            lastHeight: 24,
            font: textFont,
            bigFont: ''
          },
          colorSettings
        )

        this.debugOverlays.attachCharBoxOverlay(
          this.currentMText,
          this.showCharBoxesCheckbox.checked
        )
        this.debugOverlays.attachLineBoxOverlay(
          this.currentMText,
          this.showLineBoxesCheckbox.checked
        )
        this.viewport.scene.add(this.currentMText)
        this.boundsHelper.rebaseSceneOrigin(this.currentMText)

        if (
          this.showBoundingBoxCheckbox.checked &&
          this.currentMText.box &&
          !this.currentMText.box.isEmpty()
        ) {
          const box = this.debugOverlays.createMTextBox(
            this.boundsHelper.getOverlayBounds(
              this.currentMText,
              this.currentMText.box
            )
          )
          this.currentMText.add(box)
        }

        const renderTime = performance.now() - startTime
        this.statusDiv.textContent = this.formatRenderStatus(
          `MText rendered in ${renderTime.toFixed(2)}ms`,
          lazy
        )
      }

      this.statusDiv.style.color = '#0f0'
      this.fitView()
    } catch (error) {
      console.error('Error rendering MText:', error)
      this.statusDiv.textContent = 'Error rendering MText'
      this.statusDiv.style.color = '#f00'
    }
  }

  /** Appends lazy/non-lazy and thread mode details to a render status line. */
  private formatRenderStatus(base: string, lazy: boolean): string {
    const mode = lazy ? 'lazy' : 'non-lazy'
    const thread = this.renderModeSelect.value
    if (lazy && this.lazyFontsLoadedSinceRender.length > 0) {
      return `${base} (${mode}, ${thread}) · loaded [${this.lazyFontsLoadedSinceRender.join(', ')}]`
    }
    if (lazy && !this.isAutoLazyRedraw) {
      return `${base} (${mode}, ${thread}) · waiting for fontLoaded if fonts are missing`
    }
    return `${base} (${mode}, ${thread})`
  }
}

const app = new MTextRendererExample()

window.addEventListener('beforeunload', () => {
  app.destroy()
})
