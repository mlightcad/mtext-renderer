import * as THREE from 'three'
import { vi } from 'vitest'

import { FontData } from '../../../src/font/font'
import { FontFactory } from '../../../src/font/fontFactory'
import { FontManager } from '../../../src/font/fontManager'
import { MeshFont } from '../../../src/font/meshFont'
import { ShxFont } from '../../../src/font/shxFont'
import {
  createDefaultColorSettings,
  TextStyle
} from '../../../src/renderer/types'
import { loadBenchmarkFontBuffer } from './loadBenchmarkFont'

export const mockStyleManager = {
  unsupportedTextStyles: {} as Record<string, number>,
  getMeshBasicMaterial: vi
    .fn()
    .mockReturnValue(new THREE.MeshBasicMaterial({ color: 0xffffff })),
  getLineBasicMaterial: vi
    .fn()
    .mockReturnValue(new THREE.LineBasicMaterial({ color: 0xffffff }))
}

export function resetFontManager(): void {
  FontManager.instance.release()
  FontManager.instance.enableFontCache = false
  FontManager.instance.lazyFontLoading = false
}

/**
 * Registers a mesh or SHX font under `FontManager` for syncDraw benchmarks.
 */
export async function registerBenchmarkFont(options: {
  name: string
  fileName: string
  encoding?: string
}): Promise<MeshFont | ShxFont> {
  const data = await loadBenchmarkFontBuffer(options.fileName)
  const type = options.fileName.toLowerCase().endsWith('.shx') ? 'shx' : 'mesh'
  const fontData: FontData = {
    name: options.name,
    type,
    data,
    encoding: options.encoding,
    alias: [options.name]
  }
  const font = FontFactory.instance.createFont(fontData) as MeshFont | ShxFont
  font.names.add(options.name)
  ;(
    FontManager.instance as unknown as { loadedFontMap: Map<string, unknown> }
  ).loadedFontMap.set(options.name, font)
  return font
}

export function makeTextStyle(
  font: string,
  height: number,
  extras: Partial<TextStyle> = {}
): TextStyle {
  return {
    name: 'Standard',
    standardFlag: 0,
    fixedTextHeight: height,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: height,
    font,
    bigFont: '',
    ...extras
  }
}

export function createColorSettings() {
  return createDefaultColorSettings()
}

/** Common CJK sample — unique chars a typical title-block / annotation set uses. */
export const CJK_UNIQUE_CHARS =
  '钉柱法兰垫片螺栓螺母垫圈焊接装配尺寸公差形位公差表面粗糙度技术要求材料热处理'

/** Mixed annotation line resembling Chinese CAD drawings. */
export const CJK_ANNOTATION_LINE =
  '钉柱 V01 法兰盘 DN50 PN16 材料：304 数量：12 件 技术要求：按GB/T 1804-m'

export function repeatText(seed: string, targetLength: number): string {
  if (seed.length === 0) {
    return ''
  }
  let text = ''
  while (text.length < targetLength) {
    text += seed
  }
  return text.slice(0, targetLength)
}

export function countGeometryVertices(object: THREE.Object3D): number {
  let count = 0
  object.traverse(node => {
    const geometry = (node as THREE.Mesh).geometry as
      | THREE.BufferGeometry
      | undefined
    const position = geometry?.getAttribute?.('position')
    if (position) {
      count += position.count
    }
  })
  return count
}
