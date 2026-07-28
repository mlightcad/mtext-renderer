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

  it('preserves entity ACI 7 when the glyph RGB still matches the base colour', () => {
    const base = createBaseColorSettings({
      color: new MTextColor(7)
    })
    const rebuilt = buildWorkerMaterialColorSettings(base, 0xffffff, false)

    expect(rebuilt.color.aci).toBe(7)
    expect(rebuilt.color.rgbValue).toBeNull()
  })

  it('preserves serialized ACI 255 even when RGB matches entity ACI 7', () => {
    const base = createBaseColorSettings({
      color: new MTextColor(7)
    })
    const rebuilt = buildWorkerMaterialColorSettings(base, 0xffffff, false, {
      aci: 255
    })

    expect(rebuilt.color.aci).toBe(255)
    expect(rebuilt.color.rgbValue).toBeNull()
  })

  it('uses serialized ACI 7 from the worker payload', () => {
    const base = createBaseColorSettings({
      color: new MTextColor(7)
    })
    const rebuilt = buildWorkerMaterialColorSettings(base, 0xffffff, false, {
      aci: 7
    })

    expect(rebuilt.color.aci).toBe(7)
  })

  it('recovers entity ACI 7 when serialized colour was baked to matching RGB', () => {
    const base = createBaseColorSettings({
      color: new MTextColor(7)
    })
    // Old processor path: setColorFromHex(getColorByIndex(7)) → rgb white.
    const rebuilt = buildWorkerMaterialColorSettings(base, 0xffffff, false, {
      rgbValue: 0xffffff
    })

    expect(rebuilt.color.aci).toBe(7)
    expect(rebuilt.color.isRgb).toBe(false)
  })
})
