import * as THREE from 'three'

/**
 * Sums TypedArray byte lengths of all attributes and the index on a BufferGeometry.
 * Returns 0 for missing or already-disposed geometries.
 */
export function estimateGeometryBytes(
  geometry: THREE.BufferGeometry | undefined | null
): number {
  if (!geometry || isGeometryDisposed(geometry)) {
    return 0
  }

  let bytes = 0
  const { attributes } = geometry
  for (const key of Object.keys(attributes)) {
    const attr = attributes[key]
    if (attr?.array?.byteLength != null) {
      bytes += attr.array.byteLength
    }
  }

  if (geometry.index?.array?.byteLength != null) {
    bytes += geometry.index.array.byteLength
  }

  return bytes
}

/**
 * True when Three.js has disposed the geometry (CPU buffers no longer counted).
 */
function isGeometryDisposed(geometry: THREE.BufferGeometry): boolean {
  const disposed = (geometry as THREE.BufferGeometry & { disposed?: boolean })
    .disposed
  if (disposed === true) {
    return true
  }
  // After dispose(), some Three.js versions clear attributes / index.
  return (
    Object.keys(geometry.attributes).length === 0 && geometry.index == null
  )
}

/**
 * UTF-16 string byte length (JavaScript strings are UTF-16 code units).
 */
export function estimateStringBytes(value: string | undefined | null): number {
  if (!value) {
    return 0
  }
  return value.length * 2
}

/**
 * Best-effort source byte length from raw font payload.
 */
export function getSourceByteLength(data: unknown): number {
  if (data instanceof ArrayBuffer) {
    return data.byteLength
  }
  if (ArrayBuffer.isView(data)) {
    return data.byteLength
  }
  return 0
}

/**
 * Formats a byte count as a short human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const digits = Number.isInteger(value) || value >= 10 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}
