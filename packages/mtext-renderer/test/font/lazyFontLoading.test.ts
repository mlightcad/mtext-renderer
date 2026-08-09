import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontManager } from '../../src/font/fontManager'

describe('FontManager lazy font loading', () => {
  beforeEach(() => {
    FontManager.instance.release()
    FontManager.instance.lazyFontLoading = true
    FontManager.instance.defaultFonts = new Set(['simkai'])
    FontManager.instance.symbolFonts = new Set(['amgdt'])
  })

  afterEach(() => {
    FontManager.instance.release()
    FontManager.instance.lazyFontLoading = true
  })

  it('requestFont dedupes concurrent loads for the same name', async () => {
    const load = vi
      .spyOn(FontManager.instance, 'loadFontsByNames')
      .mockResolvedValue([])

    const a = FontManager.instance.requestFont('hztxt')
    const b = FontManager.instance.requestFont('hztxt.shx')
    expect(a).toBe(b)
    await a

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('hztxt')
    load.mockRestore()
  })

  it('getFontByName schedules a background request when the map is empty', () => {
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    expect(FontManager.instance.getFontByName('hztxt')).toBeUndefined()
    expect(requestFont).toHaveBeenCalledWith('hztxt')
    requestFont.mockRestore()
  })

  it('findAndReplaceFont requests the missing font without blocking', () => {
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    const replacement = FontManager.instance.findAndReplaceFont('arial')
    expect(replacement).toBe('simkai')
    expect(requestFont).toHaveBeenCalledWith('arial')
    expect(requestFont).toHaveBeenCalledWith('simkai')
    requestFont.mockRestore()
  })

  it('findAndReplaceFont keeps mapped name while replacement is still loading', () => {
    FontManager.instance.setFontMapping({ arial: 'times' })
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    expect(FontManager.instance.findAndReplaceFont('arial')).toBe('times')
    expect(requestFont).toHaveBeenCalledWith('times')
    expect(requestFont).not.toHaveBeenCalledWith('arial')
    expect(requestFont).not.toHaveBeenCalledWith('simkai')
    requestFont.mockRestore()
    FontManager.instance.setFontMapping({})
  })

  it('requestFont does not permanently fail after release aborts an in-flight load', async () => {
    const load = vi
      .spyOn(FontManager.instance, 'loadFontsByNames')
      .mockImplementation(async () => {
        // Mimic a mid-flight full release aborting registration.
        FontManager.instance.release()
        return []
      })

    await FontManager.instance.requestFont('ghost')
    await FontManager.instance.requestFont('ghost')

    expect(load).toHaveBeenCalledTimes(2)
    load.mockRestore()
  })

  it('getCodeShapeFromSymbolFonts requests unloaded symbol fonts', () => {
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    expect(
      FontManager.instance.getCodeShapeFromSymbolFonts(132, 10)
    ).toBeUndefined()
    expect(requestFont).toHaveBeenCalledWith('amgdt')
    requestFont.mockRestore()
  })

  it('does not schedule background loads when lazyFontLoading is false', () => {
    FontManager.instance.lazyFontLoading = false
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    FontManager.instance.findAndReplaceFont('arial')
    FontManager.instance.getFontByName('hztxt')
    FontManager.instance.getCodeShapeFromSymbolFonts(132, 10)

    expect(requestFont).not.toHaveBeenCalled()
    requestFont.mockRestore()
  })

  it('recordMissedFonts only requests once per miss cycle', () => {
    const requestFont = vi
      .spyOn(FontManager.instance, 'requestFont')
      .mockResolvedValue([])

    expect(FontManager.instance.getFontByName('missing')).toBeUndefined()
    expect(FontManager.instance.getFontByName('missing')).toBeUndefined()
    expect(FontManager.instance.getFontByName('missing')).toBeUndefined()

    expect(requestFont).toHaveBeenCalledTimes(1)
    expect(requestFont).toHaveBeenCalledWith('missing')
    requestFont.mockRestore()
  })

  it('requestFont does not retry after a failed load until release', async () => {
    const load = vi
      .spyOn(FontManager.instance, 'loadFontsByNames')
      .mockResolvedValue([
        { fontName: 'ghost', url: '', status: 'FailedToLoad' }
      ])

    await FontManager.instance.requestFont('ghost')
    await FontManager.instance.requestFont('ghost')
    await FontManager.instance.requestFont('ghost')

    expect(load).toHaveBeenCalledTimes(1)

    FontManager.instance.release()
    await FontManager.instance.requestFont('ghost')
    expect(load).toHaveBeenCalledTimes(2)
    load.mockRestore()
  })

  it('loadFonts reports FailedToLoad when epoch abort skips registration', async () => {
    const manager = FontManager.instance as unknown as {
      loadFont: (fontInfo: {
        name: string[]
        file: string
        type: string
        url: string
      }) => Promise<void>
      loadEpoch: number
    }

    vi.spyOn(manager, 'loadFont').mockImplementation(async () => {
      manager.loadEpoch++
      // Mimic release/epoch abort: promise fulfills but font is not registered.
    })

    const statuses = await FontManager.instance.loadFonts({
      name: ['ghost'],
      file: 'ghost.shx',
      type: 'shx',
      url: 'https://example.com/ghost.shx'
    })

    expect(statuses).toEqual([
      {
        fontName: 'ghost',
        url: 'https://example.com/ghost.shx',
        status: 'FailedToLoad'
      }
    ])
    expect(FontManager.instance.isFontLoaded('ghost')).toBe(false)
  })
})
