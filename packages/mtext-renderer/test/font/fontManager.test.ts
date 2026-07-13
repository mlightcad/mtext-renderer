import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/cache', () => ({
  FontCacheManager: {
    instance: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(false)
    }
  }
}))

vi.mock('../../src/font/fontFactory', () => ({
  FontFactory: {
    instance: {
      createFont: vi.fn()
    }
  }
}))

import { FontManager } from '../../src/font/fontManager'
import {
  DEFAULT_FONTS_PRESETS,
  SYMBOL_FONTS_PRESETS
} from '../../src/font/defaultFontsPresets'
import { FontCacheManager } from '../../src/cache'
import { FontFactory } from '../../src/font/fontFactory'
import { FontInfo, FontLoader, FontLoadStatus } from '../../src/font/fontLoader'

function createFontLoader(baseUrl: string): FontLoader {
  let currentBaseUrl = baseUrl
  return {
    load: vi.fn<FontLoader['load']>().mockResolvedValue([] as FontLoadStatus[]),
    getAvailableFonts: vi
      .fn<FontLoader['getAvailableFonts']>()
      .mockResolvedValue([] as FontInfo[]),
    get baseUrl() {
      return currentBaseUrl
    },
    set baseUrl(value: string) {
      currentBaseUrl = value
    }
  }
}

function createFakeFont(overrides: Record<string, unknown> = {}) {
  return {
    names: new Set<string>(),
    type: 'shx',
    unsupportedChars: { '?': 1 },
    hasChar: vi.fn().mockReturnValue(false),
    getCharShape: vi.fn(),
    getCodeShape: vi.fn(),
    getScaleFactor: vi.fn().mockReturnValue(1),
    getNotFoundTextShape: vi.fn(),
    dispose: vi.fn(),
    estimateMemoryUsage: vi.fn().mockReturnValue({
      names: [],
      type: 'shx',
      sourceByteLength: 0,
      parsedFontEstimatedBytes: 0,
      charGeometryCache: { entries: 0, maxEntries: 4096, estimatedBytes: 0 },
      estimatedBytes: 0
    }),
    ...overrides
  }
}

