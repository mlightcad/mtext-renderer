import * as THREE from 'three'

import { FontCacheManager } from '../cache'
import {
  EventManager,
  getExtension,
  getFileName,
  getFileNameWithoutExtension
} from '../common'
import { BaseFont } from './baseFont'
import { BaseTextShape } from './baseTextShape'
import { DefaultFontLoader } from './defaultFontLoader'
import {
  DEFAULT_FONTS_PRESETS,
  DefaultFontsPreset,
  isDefaultFontsPreset,
  SYMBOL_FONTS_PRESETS
} from './defaultFontsPresets'
import { FontData, FontType } from './font'
import { FontFactory } from './fontFactory'
import { FontInfo, FontLoader, FontLoadStatus } from './fontLoader'

/**
 * Font mappings configuration.
 * Maps original font names to their replacement font names.
 * - The key is the original font name
 * - The value is the mapped font name
 */
export type FontMapping = Record<string, string>

/**
 * Event arguments for font-related events.
 */
export interface FontManagerEventArgs {
  /** Name of font which can't be found */
  fontName: string
  /** The number of characters which use this font. This is only used when the font is not found. */
  count?: number
}

/**
 * Manages font loading, caching, and text rendering.
 * This class is responsible for:
 * - Loading fonts from URLs or cache
 * - Managing font mappings and replacements
 * - Providing text shapes for rendering
 * - Tracking unsupported characters and missed fonts
 */
export class FontManager {
  private static _instance: FontManager
  /** THREE.js file loader for loading font files */
  private loader: THREE.FileLoader
  /** Font loader which can be swapped by users */
  private fontLoader: FontLoader
  /** Mapping of original font names to their replacements */
  protected fontMapping: FontMapping = {}
  /** Map of loaded fonts, keyed by font name */
  protected loadedFontMap: Map<string, BaseFont> = new Map()
  /** List of font file names that have been loaded */
  protected fileNames: string[]
  /** Record of characters that are not supported by any loaded font */
  public unsupportedChars: Record<string, number> = {}
  /** Record of fonts that were requested but not found */
  public missedFonts: Record<string, number> = {}
  /** Flag to enable/disable font caching */
  public enableFontCache = true
  /**
   * Default fonts to use when a requested font is not found or lacks a glyph.
   * Insertion order is preserved; earlier entries are tried first.
   */
  public defaultFonts = new Set<string>(['simkai'])
  /**
   * GDT / SHX symbol fonts for AutoCAD control-code glyphs (`%%c`, `%%d`, `%%p`,
   * `%%nnn`, etc.). Separate from {@link defaultFonts} so text fallbacks are not
   * polluted by symbol-font code-point matches.
   */
  public symbolFonts = new Set<string>(['simplex', 'amgdt'])

  /** Event managers for font-related events */
  public readonly events = {
    /** Event triggered when a font cannot be found */
    fontNotFound: new EventManager<FontManagerEventArgs>(),
    /** Event triggered when a font is successfully loaded */
    fontLoaded: new EventManager<FontManagerEventArgs>()
  }

  private constructor() {
    this.loader = new THREE.FileLoader()
    this.loader.setResponseType('arraybuffer')
    this.fileNames = []
    // Default font loader; users may replace this instance
    this.fontLoader = new DefaultFontLoader()
  }

  /**
   * Gets the singleton instance of the FontManager
   * @returns The FontManager instance
   */
  public static get instance(): FontManager {
    if (!FontManager._instance) {
      FontManager._instance = new FontManager()
    }
    return FontManager._instance
  }

  /**
   * Base URL to load fonts
   */
  get baseUrl() {
    return this.fontLoader.baseUrl
  }
  set baseUrl(value: string) {
    this.fontLoader.baseUrl = value
  }

  /**
   * Sets the font mapping configuration
   * @param mapping - The font mapping to set
   */
  setFontMapping(mapping: FontMapping) {
    this.fontMapping = mapping
  }

