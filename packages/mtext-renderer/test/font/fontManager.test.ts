import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/cache', () => ({
  FontCacheManager: {
    instance: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([])
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
    const manager = FontManager.instance

    manager.setFontLoader(loader)
    const result = await manager.getAvailableFonts()

    expect(loader.getAvailableFonts).toHaveBeenCalledOnce()
    expect(result).toBe(fonts)
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
    manager.loadedFontMap.set('arial', createFakeFont())
    manager.loadedFontMap.set('romans', createFakeFont())

    expect(FontManager.instance.release('arial')).toBe(true)
    expect(FontManager.instance.isFontLoaded('arial')).toBe(false)
    expect(FontManager.instance.release('missing')).toBe(false)
    expect(FontManager.instance.release()).toBe(true)
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
})
