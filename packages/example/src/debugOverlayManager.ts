import {
  CharBox,
  CharBoxType,
  LineLayout,
  MTextData,
  MTextObject,
  TextStyle
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import { LargeCoordinatesExample } from './exampleTestData'
import { SceneBoundsHelper } from './sceneBoundsHelper'

/** Options for {@link DebugOverlayManager.addMTextDebugOverlays}. */
export type MTextDebugOverlayOptions = {
  /** When true, green wireframe boxes are added for each MText object. */
  showBoundingBox: boolean
  /** Source test cases; required for attachment-grid and large-coordinate crosshairs. */
  multiData?: { mtextData: MTextData; textStyle: TextStyle }[]
}

/**
 * Creates and tracks visual debug overlays for the example renderer.
 *
 * @remarks
 * Overlays include MText bounding boxes, DXF insertion crosshairs, per-character
 * layout boxes, and per-line strip boxes. All overlay roots and descendants set
 * `userData.excludeFromFit = true` so {@link SceneBoundsHelper.computeRenderableBounds}
 * frames glyph geometry rather than debug decoration.
 */
export class DebugOverlayManager {
  /** Most recently created single-entity bounding box (used by the checkbox toggle). */
  private mtextBox: THREE.LineSegments | null = null
  /** Char-box overlay groups attached during the current render pass. */
  private charBoxOverlays: THREE.Object3D[] = []
  /** Line-box overlay groups attached during the current render pass. */
  private lineBoxOverlays: THREE.Object3D[] = []

  /**
   * @param boundsHelper - Supplies tight bounds for overlay placement after rebase.
   */
  constructor(private readonly boundsHelper: SceneBoundsHelper) {}

  /** Discards overlay references when scene content is cleared. Does not dispose GPU resources. */
  clear(): void {
    this.mtextBox = null
    this.charBoxOverlays = []
    this.lineBoxOverlays = []
  }

  /**
   * Returns the bounding-box overlay for the last single-entity render, if any.
   *
   * @returns Green wireframe box, or `null` when none was created.
   */
  getMtextBox(): THREE.LineSegments | null {
    return this.mtextBox
  }

  /**
   * Toggles visibility of the single-entity bounding box from {@link getMtextBox}.
   *
   * @param visible - Desired visibility state.
   * @remarks Multi-entity debug boxes are not tracked individually; re-render to refresh them.
   */
  setBoundingBoxVisible(visible: boolean): void {
    if (this.mtextBox) {
      this.mtextBox.visible = visible
    }
  }

  /** Shows or hides all char-box overlays from the current render pass. */
  setCharBoxOverlayVisibility(visible: boolean): void {
    this.charBoxOverlays.forEach(overlay => {
      overlay.visible = visible
    })
  }

  /** Shows or hides all line-box overlays from the current render pass. */
  setLineBoxOverlayVisibility(visible: boolean): void {
    this.lineBoxOverlays.forEach(overlay => {
      overlay.visible = visible
    })
  }

  /**
   * Builds a green wireframe box from axis-aligned bounds.
   *
   * @param box - World- or local-space extents; geometry is built in local `[0,width]×[0,height]`.
   * @returns Line segments positioned at `(box.min.x, box.min.y)` with `excludeFromFit` set.
   *
   * @remarks
   * Also stores the result in {@link mtextBox} for checkbox toggling on single-entity renders.
   */
  createMTextBox(box: THREE.Box3): THREE.LineSegments {
    const width = box.max.x - box.min.x
    const height = box.max.y - box.min.y
    const minZ = box.min.z
    const maxZ = box.max.z

    const vertices = [
      0, 0, minZ, width, 0, minZ, width, 0, minZ, width, height, minZ,
      width, height, minZ, 0, height, minZ, 0, height, minZ, 0, 0, minZ,
      0, 0, maxZ, width, 0, maxZ, width, 0, maxZ, width, height, maxZ,
      width, height, maxZ, 0, height, maxZ, 0, height, maxZ, 0, 0, maxZ,
      0, 0, minZ, 0, 0, maxZ, width, 0, minZ, width, 0, maxZ,
      width, height, minZ, width, height, maxZ, 0, height, minZ, 0, height, maxZ
    ]

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    )
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 1
    })
    this.mtextBox = new THREE.LineSegments(geometry, material)
    this.mtextBox.position.set(box.min.x, box.min.y, 0)
    this.mtextBox.userData.excludeFromFit = true
    return this.mtextBox
  }

  /**
   * Builds a red insertion-point crosshair centered at `(x, y)`.
   *
   * @param x - Scene X of the DXF insertion / alignment anchor.
   * @param y - Scene Y of the insertion anchor.
   * @param arm - Half-length of each cross arm in drawing units (default `22`).
   * @param z - Depth offset above glyph geometry (default `0.03`).
   * @returns Line segments with depth test disabled for visibility over text.
   */
  createInsertionCrosshair(
    x: number,
    y: number,
    arm = 22,
    z = 0.03
  ): THREE.LineSegments {
    const vertices = new Float32Array([
      -arm, 0, z, arm, 0, z, 0, -arm, z, 0, arm, z
    ])
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    const material = new THREE.LineBasicMaterial({
      color: 0xff3333,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    })
    const lines = new THREE.LineSegments(geometry, material)
    lines.position.set(x, y, 0)
    lines.renderOrder = 1000
    lines.userData.excludeFromFit = true
    return lines
  }

  /**
   * Adds crosshairs and optional bounding boxes for a multi-entity MText render.
   *
   * @param group - Parent group receiving overlay children.
   * @param mtextObjects - Rendered entities aligned with `multiData` indices.
   * @param content - Example marker (`attachmentGrid`, large-coordinate keys, etc.).
   * @param options - Visibility and source test-case metadata.
   */
  addMTextDebugOverlays(
    group: THREE.Group,
    mtextObjects: MTextObject[],
    content: string,
    options: MTextDebugOverlayOptions
  ): void {
    const { showBoundingBox, multiData } = options

    if (
      multiData &&
      (content === 'attachmentGrid' || LargeCoordinatesExample.isExample(content))
    ) {
      multiData.forEach((_, index) => {
        const { mtextData } = multiData[index]
        const arm = LargeCoordinatesExample.isExample(content)
          ? mtextData.height * 5
          : undefined
        const anchor = LargeCoordinatesExample.isExample(content)
          ? this.boundsHelper.getRebasedAnchorPoint(mtextObjects[index])
          : new THREE.Vector3(mtextData.position.x, mtextData.position.y, 0)
        group.add(this.createInsertionCrosshair(anchor.x, anchor.y, arm))
      })
    }

    if (!showBoundingBox) {
      return
    }

    mtextObjects.forEach(mtextObj => {
      if (mtextObj.box && !mtextObj.box.isEmpty()) {
        group.add(
          this.createMTextBox(
            this.boundsHelper.getOverlayBounds(mtextObj, mtextObj.box)
          )
        )
      }
    })
  }

  /**
   * Attaches a cyan char-box overlay derived from {@link MTextObject.createLayoutData}.
   *
   * @param mtextObj - Rendered entity to annotate.
   * @param visible - Initial visibility (typically tied to the char-box checkbox).
   */
  attachCharBoxOverlay(mtextObj: MTextObject, visible: boolean): void {
    const layout = mtextObj.createLayoutData()
    if (!layout.chars || layout.chars.length === 0) return

    const overlay = this.createCharBoxOverlay(layout.chars)
    overlay.visible = visible
    overlay.renderOrder = 999
    overlay.userData.excludeFromFit = true
    mtextObj.add(overlay)
    this.charBoxOverlays.push(overlay)
  }

  /**
   * Attaches a magenta line-strip overlay for each laid-out text line.
   *
   * @param mtextObj - Rendered entity with non-empty logical box and line layouts.
   * @param visible - Initial visibility (typically tied to the line-box checkbox).
   */
  attachLineBoxOverlay(mtextObj: MTextObject, visible: boolean): void {
    const layout = mtextObj.createLayoutData()
    if (!layout.lines || layout.lines.length === 0) return
    if (!mtextObj.box || mtextObj.box.isEmpty()) return

    const overlay = this.createLineBoxOverlay(
      layout.lines,
      mtextObj.box.min.x,
      mtextObj.box.max.x
    )
    overlay.visible = visible
    overlay.renderOrder = 998
    overlay.userData.excludeFromFit = true
    mtextObj.add(overlay)
    this.lineBoxOverlays.push(overlay)
  }

  /**
   * Flattens nested char-box trees into leaf CHAR entries for outline rendering.
   *
   * @param charBoxes - Root char boxes from layout metadata (may contain stack/context children).
   */
  private flattenCharBoxes(charBoxes: CharBox[]): CharBox[] {
    const flattened: CharBox[] = []
    const stack = [...charBoxes]

    while (stack.length > 0) {
      const entry = stack.pop()!
      if (entry.type === CharBoxType.CHAR) {
        flattened.push(entry)
      }

      if (entry.children && entry.children.length > 0) {
        for (let i = entry.children.length - 1; i >= 0; i--) {
          stack.push(entry.children[i])
        }
      }
    }

    return flattened
  }

  /**
   * Builds a group of cyan rectangles outlining individual character bounds.
   *
   * @param charBoxes - Layout char boxes (nested structures are flattened first).
   */
  private createCharBoxOverlay(charBoxes: CharBox[]): THREE.Group {
    const overlay = new THREE.Group()
    const renderableCharBoxes = this.flattenCharBoxes(charBoxes)

    const charMaterial = new THREE.LineBasicMaterial({
      color: 0x00cfff,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    })

    renderableCharBoxes.forEach(entry => {
      const minX = entry.box.min.x
      const minY = entry.box.min.y
      const maxX = entry.box.max.x
      const maxY = entry.box.max.y
      const z = Math.max(entry.box.max.z, 0) + 0.001

      const outlineVertices = [
        minX, minY, z, maxX, minY, z, maxX, minY, z, maxX, maxY, z,
        maxX, maxY, z, minX, maxY, z, minX, maxY, z, minX, minY, z
      ]

      const outlineGeometry = new THREE.BufferGeometry()
      outlineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(outlineVertices, 3)
      )

      const outline = new THREE.LineSegments(outlineGeometry, charMaterial)
      outline.userData.excludeFromFit = true
      overlay.add(outline)
    })

    return overlay
  }

  /**
   * Builds horizontal strip outlines spanning `[lineMinX, lineMaxX]` for each line layout.
   *
   * @param lineLayouts - Per-line Y/height metadata from the renderer.
   * @param lineMinX - Left edge shared by all line strips (logical box minimum X).
   * @param lineMaxX - Right edge shared by all line strips (logical box maximum X).
   * @param z - Depth offset above glyphs (default `0.002`).
   */
  private createLineBoxOverlay(
    lineLayouts: LineLayout[],
    lineMinX: number,
    lineMaxX: number,
    z = 0.002
  ): THREE.Group {
    const overlay = new THREE.Group()
    const material = new THREE.LineBasicMaterial({
      color: 0xff2bd6,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9
    })

    lineLayouts.forEach(line => {
      const minY = line.y - line.height / 2
      const maxY = line.y + line.height / 2
      const outlineVertices = [
        lineMinX, minY, z, lineMaxX, minY, z, lineMaxX, minY, z, lineMaxX, maxY, z,
        lineMaxX, maxY, z, lineMinX, maxY, z, lineMinX, maxY, z, lineMinX, minY, z
      ]
      const outlineGeometry = new THREE.BufferGeometry()
      outlineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(outlineVertices, 3)
      )
      const outline = new THREE.LineSegments(outlineGeometry, material)
      outline.frustumCulled = false
      outline.userData.excludeFromFit = true
      overlay.add(outline)
    })

    overlay.userData.excludeFromFit = true
    return overlay
  }
}
