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
   * @returns Promise that resolves to an array of FontInfo objects
   * @throws {Error} If font metadata cannot be loaded from the CDN
   */
  async getAvailableFonts() {
    if (this._avaiableFonts.length == 0) {
      const fontMetaDataUrl = this._baseUrl + 'fonts.json'
      try {
        const response = await fetch(fontMetaDataUrl)
        this._avaiableFonts = (await response.json()) as FontInfo[]
      } catch (error) {
        throw new Error(
          `Filed to get avaiable font from '${fontMetaDataUrl}' due to ${error}!`
        )
      }

      this._avaiableFonts.forEach(font => {
        font.url = this._baseUrl + font.file
      })
    }
    this.buildFontMap()
    return this._avaiableFonts
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
