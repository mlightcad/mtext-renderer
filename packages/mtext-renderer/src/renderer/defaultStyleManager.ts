import * as THREE from 'three'

import { StyleManager } from './styleManager'
import { StyleTraits } from './types'

/**
 * Class to manage basic text style
 */
export class DefaultStyleManager implements StyleManager {
  private lineBasicMaterials: { [key: string]: THREE.Material } = {}
  private meshBasicMaterials: { [key: string]: THREE.Material } = {}
  public unsupportedTextStyles: Record<string, number> = {}

  getMeshBasicMaterial(traits: StyleTraits): THREE.Material {
    const key = this.buildKey(traits)
    if (!this.meshBasicMaterials[key]) {
      this.meshBasicMaterials[key] = new THREE.MeshBasicMaterial({
        color: traits.color
      })
    }
    return this.meshBasicMaterials[key]
  }

  getLineBasicMaterial(traits: StyleTraits): THREE.Material {
    const key = this.buildKey(traits)
    if (!this.lineBasicMaterials[key]) {
      this.lineBasicMaterials[key] = new THREE.LineBasicMaterial({
        color: traits.color
      })
    }
    return this.lineBasicMaterials[key]
  }

  /**
   * Builds a stable material key from traits.
   * Key differs for shader vs basic, ByLayer vs ByEntity.
   */
  protected buildKey(traits: StyleTraits): string {
    return traits.isByLayer && traits.layer
      ? `layer_${traits.layer}_${traits.color}`
      : `entity_${traits.color}`
  }
}