  /**
   * Sets the default font fallback chain.
   *
   * Pass a {@link DefaultFontsPreset} name to apply a predefined AutoCAD-era
   * fallback stack, or pass one or more font names to define a custom chain.
   * Earlier entries are tried first when a glyph is missing.
   *
   * @param fonts - A preset name, a single font name, or an ordered list of font names
   * @example
   * ```ts
   * FontManager.instance.setDefaultFonts('r12r14')
   * FontManager.instance.setDefaultFonts(['hztxt', 'simsun', 'gdt'])
   * FontManager.instance.setDefaultFonts('simkai')
   * ```
   */
  setDefaultFonts(fonts: DefaultFontsPreset): void
  setDefaultFonts(fonts: string | readonly string[]): void
  setDefaultFonts(fonts: DefaultFontsPreset | string | readonly string[]) {
    if (typeof fonts === 'string' && isDefaultFontsPreset(fonts)) {
      this.defaultFonts = new Set(DEFAULT_FONTS_PRESETS[fonts])
      this.symbolFonts = new Set(SYMBOL_FONTS_PRESETS[fonts])
      return
    }
    const list = typeof fonts === 'string' ? [fonts] : [...fonts]
    this.defaultFonts = new Set(list)
  }

  /**
   * Sets the symbol-font fallback chain for AutoCAD control-code glyphs.
   *
   * Pass a {@link DefaultFontsPreset} name to apply a predefined symbol stack,
   * or pass one or more font names to define a custom chain.
   *
   * @param fonts - A preset name, a single font name, or an ordered list of font names
   */
  setSymbolFonts(fonts: DefaultFontsPreset): void
  setSymbolFonts(fonts: string | readonly string[]): void
  setSymbolFonts(fonts: DefaultFontsPreset | string | readonly string[]) {
    if (typeof fonts === 'string' && isDefaultFontsPreset(fonts)) {
      this.symbolFonts = new Set(SYMBOL_FONTS_PRESETS[fonts])
      return
    }
    const list = typeof fonts === 'string' ? [fonts] : [...fonts]
    this.symbolFonts = new Set(list)
  }

  /**
   * Returns the font names for a predefined default-font preset.
   * @param preset - The preset to look up
   */
  getDefaultFontsPreset(preset: DefaultFontsPreset): readonly string[] {
    return DEFAULT_FONTS_PRESETS[preset]
  }

  /**
   * Returns the symbol-font names for a predefined preset.
   * @param preset - The preset to look up
   */
  getSymbolFontsPreset(preset: DefaultFontsPreset): readonly string[] {
    return SYMBOL_FONTS_PRESETS[preset]
  }

  /**
   * Font names that should be loaded for the active default and symbol chains.
   */
  getFontsToLoad(): readonly string[] {
    return [...new Set([...this.defaultFonts, ...this.symbolFonts])]
  }

  /**
   * Sets the font loader
   * @param fontLoader - The font loader to set
   */
  setFontLoader(fontLoader: FontLoader) {
    this.fontLoader = fontLoader
  }

  /**
   * Retrieves information about all available fonts in the system.
   * Merges remote font metadata with fonts stored in IndexedDB (cache-only
   * entries are included; remote entries win when names collide).
   * @returns Promise that resolves to an array of FontInfo objects
   * @throws {Error} If font metadata cannot be loaded from the CDN
   */
  async getAvailableFonts(): Promise<FontInfo[]> {
    const remoteFonts = await this.fontLoader.getAvailableFonts()
    if (!this.enableFontCache) {
      return remoteFonts.map(font => ({ ...font, source: 'remote' as const }))
    }

    const fontMap = new Map<string, FontInfo>()
    for (const font of remoteFonts) {
      const key = getFileNameWithoutExtension(font.file).toLowerCase()
      fontMap.set(key, { ...font, source: 'remote' })
    }

    const cachedFonts = await FontCacheManager.instance.getAll()
    for (const cached of cachedFonts) {
      const key = cached.name.toLowerCase()
      if (fontMap.has(key)) {
        continue
      }
      fontMap.set(key, this.cachedFontDataToFontInfo(cached))
    }

    return [...fontMap.values()].sort((a, b) =>
      a.name[0].localeCompare(b.name[0], undefined, { sensitivity: 'base' })
    )
  }

