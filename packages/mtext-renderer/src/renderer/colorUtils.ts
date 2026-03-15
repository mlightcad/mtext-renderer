import { getColorByIndex } from '../common'
import { ColorSettings } from './types'

export function resolveMTextColor(colorSettings: ColorSettings): number {
  const color = colorSettings.color
  const aci = color.aci
  if (aci === 0) {
    return colorSettings.byBlockColor
  }
  if (aci === 256) {
    return colorSettings.byLayerColor
  }
  if (aci !== null && aci !== undefined) {
    return getColorByIndex(aci)
  }
  if (color.rgbValue !== null) {
    return color.rgbValue
  }
  return colorSettings.byLayerColor
}
