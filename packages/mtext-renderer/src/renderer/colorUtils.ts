import { getColorByIndex } from '../common'
import { ColorSettings } from './types'

function normalizeColorNumber(color: number): number {
  return Math.max(0, Math.min(0xffffff, Math.round(color)))
}

export function resolveMTextColor(colorSettings: ColorSettings): number {
  const color = colorSettings.color
  const aci = color.aci
  if (aci === 0) {
    return normalizeColorNumber(colorSettings.byBlockColor)
  }
  if (aci === 256) {
    return normalizeColorNumber(colorSettings.byLayerColor)
  }
  if (aci !== null && aci !== undefined) {
    return getColorByIndex(aci)
  }
  if (color.rgbValue !== null) {
    return normalizeColorNumber(color.rgbValue)
  }
  return normalizeColorNumber(colorSettings.byLayerColor)
}
