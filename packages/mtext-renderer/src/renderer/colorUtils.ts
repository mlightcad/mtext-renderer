import { MTextColor } from '@mlightcad/mtext-parser'

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

/**
 * Rebuild ColorSettings for a worker-deserialized glyph material.
 *
 * Worker meshes already carry the final resolved RGB in their serialized
 * material. When the entity base color is ByLayer, preserve that semantic only
 * for glyphs that match the layer fallback color.
 */
export function buildWorkerMaterialColorSettings(
  base: ColorSettings,
  resolvedColor: number,
  baseByLayer: boolean
): ColorSettings {
  const color = new MTextColor()
  if (baseByLayer && resolvedColor === base.byLayerColor) {
    color.aci = 256
  } else {
    color.rgbValue = resolvedColor
  }

  return {
    byLayerColor: base.byLayerColor,
    byBlockColor: base.byBlockColor,
    layer: base.layer,
    color
  }
}
