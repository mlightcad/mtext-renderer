import type { BufferGeometry, Object3D } from 'three'

export function checkRenderSignal(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Text rendering was cancelled', 'AbortError')
  }
}

/** Stop waiting without cancelling font work shared by other render requests. */
export function awaitRenderWork<T>(
  work: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException('Text rendering was cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    work.then(
      result => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) abort()
        else resolve(result)
      },
      error => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

/** Failed unpublished geometry belongs to this request; cached materials do not. */
export function disposeRenderGeometry(object: Object3D): void {
  const released = new Set<BufferGeometry>()
  object.traverse(child => {
    const geometry = (child as Object3D & { geometry?: BufferGeometry })
      .geometry
    if (geometry && !released.has(geometry)) {
      released.add(geometry)
      geometry.dispose()
    }
  })
  object.clear()
}
