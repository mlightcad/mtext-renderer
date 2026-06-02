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
    manager.defaultFont = 'simkai'
    manager.defaultMeshFont = 'simkai'
    manager.defaultShxFont = 'txt'
    manager.defaultShxBigFont = 'hztxt'
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

    expect(loader.load).toHaveBeenCalledWith(['simkai', 'txt', 'hztxt'])
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
    expect(FontManager.instance.findAndReplaceFont('missing.shx')).toBe('txt')
    expect(FontManager.instance.findAndReplaceFont('missing', 'shx')).toBe(
      'txt'
    )
    expect(
      FontManager.instance.findAndReplaceFont('missing_big', 'shx', 'shxBigFont')
    ).toBe('hztxt')
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

  it('finds fonts by character and falls back by character when a named font is missing', () => {
    const shape = { width: 1 }
    const manager = FontManager.instance as any
    const font = createFakeFont({
      hasChar: vi.fn((char: string) => char === 'A'),
      getCharShape: vi.fn().mockReturnValue(shape)
    })
    manager.loadedFontMap.set('fallback', font)

    expect(FontManager.instance.getFontByChar('A')).toBe(font)
    expect(FontManager.instance.getCharShape('A', 'missing', 12)).toBe(shape)
    expect(font.getCharShape).toHaveBeenCalledWith('A', 12)
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

  it('loads fonts from cache without requesting the font URL', async () => {
    const manager = FontManager.instance as any
    const font = createFakeFont()
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
    expect(statuses[0].status).toBe('Success')
  })
})
