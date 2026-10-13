import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { FontData } from '../../src/font/font'
import { FontFactory } from '../../src/font/fontFactory'
import { FontManager } from '../../src/font/fontManager'
import { ShxFont } from '../../src/font/shxFont'

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

const LOCAL_FONT_DIRS = [
  join(process.cwd(), '../../../cad-data/fonts'),
  join(process.cwd(), '../../../../cad-data/fonts'),
  'D:/code/cad-data/fonts'
]

async function loadShxFromLocal(
  name: string,
  file: string
): Promise<ShxFont | undefined> {
  for (const dir of LOCAL_FONT_DIRS) {
    try {
      const buffer = await readFile(join(dir, file))
      const fontData: FontData = {
        name,
        type: 'shx',
        data: buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ),
        alias: [name]
      }
      return FontFactory.instance.createFont(fontData) as ShxFont
    } catch {
      // try next directory
    }
  }
  return undefined
}

async function loadShxFromCdn(name: string, file: string): Promise<ShxFont> {
  const response = await fetch(FONT_BASE + file)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file}: ${response.status}`)
  }
  const fontData: FontData = {
    name,
    type: 'shx',
    data: await response.arrayBuffer(),
    alias: [name]
  }
  return FontFactory.instance.createFont(fontData) as ShxFont
}

async function loadShx(name: string, file: string): Promise<ShxFont> {
  return (await loadShxFromLocal(name, file)) ?? loadShxFromCdn(name, file)
}

describe('ShxFont.getScaleFactor (cad-viewer#724)', () => {
  afterEach(() => {
    FontManager.instance.release()
  })

  it.each([
    { file: 'romans.shx', name: 'romans', height: 28, baseUp: 21 },
    { file: 'tssdeng.shx', name: 'tssdeng', height: 33, baseUp: 26 },
    { file: 'gbenor.shx', name: 'gbenor', height: 60, baseUp: 48 },
    { file: 'txt.shx', name: 'txt', height: 8, baseUp: 6 }
  ])(
    'uses height/baseUp for $name so TEXT.height is cap-height',
    async ({ file, name, height, baseUp }) => {
      const font = await loadShx(name, file)
      expect(font.data.content.height).toBe(height)
      expect(font.data.content.baseUp).toBe(baseUp)
      expect(font.getScaleFactor()).toBeCloseTo(height / baseUp, 6)
    },
    120_000
  )

  it(
    'keeps scale factor 1 for extended BIGFONT where baseUp equals height',
    async () => {
      const font = await loadShx('gbcbig', 'gbcbig.shx')
      expect(font.data.content.baseUp).toBe(font.data.content.height)
      expect(font.getScaleFactor()).toBe(1)
    },
    120_000
  )
})