  /**
   * Return true if all default fonts were loaded.
   * @returns True if every font in `defaultFonts` is loaded. False otherwise.
   */
  isDefaultFontLoaded() {
    for (const fontName of this.getFontsToLoad()) {
      if (this.loadedFontMap.get(fontName.toLowerCase()) == null) {
        return false
      }
    }
    return this.defaultFonts.size > 0 || this.symbolFonts.size > 0
  }

  /**
   * Loads all default and symbol fonts
   * @returns Promise that resolves to the font load statuses
   */
  async loadDefaultFont() {
    return await this.loadFontsByNames(this.getFontsToLoad())
  }

  /**
   * Loads the specified fonts from font names
   * @param names - Font names to load.
   * @returns Promise that resolves to an array of font load statuses
   */
  async loadFontsByNames(
    names: string | readonly string[]
  ): Promise<FontLoadStatus[]> {
    const list = typeof names === 'string' ? [names] : [...names]
    return await this.fontLoader.load(list)
  }

  /**
   * Parses a user-uploaded font file, registers it for rendering, and stores
   * it in IndexedDB when {@link enableFontCache} is true.
   *
   * Supported formats: `.shx`, `.ttf`, `.otf`, `.woff`.
   *
   * @param data - Font file contents or a browser `File` selected by the user
   * @param fileName - Font file name (e.g. `custom.shx`, `simkai.ttf`). Required when `data` is an `ArrayBuffer`
   * @param aliases - Optional alias names for the font (e.g. AutoCAD style names)
   * @param encoding - Optional character encoding for SHX bigfonts
   * @returns Promise that resolves to the font load status
   */
  async cacheFont(
    data: ArrayBuffer | File,
    fileName?: string,
    aliases?: string[],
    encoding?: string
  ): Promise<FontLoadStatus> {
    let buffer: ArrayBuffer
    let resolvedFileName: string

    if (typeof File !== 'undefined' && data instanceof File) {
      buffer = await data.arrayBuffer()
      resolvedFileName = fileName ?? data.name
    } else {
      buffer = data as ArrayBuffer
      resolvedFileName = fileName ?? ''
    }

    if (!resolvedFileName) {
      throw new Error('fileName is required when caching an ArrayBuffer')
    }

    const fontName = getFileNameWithoutExtension(resolvedFileName).toLowerCase()
    if (!fontName) {
      return {
        fontName: '',
        url: '',
        status: 'FailedToLoad'
      }
    }

    const fontType = this.resolveUploadedFontType(resolvedFileName)
    if (!fontType) {
      return {
        fontName,
        url: '',
        status: 'FailedToLoad'
      }
    }

    if (this.isFontLoaded(fontName)) {
      return {
        fontName,
        url: '',
        status: 'Success'
      }
    }

    const aliasList = this.buildUploadedFontAliases(
      fontName,
      resolvedFileName,
      aliases
    )
    const fontData: FontData = {
      name: fontName,
      alias: aliasList,
      type: fontType,
      encoding,
      data: buffer
    }

    try {
      const font = FontFactory.instance.createFont(fontData)
      aliasList.forEach(name => font.names.add(name))
      this.registerFontInMap(fontName, font)

      if (this.enableFontCache) {
        await FontCacheManager.instance.set(fontName, fontData)
      }

      this.events.fontLoaded.dispatch({ fontName })
      return {
        fontName,
        url: '',
        status: 'Success'
      }
    } catch {
      return {
        fontName,
        url: '',
        status: 'FailedToLoad'
      }
    }
  }

  /**
   * Loads a font from IndexedDB by primary name or alias.
   * No-op when {@link enableFontCache} is false.
   *
   * @param fontName - Font name or alias (with or without file extension)
   * @returns True if the font was found in cache and registered for rendering
   */
  async loadFontFromCache(fontName: string): Promise<boolean> {
    if (!this.enableFontCache || !fontName) {
      return false
    }

    const normalized = getFileNameWithoutExtension(fontName).toLowerCase()
    if (this.isFontLoaded(normalized)) {
      return true
    }

    const fontData = await FontCacheManager.instance.find(fontName)
    if (!fontData) {
      return false
    }

    try {
      const font = FontFactory.instance.createFont(fontData)
      fontData.alias?.forEach(name => font.names.add(name))
      this.registerFontInMap(fontData.name, font)
      this.events.fontLoaded.dispatch({ fontName: fontData.name })
      return true
    } catch {
      return false
    }
  }