describe('FontManager', () => {
  beforeEach(() => {
    const manager = FontManager.instance as any
    manager.release()
    manager.fontMapping = {}
    manager.missedFonts = {}
    manager.unsupportedChars = {}
    manager.fileNames = []
    manager.enableFontCache = true
    manager.defaultFonts = new Set(['simkai'])
    manager.symbolFonts = new Set(['amgdt'])
  })

  afterEach(() => {
    FontManager.instance.release()
    vi.clearAllMocks()
  })

  it('delegates baseUrl get and set to the configured font loader', () => {
    const loader = createFontLoader('https://old.example.com/fonts/')
    const manager = FontManager.instance

    manager.setFontLoader(loader)
    manager.baseUrl = 'https://new.example.com/fonts/'

    expect(manager.baseUrl).toBe('https://new.example.com/fonts/')
    expect(loader.baseUrl).toBe('https://new.example.com/fonts/')
  })

  it('gets available fonts through the configured font loader', async () => {
    const fonts: FontInfo[] = [
      {
        name: ['TestFont'],
        file: 'test.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/test.shx'
      }
    ]
    const loader = createFontLoader('https://cdn.example.com/fonts/')
    vi.mocked(loader.getAvailableFonts).mockResolvedValue(fonts)
    vi.mocked(FontCacheManager.instance.getAll).mockResolvedValue([])
    const manager = FontManager.instance

    manager.setFontLoader(loader)
    const result = await manager.getAvailableFonts()

    expect(loader.getAvailableFonts).toHaveBeenCalledOnce()
    expect(result).toEqual([
      {
        name: ['TestFont'],
        file: 'test.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/test.shx',
        source: 'remote'
      }
    ])
  })

  it('merges cache-only fonts into the available font list', async () => {
    const loader = createFontLoader('https://cdn.example.com/fonts/')
    vi.mocked(loader.getAvailableFonts).mockResolvedValue([
      {
        name: ['Romans'],
        file: 'romans.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/romans.shx'
      }
    ])
    vi.mocked(FontCacheManager.instance.getAll).mockResolvedValue([
      {
        name: 'customfont',
        alias: ['customfont', 'MyCustom'],
        type: 'shx',
        data: new ArrayBuffer(4)
      },
      {
        name: 'romans',
        alias: ['Romans'],
        type: 'shx',
        data: new ArrayBuffer(4)
      }
    ])
    FontManager.instance.setFontLoader(loader)

    const result = await FontManager.instance.getAvailableFonts()

    expect(result).toEqual([
      {
        name: ['customfont', 'MyCustom'],
        file: 'customfont.shx',
        type: 'shx',
        url: '',
        source: 'cache'
      },
      {
        name: ['Romans'],
        file: 'romans.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/romans.shx',
        source: 'remote'
      }
    ])
  })

  it('loads fonts by names through the configured font loader', async () => {
    const loader = createFontLoader('https://cdn.example.com/fonts/')
    vi.mocked(loader.load).mockResolvedValue([
      {
        fontName: 'simkai',
        url: 'https://cdn.example.com/fonts/simkai.shx',
        status: 'Success'
      }
    ])
    const manager = FontManager.instance
    manager.setFontLoader(loader)

    const result = await manager.loadDefaultFont()

    expect(loader.load).toHaveBeenCalledWith(['simkai', 'amgdt'])
    expect(result).toEqual([
      {
        fontName: 'simkai',
        url: 'https://cdn.example.com/fonts/simkai.shx',
        status: 'Success'
      }
    ])
  })

  it('finds mapped replacement fonts when the requested font is missing', () => {
    const manager = FontManager.instance as any
    manager.loadedFontMap.set('replacement', createFakeFont())
    FontManager.instance.setFontMapping({ Missing: 'replacement' })

    expect(FontManager.instance.findAndReplaceFont('Missing')).toBe(
      'replacement'
    )
    expect(FontManager.instance.findAndReplaceFont('Unknown')).toBe('simkai')
  })

  it('finds fonts by name, strips common font extensions, and records misses', () => {
    const manager = FontManager.instance as any
    const listener = vi.fn()
    const font = createFakeFont()
    manager.loadedFontMap.set('arial', font)
    FontManager.instance.events.fontNotFound.addEventListener(listener)

    expect(FontManager.instance.getFontByName('arial.shx')).toBe(font)
    expect(FontManager.instance.getFontByName('missing.ttf')).toBeUndefined()

    expect(FontManager.instance.missedFonts).toEqual({ missing: 1 })
    expect(listener).toHaveBeenCalledWith({ fontName: 'missing', count: 1 })
    FontManager.instance.events.fontNotFound.removeEventListener(listener)
  })

  it('does not fall back when the requested font lacks a glyph', () => {
    const manager = FontManager.instance as any
    const primary = createFakeFont({
      hasChar: vi.fn().mockReturnValue(false),
      getCharShape: vi.fn()
    })
    const fallback = createFakeFont({
      hasChar: vi.fn((char: string) => char === '中'),
      getCharShape: vi.fn().mockReturnValue({ width: 1 })
    })
    manager.defaultFonts = new Set(['fallback'])
    manager.loadedFontMap.set('primary', primary)
    manager.loadedFontMap.set('fallback', fallback)

    expect(
      FontManager.instance.getCharShape('中', 'primary', 12)
    ).toBeUndefined()
    expect(primary.getCharShape).toHaveBeenCalledWith('中', 12)
    expect(fallback.getCharShape).not.toHaveBeenCalled()
  })

  it('falls back through defaultFonts via getCharShapeFromDefaults', () => {
    const shape = { width: 1 }
    const manager = FontManager.instance as any
    const fallback = createFakeFont({
      hasChar: vi.fn((char: string) => char === '中'),
      getCharShape: vi.fn().mockReturnValue(shape)
    })
    manager.defaultFonts = new Set(['fallback'])
    manager.loadedFontMap.set('fallback', fallback)

    expect(FontManager.instance.getCharShapeFromDefaults('中', 12)).toBe(shape)
    expect(fallback.getCharShape).toHaveBeenCalledWith('中', 12)
  })

  it('skips default fonts that hasChar but cannot build a shape', () => {
    const shape = { width: 1 }
    const manager = FontManager.instance as any
    const falsePositive = createFakeFont({
      hasChar: vi.fn().mockReturnValue(true),
      getCharShape: vi.fn().mockReturnValue(undefined)
    })
    const fallback = createFakeFont({
      hasChar: vi.fn().mockReturnValue(false),
      getCharShape: vi.fn().mockReturnValue(shape)
    })
    manager.defaultFonts = new Set(['falsepositive', 'fallback'])
    manager.loadedFontMap.set('falsepositive', falsePositive)
    manager.loadedFontMap.set('fallback', fallback)

    expect(FontManager.instance.getCharShapeFromDefaults('中', 12)).toBe(shape)
    expect(falsePositive.getCharShape).toHaveBeenCalledWith('中', 12)
    expect(fallback.getCharShape).toHaveBeenCalledWith('中', 12)
  })

  it('prefers symbolFonts for AutoCAD control-code glyphs', () => {
    const meshShape = { width: 99 }
    const symbolShape = { width: 2.85 }
    const manager = FontManager.instance as any
    const mesh = createFakeFont({
      hasChar: vi.fn((char: string) => char === '°'),
      getCharShape: vi.fn().mockReturnValue(meshShape)
    })
    const symbol = createFakeFont({
      hasCode: vi.fn((code: number) => code === 0xb0),
      getCodeShape: vi.fn().mockReturnValue(symbolShape)
    })
    manager.defaultFonts = new Set(['simsun'])
    manager.symbolFonts = new Set(['amgdt'])
    manager.loadedFontMap.set('simsun', mesh)
    manager.loadedFontMap.set('amgdt', symbol)

    expect(FontManager.instance.getCharShapeFromDefaults('°', 10)).toBe(
      meshShape
    )
    expect(FontManager.instance.getCodeShapeFromSymbolFonts(0xb0, 10)).toBe(
      symbolShape
    )
    expect(mesh.getCharShape).toHaveBeenCalled()
    expect(symbol.getCodeShape).toHaveBeenCalledWith(0xb0, 10)
  })

  it('finds fonts by character without using getCharShape on a missing font name', () => {
    const manager = FontManager.instance as any
    const font = createFakeFont({
      hasChar: vi.fn((char: string) => char === 'A'),
      getCharShape: vi.fn().mockReturnValue({ width: 1 })
    })
    manager.loadedFontMap.set('fallback', font)

    expect(FontManager.instance.getFontByChar('A')).toBe(font)
    expect(FontManager.instance.getCharShape('A', 'missing', 12)).toBeUndefined()
  })

  it('returns font metadata helpers from loaded fonts', () => {
    const notFoundShape = { width: 2 }
    const manager = FontManager.instance as any
    manager.loadedFontMap.set(
      'arial',
      createFakeFont({
        type: 'mesh',
        getScaleFactor: vi.fn().mockReturnValue(0.75),
        getNotFoundTextShape: vi.fn().mockReturnValue(notFoundShape)
      })
    )

    expect(FontManager.instance.isFontLoaded('Arial')).toBe(true)
    expect(FontManager.instance.getFontScaleFactor('arial')).toBe(0.75)
    expect(FontManager.instance.getFontType('arial')).toBe('mesh')
    expect(FontManager.instance.getNotFoundTextShape(12)).toBe(notFoundShape)
    expect(FontManager.instance.getUnsupportedChar()).toEqual({ '?': 1 })
  })

  it('releases all fonts or a single requested font', () => {
    const manager = FontManager.instance as any
    const arial = createFakeFont()
    const romans = createFakeFont()
    manager.loadedFontMap.set('arial', arial)
    manager.loadedFontMap.set('romans', romans)

    expect(FontManager.instance.release('arial')).toBe(true)
    expect(arial.dispose).toHaveBeenCalledOnce()
    expect(FontManager.instance.isFontLoaded('arial')).toBe(false)
    expect(FontManager.instance.release('missing')).toBe(false)
    expect(FontManager.instance.release()).toBe(true)
    expect(romans.dispose).toHaveBeenCalledOnce()
    expect(manager.loadedFontMap.size).toBe(0)
  })

  it('loads font files, creates fonts, caches them, and reports statuses', async () => {
    const manager = FontManager.instance as any
    const buffer = new ArrayBuffer(8)
    const font = createFakeFont()
    manager.loader = {
      loadAsync: vi.fn().mockResolvedValue(buffer)
    }
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    const statuses = await FontManager.instance.loadFonts({
      name: ['RomanS', 'RomansAlt'],
      file: 'romans.shx',
      type: 'shx',
      url: 'https://cdn.example.com/fonts/romans.shx'
    })

    expect(manager.loader.loadAsync).toHaveBeenCalledWith(
      'https://cdn.example.com/fonts/romans.shx'
    )
    expect(FontFactory.instance.createFont).toHaveBeenCalledWith({
      name: 'romans',
      alias: ['RomanS', 'RomansAlt'],
      type: 'shx',
      encoding: undefined,
      data: buffer
    })
    expect(FontCacheManager.instance.set).toHaveBeenCalledWith('romans', {
      name: 'romans',
      alias: ['RomanS', 'RomansAlt'],
      type: 'shx',
      encoding: undefined,
      data: buffer
    })
    expect(font.names).toEqual(new Set(['RomanS', 'RomansAlt']))
    expect(FontManager.instance.isFontLoaded('romans')).toBe(true)
    expect(statuses).toEqual([
      {
        fontName: 'romans',
        url: 'https://cdn.example.com/fonts/romans.shx',
        status: 'Success'
      }
    ])
  })

  it('sets default and symbol fonts from a preset', () => {
    const manager = FontManager.instance

    manager.setDefaultFonts('r12r14')
    expect([...manager.defaultFonts]).toEqual([
      ...DEFAULT_FONTS_PRESETS.r12r14
    ])
    expect([...manager.symbolFonts]).toEqual([
      ...SYMBOL_FONTS_PRESETS.r12r14
    ])

    manager.setDefaultFonts('modern')
    expect([...manager.defaultFonts]).toEqual([...DEFAULT_FONTS_PRESETS.modern])
    expect([...manager.symbolFonts]).toEqual([...SYMBOL_FONTS_PRESETS.modern])
  })

  it('sets custom default fonts without changing symbol fonts', () => {
    const manager = FontManager.instance

    manager.setDefaultFonts('modern')
    manager.setDefaultFonts(['hztxt', 'simsun'])
    expect([...manager.defaultFonts]).toEqual(['hztxt', 'simsun'])
    expect([...manager.symbolFonts]).toEqual([...SYMBOL_FONTS_PRESETS.modern])

    manager.setDefaultFonts('simkai')
    expect([...manager.defaultFonts]).toEqual(['simkai'])

    manager.setSymbolFonts(['amgdt', 'gdt'])
    expect([...manager.symbolFonts]).toEqual(['amgdt', 'gdt'])
  })

  it('returns preset font names via getDefaultFontsPreset and getSymbolFontsPreset', () => {
    expect(FontManager.instance.getDefaultFontsPreset('cjk')).toEqual(
      DEFAULT_FONTS_PRESETS.cjk
    )
    expect(FontManager.instance.getSymbolFontsPreset('cjk')).toEqual(
      SYMBOL_FONTS_PRESETS.cjk
    )
  })

  it('loads default and symbol fonts configured by preset', async () => {
    const loader = createFontLoader('https://cdn.example.com/fonts/')
    vi.mocked(loader.load).mockResolvedValue([])
    const manager = FontManager.instance
    manager.setFontLoader(loader)
    manager.setDefaultFonts('modern')

    await manager.loadDefaultFont()

    expect(loader.load).toHaveBeenCalledWith(['hztxt', 'simsun', 'simplex', 'amgdt'])
  })

  it('resolves fonts by alias names after loading', async () => {
    const manager = FontManager.instance as any
    const buffer = new ArrayBuffer(8)
    const shape = { width: 1 }
    const font = createFakeFont({
      names: new Set([
        'simfang',
        'FangSong_GB2312',
        '仿宋',
        '仿宋_GB2312',
        '华文仿宋'
      ]),
      type: 'mesh',
      hasChar: vi.fn().mockReturnValue(true),
      getCharShape: vi.fn().mockReturnValue(shape),
      getScaleFactor: vi.fn().mockReturnValue(0.8)
    })
    manager.loader = {
      loadAsync: vi.fn().mockResolvedValue(buffer)
    }
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    await FontManager.instance.loadFonts({
      name: ['simfang', 'FangSong_GB2312', '仿宋', '仿宋_GB2312', '华文仿宋'],
      file: 'simfang.woff',
      type: 'mesh',
      url: 'https://cdn.example.com/fonts/simfang.woff'
    })

    expect(FontManager.instance.isFontLoaded('simfang')).toBe(true)
    expect(FontManager.instance.isFontLoaded('仿宋_GB2312')).toBe(true)
    expect(FontManager.instance.isFontLoaded('仿宋_gb2312')).toBe(true)
    expect(FontManager.instance.getFontByName('仿宋_GB2312')).toBe(font)
    expect(FontManager.instance.getFontByName('仿宋_gb2312')).toBe(font)
    expect(FontManager.instance.getFontScaleFactor('仿宋_GB2312')).toBe(0.8)
    expect(FontManager.instance.getFontType('华文仿宋')).toBe('mesh')
    expect(FontManager.instance.findAndReplaceFont('仿宋_gb2312')).toBe(
      '仿宋_gb2312'
    )
    expect(FontManager.instance.getCharShape('仿', '仿宋_GB2312', 12)).toBe(
      shape
    )
  })

  it('releases a font and all of its alias entries', () => {
    const manager = FontManager.instance as any
    const font = createFakeFont({
      names: new Set(['simfang', '仿宋_GB2312'])
    })
    manager.loadedFontMap.set('simfang', font)
    manager.loadedFontMap.set('仿宋_gb2312', font)

    expect(FontManager.instance.release('仿宋_GB2312')).toBe(true)
    expect(FontManager.instance.isFontLoaded('simfang')).toBe(false)
    expect(FontManager.instance.isFontLoaded('仿宋_GB2312')).toBe(false)
    expect(manager.loadedFontMap.size).toBe(0)
  })

  it('adds cached fonts to the available font library after cacheFont succeeds', async () => {
    const cacheStore = new Map<
      string,
      {
        name: string
        alias?: string[]
        type: 'shx' | 'mesh'
        encoding?: string
        data: ArrayBuffer
      }
    >()
    vi.mocked(FontCacheManager.instance.set).mockImplementation(
      async (name, fontData) => {
        cacheStore.set(name, fontData)
      }
    )
    vi.mocked(FontCacheManager.instance.getAll).mockImplementation(async () => [
      ...cacheStore.values()
    ])

    const loader = createFontLoader('https://cdn.example.com/fonts/')
    vi.mocked(loader.getAvailableFonts).mockResolvedValue([
      {
        name: ['Romans'],
        file: 'romans.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/romans.shx'
      }
    ])
    FontManager.instance.setFontLoader(loader)

    const buffer = new ArrayBuffer(8)
    const font = createFakeFont({
      names: new Set(['customfont', 'CustomFont', 'MyCustom'])
    })
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    const status = await FontManager.instance.cacheFont(
      buffer,
      'CustomFont.shx',
      ['MyCustom']
    )
    expect(status.status).toBe('Success')

    const available = await FontManager.instance.getAvailableFonts()

    expect(available).toEqual([
      {
        name: ['customfont', 'CustomFont', 'MyCustom'],
        file: 'customfont.shx',
        type: 'shx',
        url: '',
        encoding: undefined,
        source: 'cache'
      },
      {
        name: ['Romans'],
        file: 'romans.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/romans.shx',
        source: 'remote'
      }
    ])
  })

  it('caches uploaded SHX fonts and registers them for rendering', async () => {
    const manager = FontManager.instance as any
    const buffer = new ArrayBuffer(8)
    const font = createFakeFont({ names: new Set(['custom', 'CustomFont']) })
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    const status = await FontManager.instance.cacheFont(
      buffer,
      'CustomFont.shx',
      ['MyCustom']
    )

    expect(FontFactory.instance.createFont).toHaveBeenCalledWith({
      name: 'customfont',
      alias: ['customfont', 'CustomFont', 'MyCustom'],
      type: 'shx',
      encoding: undefined,
      data: buffer
    })
    expect(FontCacheManager.instance.set).toHaveBeenCalledWith('customfont', {
      name: 'customfont',
      alias: ['customfont', 'CustomFont', 'MyCustom'],
      type: 'shx',
      encoding: undefined,
      data: buffer
    })
    expect(FontManager.instance.isFontLoaded('customfont')).toBe(true)
    expect(FontManager.instance.isFontLoaded('MyCustom')).toBe(true)
    expect(status).toEqual({
      fontName: 'customfont',
      url: '',
      status: 'Success'
    })
    expect(manager.fileNames).toEqual([])
  })

  it('caches uploaded TTF and WOFF fonts as mesh fonts', async () => {
    const buffer = new ArrayBuffer(8)
    const ttfFont = createFakeFont({
      names: new Set(['simkai']),
      type: 'mesh'
    })
    const woffFont = createFakeFont({
      names: new Set(['simfang']),
      type: 'mesh'
    })
    vi.mocked(FontFactory.instance.createFont)
      .mockReturnValueOnce(ttfFont as any)
      .mockReturnValueOnce(woffFont as any)

    const ttfStatus = await FontManager.instance.cacheFont(
      buffer,
      'simkai.ttf',
      ['楷体']
    )
    const woffStatus = await FontManager.instance.cacheFont(
      buffer,
      'simfang.woff'
    )

    expect(FontFactory.instance.createFont).toHaveBeenNthCalledWith(1, {
      name: 'simkai',
      alias: ['simkai', '楷体'],
      type: 'mesh',
      encoding: undefined,
      data: buffer
    })
    expect(FontFactory.instance.createFont).toHaveBeenNthCalledWith(2, {
      name: 'simfang',
      alias: ['simfang'],
      type: 'mesh',
      encoding: undefined,
      data: buffer
    })
    expect(FontManager.instance.isFontLoaded('simkai')).toBe(true)
    expect(FontManager.instance.isFontLoaded('楷体')).toBe(true)
    expect(FontManager.instance.isFontLoaded('simfang')).toBe(true)
    expect(ttfStatus.status).toBe('Success')
    expect(woffStatus.status).toBe('Success')
  })

  it('rejects unsupported uploaded font extensions', async () => {
    const status = await FontManager.instance.cacheFont(
      new ArrayBuffer(8),
      'custom.woff2'
    )

    expect(FontFactory.instance.createFont).not.toHaveBeenCalled()
    expect(status).toEqual({
      fontName: 'custom',
      url: '',
      status: 'FailedToLoad'
    })
  })

  it('loads fonts on demand from IndexedDB cache by name or alias', async () => {
    const manager = FontManager.instance as any
    const font = createFakeFont({ names: new Set(['customfont', 'MyCustom']) })
    const cachedFontData = {
      name: 'customfont',
      alias: ['customfont', 'MyCustom'],
      type: 'shx' as const,
      encoding: undefined,
      data: new ArrayBuffer(4)
    }
    vi.mocked(FontCacheManager.instance.find).mockResolvedValue(cachedFontData)
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    const loaded = await FontManager.instance.loadFontFromCache('MyCustom.shx')

    expect(FontCacheManager.instance.find).toHaveBeenCalledWith('MyCustom.shx')
    expect(FontFactory.instance.createFont).toHaveBeenCalledWith(cachedFontData)
    expect(FontManager.instance.isFontLoaded('customfont')).toBe(true)
    expect(FontManager.instance.isFontLoaded('MyCustom')).toBe(true)
    expect(loaded).toBe(true)
  })

  it('skips IndexedDB lookup when font caching is disabled', async () => {
    FontManager.instance.enableFontCache = false

    const loaded = await FontManager.instance.loadFontFromCache('customfont')

    expect(FontCacheManager.instance.find).not.toHaveBeenCalled()
    expect(loaded).toBe(false)
  })

  it('loads fonts from cache without requesting the font URL', async () => {
    const manager = FontManager.instance as any
    const font = createFakeFont({ names: new Set(['Romans']) })
    const cachedFontData = {
      name: 'romans',
      alias: ['Romans'],
      type: 'shx' as const,
      encoding: undefined,
      data: new ArrayBuffer(4)
    }
    manager.loader = {
      loadAsync: vi.fn()
    }
    vi.mocked(FontCacheManager.instance.get).mockResolvedValue(cachedFontData)
    vi.mocked(FontFactory.instance.createFont).mockReturnValue(font as any)

    const statuses = await FontManager.instance.loadFonts({
      name: ['Romans'],
      file: 'romans.shx',
      type: 'shx',
      url: 'https://cdn.example.com/fonts/romans.shx'
    })

    expect(manager.loader.loadAsync).not.toHaveBeenCalled()
    expect(FontFactory.instance.createFont).toHaveBeenCalledWith(cachedFontData)
    expect(FontManager.instance.isFontLoaded('romans')).toBe(true)
    expect(FontManager.instance.isFontLoaded('Romans')).toBe(true)
    expect(FontManager.instance.getFontByName('Romans')).toBe(font)
    expect(statuses[0].status).toBe('Success')
  })

  it('estimates memory once per font instance when aliases share the same object', () => {
    const manager = FontManager.instance as any
    const font = createFakeFont({
      names: new Set(['simfang', '仿宋_gb2312']),
      estimateMemoryUsage: vi.fn().mockReturnValue({
        names: ['simfang', '仿宋_gb2312'],
        type: 'mesh',
        sourceByteLength: 1000,
        parsedFontEstimatedBytes: 2500,
        charGeometryCache: { entries: 0, maxEntries: 4096, estimatedBytes: 0 },
        estimatedBytes: 2500
      })
    })
    manager.loadedFontMap.set('simfang', font)
    manager.loadedFontMap.set('仿宋_gb2312', font)

    const stats = FontManager.instance.estimateMemoryUsage({ id: 'main' })

    expect(font.estimateMemoryUsage).toHaveBeenCalledOnce()
    expect(stats.fonts).toHaveLength(1)
    expect(stats.totalEstimatedBytes).toBe(2500)
    expect(stats.materials.estimatedBytes).toBe(0)
  })
})
