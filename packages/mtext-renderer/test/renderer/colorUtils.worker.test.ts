import { MTextColor } from '@mlightcad/mtext-parser'
import { describe, expect, it } from 'vitest'

import { getColorByIndex } from '../../src/common'
import {
  buildWorkerMaterialColorSettings,
  resolveMTextColor
} from '../../src/renderer/colorUtils'
import { ColorSettings } from '../../src/renderer/types'

function createBaseColorSettings(
  overrides: Partial<ColorSettings> = {}
): ColorSettings {
  return {
    byLayerColor: 0xffffff,
    byBlockColor: 0x00ff00,
    layer: '0',
    color: new MTextColor(256),
    ...overrides
  }
}

describe('buildWorkerMaterialColorSettings', () => {
  it('preserves ByLayer when the resolved glyph color matches the layer fallback', () => {
    const base = createBaseColorSettings()
    const rebuilt = buildWorkerMaterialColorSettings(base, 0xffffff, true)

    expect(rebuilt.color.aci).toBe(256)
    expect(resolveMTextColor(rebuilt)).toBe(0xffffff)
  })

  it('keeps ACI glyph colors when the entity base color is ByLayer', () => {
    const base = createBaseColorSettings()
    const red = getColorByIndex(1)
    const rebuilt = buildWorkerMaterialColorSettings(base, red, true)

    expect(rebuilt.color.aci).toBeNull()
    expect(rebuilt.color.rgbValue).toBe(red)
    expect(resolveMTextColor(rebuilt)).toBe(red)
  })

  it('keeps explicit RGB glyph colors from the worker payload', () => {
    const base = createBaseColorSettings()
    const rebuilt = buildWorkerMaterialColorSettings(base, 0x336699, true)

    expect(rebuilt.color.rgbValue).toBe(0x336699)
    expect(resolveMTextColor(rebuilt)).toBe(0x336699)
  })
})
