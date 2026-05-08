import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/font/fontManager', () => ({
  FontManager: {
    instance: {
      isFontLoaded: vi.fn().mockReturnValue(false),
      loadFonts: vi.fn().mockResolvedValue([])
    }
  }
}))

import { DefaultFontLoader } from '../../src/font/defaultFontLoader'
import { FontManager } from '../../src/font/fontManager'
import { FontInfo } from '../../src/font/fontLoader'

const oldFonts: FontInfo[] = [
  {
    name: ['OldFont', 'old'],
    file: 'old.shx',
    type: 'shx',
    url: ''
  }
]

const newFonts: FontInfo[] = [
  {
    name: ['NewFont'],
    file: 'new.shx',
    type: 'shx',
    url: ''
  }
]

function jsonResponse(fonts: FontInfo[]) {
  return {
    json: vi.fn().mockResolvedValue(fonts.map(font => ({ ...font })))
  }
}

describe('DefaultFontLoader', () => {
  beforeEach(() => {
    vi.mocked(FontManager.instance.isFontLoaded).mockReturnValue(false)
    vi.mocked(FontManager.instance.loadFonts).mockResolvedValue([])
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(oldFonts))
        .mockResolvedValueOnce(jsonResponse(newFonts))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads font metadata and assigns font URLs from baseUrl', async () => {
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    const fonts = await loader.getAvailableFonts()

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/fonts/fonts.json'
    )
    expect(fonts).toEqual([
      {
        name: ['OldFont', 'old'],
        file: 'old.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/old.shx'
      }
    ])
  })

  it('uses cached metadata while baseUrl stays the same', async () => {
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    await loader.getAvailableFonts()
    await loader.getAvailableFonts()

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('reloads metadata from the new baseUrl after baseUrl changes', async () => {
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://old.example.com/fonts/'

    await loader.getAvailableFonts()
    loader.baseUrl = 'https://new.example.com/fonts/'
    const fonts = await loader.getAvailableFonts()

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://old.example.com/fonts/fonts.json'
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://new.example.com/fonts/fonts.json'
    )
    expect(fonts).toEqual([
      {
        name: ['NewFont'],
        file: 'new.shx',
        type: 'shx',
        url: 'https://new.example.com/fonts/new.shx'
      }
    ])
  })

  it('notifies when baseUrl changes', () => {
    const loader = new DefaultFontLoader()
    const onFontUrlChanged = vi.spyOn(loader, 'onFontUrlChanged')

    loader.baseUrl = 'https://cdn.example.com/fonts/'
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    expect(onFontUrlChanged).toHaveBeenCalledOnce()
    expect(onFontUrlChanged).toHaveBeenCalledWith(
      'https://cdn.example.com/fonts/'
    )
  })

  it('returns empty statuses and does not fetch when no font names are provided', async () => {
    const loader = new DefaultFontLoader()

    await expect(loader.load([])).resolves.toEqual([])

    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads requested fonts by name and preserves NotFound statuses', async () => {
    vi.mocked(FontManager.instance.loadFonts).mockResolvedValue([
      {
        fontName: 'old',
        url: 'https://cdn.example.com/fonts/old.shx',
        status: 'Success'
      }
    ])
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    const statuses = await loader.load(['old', 'MissingFont'])

    expect(FontManager.instance.loadFonts).toHaveBeenCalledWith([
      {
        name: ['OldFont', 'old'],
        file: 'old.shx',
        type: 'shx',
        url: 'https://cdn.example.com/fonts/old.shx'
      }
    ])
    expect(statuses).toEqual([
      {
        fontName: 'old',
        url: 'https://cdn.example.com/fonts/old.shx',
        status: 'Success'
      },
      {
        fontName: 'missingfont',
        url: '',
        status: 'NotFound'
      }
    ])
  })

  it('returns success immediately for already loaded requested fonts', async () => {
    vi.mocked(FontManager.instance.isFontLoaded).mockReturnValue(true)
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    const statuses = await loader.load(['old'])

    expect(statuses).toEqual([
      {
        fontName: 'old',
        url: 'https://cdn.example.com/fonts/old.shx',
        status: 'Success'
      }
    ])
  })

  it('throws a contextual error when font metadata cannot be loaded', async () => {
    vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error('network down'))
    const loader = new DefaultFontLoader()
    loader.baseUrl = 'https://cdn.example.com/fonts/'

    await expect(loader.getAvailableFonts()).rejects.toThrow(
      "Filed to get avaiable font from 'https://cdn.example.com/fonts/fonts.json'"
    )
  })
})
