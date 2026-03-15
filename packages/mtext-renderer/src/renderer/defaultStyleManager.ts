import * as THREE from 'three'

import { resolveMTextColor } from './colorUtils'
import { StyleManager } from './styleManager'
import { ColorSettings } from './types'

/**
 * Class to manage basic text style
 */
export class DefaultStyleManager implements StyleManager {
  private lineBasicMaterials: { [key: string]: THREE.Material } = {}
  private meshBasicMaterials: { [key: string]: THREE.Material } = {}
  public unsupportedTextStyles: Record<string, number> = {}

  getMeshBasicMaterial(colorSettings: ColorSettings): THREE.Material {
    const key = this.buildKey(colorSettings)
    if (!this.meshBasicMaterials[key]) {
      const color = resolveMTextColor(colorSettings)
      this.meshBasicMaterials[key] = new THREE.MeshBasicMaterial({
        color
      })
    }
    return this.meshBasicMaterials[key]
  }

  getLineBasicMaterial(colorSettings: ColorSettings): THREE.Material {
    const key = this.buildKey(colorSettings)
    if (!this.lineBasicMaterials[key]) {
      const color = resolveMTextColor(colorSettings)
      this.lineBasicMaterials[key] = new THREE.LineBasicMaterial({
        color
      })
    }
    return this.lineBasicMaterials[key]
  }

  /**
   * Builds a stable material key from traits.
   * Key differs for shader vs basic, ByLayer vs ByEntity.
   */
  protected buildKey(colorSettings: ColorSettings): string {
    const isByLayer = colorSettings.color.aci === 256
    const resolvedColor = resolveMTextColor(colorSettings)
    return isByLayer && colorSettings.layer
      ? `layer_${colorSettings.layer}_${resolvedColor}`
      : `entity_${resolvedColor}`
  }
}