  /**
   * Loads the specified fonts from URLs
   * @param urls - URLs of font files to load.
   * @returns Promise that resolves to an array of font load statuses
   */
  async loadFonts(fonts: FontInfo | FontInfo[]) {
    fonts = Array.isArray(fonts) ? fonts : [fonts]
    const promises: Promise<void>[] = []
    for (let i = 0; i < fonts.length; i++) {
      promises.push(this.loadFont(fonts[i]))
    }

    const status: FontLoadStatus[] = []
    await Promise.allSettled(promises).then(results => {
      results.forEach((result, index) => {
        const isSuccess = result.status === 'fulfilled'
        const url = fonts[index].url
        const fontName = getFileNameWithoutExtension(url.toLowerCase())
        status.push({
          fontName: fontName,
          url: url,
          status: isSuccess ? 'Success' : 'FailedToLoad'
        })
        if (isSuccess) {
          this.fileNames.push(fontName)
        }
      })
    })
    return status
  }

  /**
   * Tries to find the specified font. If not found, uses a replacement font and returns its name.
   * @param fontName - The font name to find
   * @returns The original font name if found, or the replacement font name if not found
   */
  findAndReplaceFont(fontName: string) {
    let font = this.loadedFontMap.get(fontName.toLowerCase())
    if (font == null) {
      const mappedFontName = this.fontMapping[fontName]
      if (mappedFontName) {
        font = this.loadedFontMap.get(mappedFontName.toLowerCase())
        return mappedFontName
      }
    }
    if (font) {
      return fontName
    }
    for (const defaultFontName of this.defaultFonts) {
      if (this.loadedFontMap.has(defaultFontName.toLowerCase())) {
        return defaultFontName
      }
    }
    return [...this.defaultFonts][0] ?? ''
  }

  /**
   * Gets font by font name. Return undefined if not found.
   * @param fontName - The font name to find
   * @param recordMissedFonts - Record the font name to property `missedFonts` in this class
   * if the specified font name not found.
   * @returns The font with the specified font name, or undefined if not found
   */
  public getFontByName(
    fontName: string,
    recordMissedFonts: boolean = true
  ): BaseFont | undefined {
    if (this.loadedFontMap.size === 0) {
      return
    }
    if (fontName == null) {
      fontName = '' // take null/undefined as empty
    }

    // Check if font name contain file extension
    const dotIndex = fontName.lastIndexOf('.')
    if (
      (dotIndex > 0 && dotIndex == fontName.length - 4) ||
      dotIndex == fontName.length - 5
    ) {
      // Remove extension of font file name
      fontName = fontName.substring(0, dotIndex)
    }
    const currentFont = this.loadedFontMap.get(fontName.toLowerCase())
    if (!currentFont) {
      if (recordMissedFonts) {
        this.recordMissedFonts(fontName)
      }
      return undefined
    }
    return currentFont
  }

  /**
   * Gets the first font which contains the specified character.
   * @param char - The character to get the shape for
   * @returns The text shape for the character, or undefined if not found
   */
  public getFontByChar(char: string): BaseFont | undefined {
    // Try all fonts until we find one that can render the character
    for (const [, font] of this.loadedFontMap) {
      if (font.hasChar(char)) {
        return font
      }
    }
    return undefined
  }

  /**
   * Gets the text shape for a specific character in the named font only.
   * Does not fall back to bigFont, default fonts, or other loaded fonts.
   * @param char - The character to get the shape for
   * @param fontName - The name of the font to use
   * @param size - The size of the character
   * @returns The text shape for the character, or undefined if not found
   */
  public getCharShape(
    char: string,
    fontName: string,
    size: number
  ): BaseTextShape | undefined {
    const currentFont = this.getFontByName(fontName)
    return currentFont?.getCharShape(char, size)
  }

