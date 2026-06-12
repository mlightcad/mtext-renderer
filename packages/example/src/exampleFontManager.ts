import {
  DefaultFontsPreset,
  FontInfo,
  UnifiedRenderer
} from '@mlightcad/mtext-renderer'

/**
 * Manages font discovery, preset application, local caching, and `<select>` UI
 * for the interactive MText renderer example.
 *
 * @remarks
 * Wraps {@link UnifiedRenderer} font APIs and synchronizes the text-style and SHAPE
 * font dropdowns with {@link refreshAvailableFonts}. Status messages are written
 * directly to the shared `#status` element passed at construction time.
 */
export class ExampleFontManager {
  /** File extensions accepted by {@link cacheSelectedFontFile}. */
  private readonly supportedFontExtensions = new Set([
    '.shx',
    '.ttf',
    '.otf',
    '.woff'
  ])

  /**
   * @param unifiedRenderer - Renderer whose font registry is queried and updated.
   * @param statusDiv - `#status` element for user-facing progress and error text.
   * @param fontSelect - Text-style font `<select>` (`#font-select`).
   * @param shapeFontSelect - SHAPE font `<select>` (`#shape-font-select`); SHX fonts only.
   * @param defaultFontsPresetSelect - Default-fonts preset `<select>`.
   * @param fontCacheInput - File input for local font caching.
   * @param fontCacheBtn - Button that triggers {@link cacheSelectedFontFile}.
   */
  constructor(
    private readonly unifiedRenderer: UnifiedRenderer,
    private readonly statusDiv: HTMLDivElement,
    private readonly fontSelect: HTMLSelectElement,
    private readonly shapeFontSelect: HTMLSelectElement,
    private readonly defaultFontsPresetSelect: HTMLSelectElement,
    private readonly fontCacheInput: HTMLInputElement,
    private readonly fontCacheBtn: HTMLButtonElement
  ) {}

  /** @returns Currently selected primary text font from `#font-select`. */
  getSelectedTextFont(): string {
    return this.fontSelect.value
  }

  /** @returns Currently selected SHX font for SHAPE rendering. */
  getSelectedShapeFont(): string {
    return this.shapeFontSelect.value
  }

  /** @returns Active default-fonts preset identifier from the UI. */
  getSelectedDefaultFontsPreset(): DefaultFontsPreset {
    return this.defaultFontsPresetSelect.value as DefaultFontsPreset
  }

  /**
   * Bootstraps font lists and applies the current preset.
   *
   * @param isResetAvailableFonts - When true, repopulates selects from the renderer first.
   * @throws Rethrows errors from font loading so the caller can show a fatal status message.
   */
  async initialize(isResetAvailableFonts = true): Promise<void> {
    if (isResetAvailableFonts) {
      await this.refreshAvailableFonts()
    }
    await this.applyDefaultFontsPreset()
  }

  /**
   * Applies the selected preset, loads all fonts in the text and symbol chains, and
   * updates the status line with the resolved fallback order.
   */
  async applyDefaultFontsPreset(): Promise<void> {
    const preset = this.getSelectedDefaultFontsPreset()
    await this.unifiedRenderer.setDefaultFonts(preset)
    const textChain = this.unifiedRenderer.getDefaultFontsPreset(preset)
    const symbolChain = this.unifiedRenderer.getSymbolFontsPreset(preset)
    const fontsToLoad = [
      ...new Set([
        ...textChain,
        ...symbolChain,
        this.fontSelect.value,
        this.shapeFontSelect.value
      ])
    ]
    await this.unifiedRenderer.loadFonts(fontsToLoad)
    this.statusDiv.textContent = `Preset "${preset}": text ${textChain.join(' → ')} | symbol ${symbolChain.join(' → ')}`
    this.statusDiv.style.color = '#0f0'
  }

  /**
   * Refreshes both font `<select>` elements from {@link UnifiedRenderer.getAvailableFonts}.
   *
   * @param selectedTextFont - Optional text font to preserve after repopulating.
   * @param selectedShapeFont - Optional SHAPE font to preserve after repopulating.
   * @returns Full font metadata list returned by the renderer.
   */
  async refreshAvailableFonts(
    selectedTextFont?: string,
    selectedShapeFont?: string
  ): Promise<FontInfo[]> {
    const result = await this.unifiedRenderer.getAvailableFonts()
    const fonts = result.fonts as FontInfo[]
    this.populateFontSelects(fonts, selectedTextFont, selectedShapeFont)
    return fonts
  }

