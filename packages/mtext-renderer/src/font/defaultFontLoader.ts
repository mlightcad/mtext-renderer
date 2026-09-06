import { getFileNameWithoutExtension } from '../common'
import { FontInfo, FontLoader, FontLoadStatus } from './fontLoader'
import { FontManager } from './fontManager'

/**
 * Default implementation of the FontLoader interface.
 * This class provides font loading functionality using [this font repository](https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/).
 * It loads font metadata from a JSON file and provides access to available fonts.
 */
export class DefaultFontLoader implements FontLoader {
  /** List of available fonts in the system */
  private _avaiableFonts: FontInfo[]
  private _baseUrl: string
  private _avaiableFontMap: Map<string, FontInfo>
  /**
   * Shared in-flight metadata fetch. Concurrent {@link getAvailableFonts} /
   * {@link load} callers (common with lazy per-entity font requests) must not
   * each hit `fonts.json` independently.
   */
  private _availableFontsPromise: Promise<FontInfo[]> | null = null

  /**
   * Creates a new instance of DefaultFontLoader
   */
  constructor() {
    this._avaiableFonts = []
    this._avaiableFontMap = new Map()
    this._baseUrl = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'
  }

  /**
   * Base URL to load fonts
   */
  get baseUrl() {
    return this._baseUrl
  }
  set baseUrl(value: string) {
    if (this._baseUrl === value) {
      return
    }
    this._baseUrl = value
    this._avaiableFonts = []
    this._avaiableFontMap.clear()
    this._availableFontsPromise = null
    this.onFontUrlChanged(value)
  }

  /**
   * Gets the list of available fonts
   * @returns Array of FontInfo objects describing available fonts
   */
  get avaiableFonts() {
    return this._avaiableFonts
  }

  /**
   * Triggered when font url changed
   * @param url - New font url value
   */
  onFontUrlChanged(url: string) {
    // Do nothing for now
  }

  /**
   * Retrieves information about all available fonts in the system.
   * Loads font metadata from a CDN if not already loaded.
   * Concurrent callers share one in-flight fetch so `fonts.json` is requested
   * at most once per loader instance / baseUrl.
   * @returns Promise that resolves to an array of FontInfo objects
   * @throws {Error} If font metadata cannot be loaded from the CDN
   */
  async getAvailableFonts() {
    if (this._avaiableFonts.length > 0) {
      this.buildFontMap()
      return this._avaiableFonts
    }
    if (this._availableFontsPromise) {
      return this._availableFontsPromise
    }

    const baseUrl = this._baseUrl
    const promise = this.fetchAvailableFonts(baseUrl).finally(() => {
      // Only clear if this promise is still the active one (a newer fetch may
      // have started after baseUrl changed, including A→B→A cycles).
      if (this._availableFontsPromise === promise) {
        this._availableFontsPromise = null
      }
    })
    this._availableFontsPromise = promise
    return promise
  }

  /**
   * Loads the specified fonts into the system. If one font is already loaded,
   * the font will not be loaded again. If no font names are provided, just loads
   * all available fonts information (not fonts).
   * @param fontNames - Array of font names to load
   * @returns Promise that resolves to an array of FontLoadStatus objects
   */
  async load(fontNames: readonly string[]): Promise<FontLoadStatus[]> {
    if (fontNames == null || fontNames.length === 0) {
      return []
    }
    await this.getAvailableFonts()

    const alreadyLoadedStatuses: FontLoadStatus[] = []
    const fontsToLoad: FontInfo[] = []
    const requestedFontInfos = new Map<string, FontInfo>()
    fontNames.forEach(font => {
      const lowerCaseFontName = font.toLowerCase()
      const fontInfo = this._avaiableFontMap.get(lowerCaseFontName)
      if (fontInfo) {
        requestedFontInfos.set(lowerCaseFontName, fontInfo)
        if (FontManager.instance.isFontLoaded(lowerCaseFontName)) {
          alreadyLoadedStatuses.push({
            fontName: lowerCaseFontName,
            url: fontInfo.url,
            status: 'Success'
          })
        }
        fontsToLoad.push(fontInfo)
      }
    })
    const newlyLoadedStatuses =
      await FontManager.instance.loadFonts(fontsToLoad)

    // Merge and return statuses for all requested fonts, preserving order.
    // FontManager reports status by file name; alias requests need remapping.
    const statusMap: Record<string, FontLoadStatus> = {}
    ;[...alreadyLoadedStatuses, ...newlyLoadedStatuses].forEach(s => {
      statusMap[s.fontName] = s
    })

    const statuses: FontLoadStatus[] = []
    for (const font of fontNames) {
      const lowerCaseFontName = font.toLowerCase()
      const directStatus = statusMap[lowerCaseFontName]
      if (directStatus) {
        statuses.push(directStatus)
        continue
      }

      const fontInfo = requestedFontInfos.get(lowerCaseFontName)
      if (fontInfo) {
        if (FontManager.instance.isFontLoaded(lowerCaseFontName)) {
          statuses.push({
            fontName: lowerCaseFontName,
            url: fontInfo.url,
            status: 'Success'
          })
          continue
        }

        const fileBaseName = getFileNameWithoutExtension(
          fontInfo.file
        ).toLowerCase()
        const loadedByFile = statusMap[fileBaseName]
        if (loadedByFile) {
          statuses.push({
            fontName: lowerCaseFontName,
            url: fontInfo.url,
            status: loadedByFile.status
          })
          continue
        }
      }

      if (await FontManager.instance.loadFontFromCache(font)) {
        statuses.push({
          fontName: lowerCaseFontName,
          url: '',
          status: 'Success'
        })
        continue
      }

      statuses.push({
        fontName: lowerCaseFontName,
        url: '',
        status: 'NotFound'
      })
    }
    return statuses
  }

  /**
   * Fetches and caches remote font metadata for the given base URL.
   */
  private async fetchAvailableFonts(baseUrl: string): Promise<FontInfo[]> {
    const fontMetaDataUrl = baseUrl + 'fonts.json'
    let fonts: FontInfo[]
    try {
      const response = await fetch(fontMetaDataUrl)
      fonts = (await response.json()) as FontInfo[]
    } catch (error) {
      throw new Error(
        `Filed to get avaiable font from '${fontMetaDataUrl}' due to ${error}!`
      )
    }

    // Stale response after baseUrl changed — discard and load for the new URL.
    if (this._baseUrl !== baseUrl) {
      return this.getAvailableFonts()
    }

    fonts.forEach(font => {
      font.url = baseUrl + font.file
    })
    this._avaiableFonts = fonts
    this.buildFontMap()
    return this._avaiableFonts
  }

  /**
   * Build one font map. The key is font name. The value is font info.
   */
  private buildFontMap() {
    const fontMap = this._avaiableFontMap
    this._avaiableFonts.forEach(font => {
      font.name.forEach(name => {
        fontMap.set(name.toLowerCase(), font)
      })
    })
  }
}