  /**
   * Resolves a named SHX shape glyph from the specified font.
   */
  public getShapeByName(
    name: string,
    fontName: string,
    size: number
  ): BaseTextShape | undefined {
    const currentFont = this.getFontByName(fontName)
    return currentFont?.getShapeByName(name, size)
  }

  /**
   * Resolves an SHX shape glyph by numeric character code from the specified font.
   */
  public getShapeByCode(
    code: number,
    fontName: string,
    size: number
  ): BaseTextShape | undefined {
    const currentFont = this.getFontByName(fontName)
    return currentFont?.getCodeShape(code, size)
  }

  /**
   * Gets the text shape from the first loaded default font that contains the character.
   * Used after primary and optional bigFont lookups per AutoCAD text-style semantics.
   */
  public getCharShapeFromDefaults(
    char: string,
    size: number
  ): BaseTextShape | undefined {
    for (const fontName of this.defaultFonts) {
      const font = this.loadedFontMap.get(fontName.toLowerCase())
      const shape = font?.getCharShape(char, size)
      if (shape) {
        return shape
      }
    }
    return undefined
  }

  /**
   * Gets the text shape from configured GDT / symbol fonts (e.g. `amgdt.shx`)
   * by font-internal character code.
   *
   * AutoCAD `%%` symbols resolve against SHX code points (e.g. 126, 129, 132),
   * not Unicode text semantics. Use {@link BaseFont.getCodeShape} so BIGFONT and
   * Unicode SHX fonts are queried consistently.
   */
  public getCodeShapeFromSymbolFonts(
    code: number,
    size: number
  ): BaseTextShape | undefined {
    for (const fontName of this.symbolFonts) {
      const font = this.loadedFontMap.get(fontName.toLowerCase())
      const shape = font?.getCodeShape(code, size)
      if (shape) {
        return shape
      }
    }
    return undefined
  }

  /**
   * Gets the scale factor for a specific font
   * @param fontName - The name of the font
   * @returns The scale factor for the font, or 1 if the font is not found
   */
  getFontScaleFactor(fontName: string) {
    const font = this.loadedFontMap.get(fontName.toLowerCase())
    return font ? font.getScaleFactor() : 1
  }

  /**
   * Gets type of the specific font
   * @param fontName - The name of the font
   * @returns The type of the font. If the specified font can't be found, `undefined` is returned
   */
  getFontType(fontName: string): FontType | undefined {
    const font = this.loadedFontMap.get(fontName.toLowerCase())
    return font?.type
  }

  /**
   * Gets the shape to display when a character is not found
   * @param size - The size of the shape
   * @returns The shape for the not found indicator, or undefined if not available
   */
  getNotFoundTextShape(size: number) {
    for (const [, font] of this.loadedFontMap) {
      const s = font.getNotFoundTextShape(size)
      if (s) return s
    }
    return
  }

  /**
   * Checks if a font is already loaded in the system
   * @param fontName - The name of the font to check
   * @returns True if the font is loaded, false otherwise
   */
  isFontLoaded(fontName: string): boolean {
    return this.loadedFontMap.has(fontName.toLowerCase())
  }

  /**
   * Records a font that was requested but not found
   * @param fontName - The name of the font that was not found
   */
  private recordMissedFonts(fontName: string) {
    if (fontName) {
      if (!this.missedFonts[fontName]) {
        this.missedFonts[fontName] = 0
      }
      this.missedFonts[fontName]++
      this.events.fontNotFound.dispatch({
        fontName: fontName,
        count: this.missedFonts[fontName]
      })
    }
  }

  /**
   * Loads a single font
   * @param fontInfo - The matadata of the font to be loaded
   */
  private async loadFont(fontInfo: FontInfo) {
    const fileName = getFileName(fontInfo.file)
    if (!fileName) {
      throw new Error(`Invalid font file name: ${fontInfo.file}`)
    }

    const fontData = this.fontInfoToFontData(fontInfo)
    const fontName = fontData.name
    if (this.isFontLoaded(fontData.name)) {
      return
    }

    const data = await FontCacheManager.instance.get(fontName)
    if (data) {
      const font = FontFactory.instance.createFont(data)
      this.registerFontInMap(fontName, font)
    } else {
      const buffer = (await this.loader.loadAsync(fontInfo.url)) as ArrayBuffer
      fontData.data = buffer
      const font = FontFactory.instance.createFont(fontData)
      if (font) {
        fontInfo.name.forEach(name => font.names.add(name))
        this.registerFontInMap(fontName, font)
        if (this.enableFontCache) {
          await FontCacheManager.instance.set(fontName, fontData)
        }
      }
    }

    this.events.fontLoaded.dispatch({
      fontName: fontName
    })
  }

