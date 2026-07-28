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

/** Wire-format for an `MTextColor` carried on worker glyph payloads. */
export interface SerializedMTextColor {
  aci?: number | null
  rgbValue?: number | null
}

/**
 * Serializes an `MTextColor` for worker → main-thread transfer.
 *
 * Prefer this over baking only the resolved RGB: ACI 7 (canvas foreground) and
 * ACI 255 (literal white) both resolve to `0xffffff` on a dark canvas, but only
 * ACI 7 must invert when the background flips.
 */
export function serializeMTextColor(color: MTextColor): SerializedMTextColor {
  if (color.isRgb && color.rgbValue != null) {
    return { rgbValue: color.rgbValue }
  }
  if (color.aci != null) {
    return { aci: color.aci }
  }
  return { aci: 256 }
}

/** Revives a wire-format color into a real `MTextColor` instance. */
export function deserializeMTextColor(
  serialized?: SerializedMTextColor | null
): MTextColor | undefined {
  if (!serialized) {
    return undefined
  }
  const color = new MTextColor()
  if (typeof serialized.rgbValue === 'number') {
    color.rgbValue = serialized.rgbValue
    return color
  }
  if (typeof serialized.aci === 'number') {
    color.aci = serialized.aci
    return color
  }
  return undefined
}

/**
 * Rebuild ColorSettings for a worker-deserialized glyph material.
 *
 * Prefer {@link serializedColor} when the worker attached the original segment
 * color (ACI / RGB). Falling back to resolved RGB alone cannot distinguish
 * ACI 7 from ACI 255.
 *
 * Without a serialized color, preserve ByLayer / ByBlock / entity ACI when the
 * glyph RGB still matches the entity base resolution; otherwise bake RGB for
 * true inline overrides.
 */
export function buildWorkerMaterialColorSettings(
  base: ColorSettings,
  resolvedColor: number,
  baseByLayer: boolean,
  serializedColor?: SerializedMTextColor | null
): ColorSettings {
  const fromPayload = deserializeMTextColor(serializedColor)
  const baseResolved = resolveMTextColor(base)

  // Prefer entity-base ACI when the worker baked a matching RGB. ACI 7 and
  // ACI 255 both resolve to white; only the entity base (or an explicit
  // serialized ACI) should keep foreground semantics.
  if (
    fromPayload &&
    fromPayload.isRgb &&
    typeof fromPayload.rgbValue === 'number' &&
    fromPayload.rgbValue === baseResolved &&
    !base.color.isRgb &&
    typeof base.color.aci === 'number'
  ) {
    const color = new MTextColor()
    color.aci = base.color.aci
    return {
      byLayerColor: base.byLayerColor,
      byBlockColor: base.byBlockColor,
      layer: base.layer,
      color
    }
  }

  if (fromPayload) {
    return {
      byLayerColor: base.byLayerColor,
      byBlockColor: base.byBlockColor,
      layer: base.layer,
      color: fromPayload
    }
  }

  const color = new MTextColor()
  if (baseByLayer && resolvedColor === base.byLayerColor) {
    color.aci = 256
  } else if (
    base.color.aci === 0 &&
    resolvedColor === normalizeColorNumber(base.byBlockColor)
  ) {
    color.aci = 0
  } else if (
    !base.color.isRgb &&
    typeof base.color.aci === 'number' &&
    resolvedColor === baseResolved
  ) {
    // Segment still uses the entity base colour (including ACI 7 foreground).
    color.aci = base.color.aci
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
