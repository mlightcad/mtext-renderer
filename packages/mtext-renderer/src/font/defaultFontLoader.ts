import { FontInfo, FontLoader, FontLoadStatus } from './fontLoader'
import { FontManager } from './fontManager'

/**
 * Default implementation of the FontLoader interface.
 * This class provides font loading functionality using [this font repository](https://mlightcad.gitlab.io/cad-data/fonts/).
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
    this._baseUrl = 'https://mlightcad.gitlab.io/cad-data/fonts/'
  }

  /**
   * Base URL to load fonts
   */
  get baseUrl() {
    return this._baseUrl
  }
  set baseUrl(value: string) {
    this._baseUrl = value
  }

  /**
   * Gets the list of available fonts
   * @returns Array of FontInfo objects describing available fonts
   */
  get avaiableFonts() {
    return this._avaiableFonts
  }

  /**
   * Retrieves information about all available fonts in the system.
   * Loads font metadata from a CDN if not already loaded.
   * @returns Promise that resolves to an array of FontInfo objects
   * @throws {Error} If font metadata cannot be loaded from the CDN
   */
  async getAvaiableFonts() {
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
  async load(fontNames: string[]) {
    if (fontNames == null || fontNames.length === 0) {
      return []
    }
    await this.getAvaiableFonts()

    const alreadyLoadedStatuses: FontLoadStatus[] = []
    const fontsToLoad: FontInfo[] = []
    fontNames.forEach(font => {
      const lowerCaseFontName = font.toLowerCase()
      const fontInfo = this._avaiableFontMap.get(lowerCaseFontName)
      if (fontInfo) {
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
    const newlyLoadedStatuses = await FontManager.instance.loadFonts(fontsToLoad)

    // Merge and return statuses for all requested fonts, preserving order
    const statusMap: Record<string, FontLoadStatus> = {}
    ;[...alreadyLoadedStatuses, ...newlyLoadedStatuses].forEach(s => {
      statusMap[s.fontName] = s
    })
    return fontNames.map(font => {
      const lowerCaseFontName = font.toLowerCase()
      return (
        statusMap[lowerCaseFontName] || {
          fontName: lowerCaseFontName,
          url: '',
          status: 'NotFound'
        }
      )
    })
  }

  /**
   * Build one font map. The key is font name. The value is font info.
   */
  private buildFontMap() {
    const fontMap = this._avaiableFontMap
    this._avaiableFonts.forEach(font => {
      font.name.forEach(name => {
        fontMap.set(name.toLocaleLowerCase(), font)
      })
    })
  }
}
