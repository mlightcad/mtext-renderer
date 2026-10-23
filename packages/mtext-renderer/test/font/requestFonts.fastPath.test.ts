import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FontManager } from '../../src/font/fontManager'

describe('FontManager.requestFonts fast path', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    FontManager.instance.release()
  })

  it('returns a resolved empty list without Promise.all when all faces are loaded', async () => {
    const manager = FontManager.instance
    const loadSpy = vi.spyOn(manager, 'loadFontsByNames')

    // Pretend the face is already resident.
    vi.spyOn(manager, 'isFontLoaded').mockImplementation(
      name => name.toLowerCase() === 'simsun'
    )

    const result = await manager.requestFonts(['simsun', 'SimSun.ttf'])
    expect(result).toEqual([])
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('loads only when at least one face is missing', async () => {
    const manager = FontManager.instance
    vi.spyOn(manager, 'isFontLoaded').mockImplementation(
      name => name.toLowerCase() === 'simsun'
    )
    const requestFontSpy = vi
      .spyOn(manager, 'requestFont')
      .mockResolvedValue([])

    await manager.requestFonts(['simsun', 'missing-face'])
    expect(requestFontSpy).toHaveBeenCalled()
  })

  it('skips Promise.all after a session NotFound settle', async () => {
    const manager = FontManager.instance
    const loadSpy = vi.spyOn(manager, 'loadFontsByNames').mockResolvedValue([
      {
        fontName: 'missing-face',
        url: '',
        status: 'NotFound'
      }
    ])

    const statuses = await manager.requestFont('missing-face')
    expect(statuses[0]?.status).toBe('NotFound')
    expect(manager.needsFontLoad('missing-face')).toBe(false)

    loadSpy.mockClear()
    const result = await manager.requestFonts(['missing-face'])
    expect(result).toEqual([])
    expect(loadSpy).not.toHaveBeenCalled()
  })
})
