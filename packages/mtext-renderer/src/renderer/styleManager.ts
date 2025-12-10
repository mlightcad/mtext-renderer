import * as THREE from 'three'

import { StyleTraits } from './types'

/**
 * Class to manage materials used by texts
 */
export interface StyleManager {
  unsupportedTextStyles: Record<string, number>
  /**
   * Gets one reusable material for mesh type font. If not found in cache, just create one.
   * @param traits - Traits to define one mesh basic material
   * @returns - One reusable material for mesh type font.
   */
  getMeshBasicMaterial(traits: StyleTraits): THREE.Material

  /**
   * Gets one reusable material for line type font. If not found in cache, just create one.
   * @param traits - Traits to define one line basic material
   * @returns - One reusable material for line type font.
   */
  getLineBasicMaterial(traits: StyleTraits): THREE.Material
}
