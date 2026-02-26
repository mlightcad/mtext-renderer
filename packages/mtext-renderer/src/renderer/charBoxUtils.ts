import * as THREE from 'three'

import { CharBox, CharBoxType, STACK_DIVIDER_CHAR } from './types'

export function normalizeBox(box?: THREE.Box3) {
  if (!box) return undefined
  const vals = [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z
  ]
  if (vals.some(v => !Number.isFinite(v))) return undefined
  return box
}

export function buildCharBoxesFromObject(
  objectCharBoxes: CharBox[],
  matrixWorld: THREE.Matrix4,
  charBoxType?: CharBoxType
): CharBox[] {
  const transformedEntries: CharBox[] = []
  objectCharBoxes
    .filter(entry => entry.char !== STACK_DIVIDER_CHAR)
    .forEach(entry => {
      const transformedBox = normalizeBox(
        new THREE.Box3().copy(entry.box).applyMatrix4(matrixWorld)
      )
      if (!transformedBox) return
      transformedEntries.push({
        type:
          entry.type === CharBoxType.NEW_PARAGRAPH
            ? CharBoxType.NEW_PARAGRAPH
            : CharBoxType.CHAR,
        box: transformedBox,
        char: entry.type === CharBoxType.NEW_PARAGRAPH ? '\n' : entry.char,
        children: []
      })
    })

  if (charBoxType !== CharBoxType.STACK) {
    return transformedEntries
  }

  const isSpaceChar = (entry: CharBox) =>
    entry.type === CharBoxType.CHAR && entry.char.trim().length === 0
  const isContentChar = (entry: CharBox) =>
    entry.type === CharBoxType.CHAR && entry.char.trim().length > 0

  const firstContentIdx = transformedEntries.findIndex(isContentChar)
  if (firstContentIdx < 0) return transformedEntries
  let lastContentIdx = -1
  for (let i = transformedEntries.length - 1; i >= 0; i--) {
    if (isContentChar(transformedEntries[i])) {
      lastContentIdx = i
      break
    }
  }

  const prefixTokens = transformedEntries
    .slice(0, firstContentIdx)
    .filter(isSpaceChar)
  const suffixTokens = transformedEntries
    .slice(lastContentIdx + 1)
    .filter(isSpaceChar)
  const stackChildren = transformedEntries
    .slice(firstContentIdx, lastContentIdx + 1)
    .filter(isContentChar)
  if (stackChildren.length === 0) return [...prefixTokens, ...suffixTokens]

  const stackBox = new THREE.Box3().copy(stackChildren[0].box)
  stackChildren.slice(1).forEach(entry => stackBox.union(entry.box))

  return [
    ...prefixTokens,
    {
      type: CharBoxType.STACK,
      char: '',
      box: stackBox,
      children: stackChildren
    },
    ...suffixTokens
  ]
}
