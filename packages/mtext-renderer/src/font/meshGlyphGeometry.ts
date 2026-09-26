import type * as THREE from 'three'

/**
 * `userData` flag marking BufferGeometry produced for mesh (TTF/OTF) glyphs.
 *
 * Cached glyphs are baked to position and index buffers, so callers must not
 * rely on `instanceof ShapeGeometry` to distinguish mesh glyphs from SHX
 * stroke geometry.
 */
export const MESH_GLYPH_USER_DATA_KEY = 'isMeshGlyph'

/**
 * Canonical size stored in {@link CharGeometryCache} for mesh glyphs.
 * Placement scales by {@link MeshTextShape.geometryScale} (= requested size).
 */
export const MESH_GLYPH_CACHE_SIZE = 1

/**
 * Returns true when `geometry` is a mesh-font glyph (filled outline),
 * including geometries baked down to a plain {@link THREE.BufferGeometry}.
 */
export function isMeshGlyphGeometry(
  geometry: THREE.BufferGeometry
): boolean {
  if (geometry.userData?.[MESH_GLYPH_USER_DATA_KEY] === true) {
    return true
  }
  // Fresh ShapeGeometry before baking / legacy cache entries.
  return (
    (geometry as THREE.BufferGeometry & { type?: string }).type ===
    'ShapeGeometry'
  )
}

/**
 * Marks a geometry as a mesh glyph so downstream batching keeps the filled-mesh path.
 */
export function markMeshGlyphGeometry(geometry: THREE.BufferGeometry): void {
  geometry.userData[MESH_GLYPH_USER_DATA_KEY] = true
}