  /**
   * Caches the file chosen in `#font-cache-input`, refreshes UI, and re-renders.
   *
   * @param onCached - Async callback invoked after a successful cache (typically re-render).
   */
  async cacheSelectedFontFile(onCached: () => Promise<void>): Promise<void> {
    const file = this.fontCacheInput.files?.[0]
    if (!file) {
      this.statusDiv.textContent = 'Select a font file to cache'
      this.statusDiv.style.color = '#f00'
      return
    }

    if (!this.isSupportedFontFile(file)) {
      this.statusDiv.textContent =
        'Unsupported font type. Use .shx, .ttf, .otf, or .woff'
      this.statusDiv.style.color = '#f00'
      return
    }

    try {
      this.statusDiv.textContent = `Caching ${file.name}...`
      this.statusDiv.style.color = '#ffa500'
      this.fontCacheBtn.disabled = true

      const status = await this.unifiedRenderer.cacheFont(file)
      if (status.status !== 'Success') {
        this.statusDiv.textContent = `Failed to cache ${file.name}`
        this.statusDiv.style.color = '#f00'
        return
      }

      await this.refreshAvailableFonts(status.fontName, status.fontName)
      await this.applyDefaultFontsPreset()
      await onCached()

      this.statusDiv.textContent = `Cached and loaded ${file.name} (${status.fontName})`
      this.statusDiv.style.color = '#0f0'
      this.fontCacheInput.value = ''
    } catch (error) {
      console.error('Error caching font:', error)
      this.statusDiv.textContent = 'Error caching font'
      this.statusDiv.style.color = '#f00'
    } finally {
      this.fontCacheBtn.disabled = !this.fontCacheInput.files?.[0]
    }
  }

  /** Enables or disables the cache button based on whether a file is selected. */
  updateCacheButtonState(): void {
    this.fontCacheBtn.disabled = !this.fontCacheInput.files?.[0]
  }

  /** @returns Lowercase extension including the dot, or empty string when absent. */
  private getFontExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.')
    if (dotIndex < 0) {
      return ''
    }
    return fileName.slice(dotIndex).toLowerCase()
  }

  /** @returns Whether `file` has an extension listed in {@link supportedFontExtensions}. */
  private isSupportedFontFile(file: File): boolean {
    return this.supportedFontExtensions.has(this.getFontExtension(file.name))
  }

  /**
   * Formats a font entry for `<option>` display.
   *
   * @param font - Font metadata from the renderer registry.
   * @returns Primary name, suffixed with `[cached]` when loaded from IndexedDB.
   */
  private formatFontLabel(font: FontInfo): string {
    const label = font.name[0]
    return font.source === 'cache' ? `${label} [cached]` : label
  }

  /**
   * Rebuilds `#font-select` and `#shape-font-select` from available fonts.
   *
   * @param fonts - Complete font list from the renderer.
   * @param selectedTextFont - Preferred text font; falls back to `simkai` when unmatched.
   * @param selectedShapeFont - Preferred SHAPE font; falls back to `complex` when unmatched.
   */
  private populateFontSelects(
    fonts: FontInfo[],
    selectedTextFont?: string,
    selectedShapeFont?: string
  ): void {
    const previousTextFont = selectedTextFont ?? this.fontSelect.value
    const previousShapeFont = selectedShapeFont ?? this.shapeFontSelect.value

    this.fontSelect.innerHTML = ''
    this.shapeFontSelect.innerHTML = ''

    let textFontMatched = false
    let shapeFontMatched = false

    const matchesSelection = (
      font: FontInfo,
      selectedName: string
    ): boolean =>
      font.name.some(
        name => name.toLowerCase() === selectedName.toLowerCase()
      )

    fonts.forEach(font => {
      const option = document.createElement('option')
      option.value = font.name[0]
      option.textContent = this.formatFontLabel(font)
      if (matchesSelection(font, previousTextFont)) {
        option.selected = true
        textFontMatched = true
      } else if (!textFontMatched && font.name[0] === 'simkai') {
        option.selected = true
        textFontMatched = true
      }
      this.fontSelect.appendChild(option)

      if (font.type === 'shx' || font.file.toLowerCase().endsWith('.shx')) {
        const shapeOption = document.createElement('option')
        shapeOption.value = font.name[0]
        shapeOption.textContent = this.formatFontLabel(font)
        if (matchesSelection(font, previousShapeFont)) {
          shapeOption.selected = true
          shapeFontMatched = true
        } else if (!shapeFontMatched && font.name[0] === 'complex') {
          shapeOption.selected = true
          shapeFontMatched = true
        }
        this.shapeFontSelect.appendChild(shapeOption)
      }
    })
  }
}
