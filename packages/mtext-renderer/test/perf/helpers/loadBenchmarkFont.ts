import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FONT_CDN = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

export const FONT_CACHE_DIR = path.join(packageRoot, '.font-cache')

/**
 * Loads a font file from the CAD font CDN, caching the raw bytes on disk so
 * repeated `pnpm bench` runs do not re-download large faces such as simsun.woff.
 */
export async function loadBenchmarkFontBuffer(
  fileName: string
): Promise<ArrayBuffer> {
  await mkdir(FONT_CACHE_DIR, { recursive: true })
  const cachePath = path.join(FONT_CACHE_DIR, fileName.replace(/[\\/]/g, '_'))

  try {
    const cached = await readFile(cachePath)
    return cached.buffer.slice(
      cached.byteOffset,
      cached.byteOffset + cached.byteLength
    )
  } catch {
    // Cache miss — fall through to CDN fetch.
  }

  const response = await fetch(FONT_CDN + fileName)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch benchmark font ${fileName}: HTTP ${response.status}`
    )
  }
  const buffer = await response.arrayBuffer()
  await writeFile(cachePath, Buffer.from(buffer))
  return buffer
}

/**
 * Stable fingerprint for a font buffer (useful when logging which face ran).
 */
export function fontBufferFingerprint(buffer: ArrayBuffer): string {
  return createHash('sha1').update(Buffer.from(buffer)).digest('hex').slice(0, 10)
}