  private fontInfoToFontData(fontInfo: FontInfo) {
    const fontName = getFileNameWithoutExtension(fontInfo.file).toLowerCase()
    const type = ['ttf', 'otf', 'woff'].includes(fontInfo.type)
      ? 'mesh'
      : fontInfo.type
    return {
      name: fontName,
      alias: fontInfo.name,
      type: type,
      encoding: fontInfo.encoding
    } as FontData
  }

  /**
   * Loads all fonts from the cache
   */
  async getAllFontsFromCache() {
    if (this.loadedFontMap.size !== 0) {
      return
    }
    const fontFileDatas = await FontCacheManager.instance.getAll()
    for (const fontFileData of fontFileDatas) {
      const { name } = fontFileData
      if (this.fileNames && !this.fileNames.includes(name)) {
        continue
      }
      const font = FontFactory.instance.createFont(fontFileData)
      this.registerFontInMap(name, font)
    }
  }

  private cachedFontDataToFontInfo(data: FontData): FontInfo {
    const file = `${data.name}.${data.type === 'shx' ? 'shx' : 'ttf'}`
    const names =
      data.alias && data.alias.length > 0 ? [...data.alias] : [data.name]
    return {
      name: names,
      file,
      type: data.type,
      url: '',
      encoding: data.encoding,
      source: 'cache'
    }
  }

  private resolveUploadedFontType(fileName: string): FontType | undefined {
    const ext = getExtension(fileName).toLowerCase()
    if (ext === 'shx') {
      return 'shx'
    }
    if (['ttf', 'otf', 'woff'].includes(ext)) {
      return 'mesh'
    }
    return undefined
  }

  private buildUploadedFontAliases(
    fontName: string,
    fileName: string,
    aliases?: string[]
  ): string[] {
    const names = new Set<string>()
    names.add(fontName)
    names.add(getFileNameWithoutExtension(fileName))
    aliases?.forEach(alias => {
      if (alias) {
        names.add(alias)
      }
    })
    return [...names]
  }

  /**
   * Registers a loaded font under its primary name and all aliases.
   */
  private registerFontInMap(primaryName: string, font: BaseFont) {
    this.loadedFontMap.set(primaryName.toLowerCase(), font)
    font.names.forEach(name => {
      this.loadedFontMap.set(name.toLowerCase(), font)
    })
  }

  /**
   * Gets a record of all unsupported characters across all loaded fonts
   * @returns A record mapping unsupported characters to their occurrence count
   */
  public getUnsupportedChar() {
    for (const [, font] of this.loadedFontMap) {
      Object.assign(this.unsupportedChars, font.unsupportedChars)
    }
    return this.unsupportedChars
  }

  /**
   * Releases loaded fonts from memory.
   *
   * - If no argument is provided, all loaded fonts are released and the font map is cleared.
   * - If a font name is provided, only that specific font is released from the font map.
   *
   * This is useful for freeing up memory, especially when working with large font files (e.g., Chinese mesh fonts).
   * Notes: Based on testing, one Chinese mesh font file may take 40M memory.
   *
   * @param fontToRelease - (Optional) The name of the font to release. If omitted, all fonts are released.
   * @returns `true` if the operation succeeded (all fonts released or the specified font was found and deleted), `false` if the specified font was not found.
   */
  release(fontToRelease?: string) {
    if (fontToRelease == null) {
      this.loadedFontMap.clear()
      return true
    }
    const font = this.loadedFontMap.get(fontToRelease.toLowerCase())
    if (!font) {
      return false
    }
    for (const [key, value] of this.loadedFontMap) {
      if (value === font) {
        this.loadedFontMap.delete(key)
      }
    }
    return true
  }
}
