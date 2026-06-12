import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Computes drawable bounds, rebases large world coordinates near the origin, and
 * frames content in the orthographic viewport.
 *
 * @remarks
 * WebGL uses float32 transforms; MText inserted at survey-scale WCS (tens of
 * millions) loses sub-pixel detail unless geometry is shifted. This helper:
 *
 * 1. Unions **glyph geometry** bounds while skipping debug overlays tagged with
 *    `userData.excludeFromFit`.
 * 2. Records the shift in {@link wcsOriginOffset} so {@link WcsCoordinateDisplay}
 *    can report true WCS coordinates.
 * 3. Adjusts the orthographic frustum via {@link zoomToFit} instead of moving
 *    the camera to large coordinates (which would reintroduce precision loss).
 */
export class SceneBoundsHelper {
  /**
   * Translation applied when content is rebased to the scene origin.
   * World coordinates satisfy `WCS = scenePosition + wcsOriginOffset`.
   */
  readonly wcsOriginOffset = new THREE.Vector3(0, 0, 0)

  /** Positions above this magnitude (|x| or |y|) are treated as large WCS inserts. */
  private readonly largeWorldCoordinateThreshold = 1e5

  /**
   * @param camera - Orthographic camera whose frustum is updated by {@link zoomToFit}.
   * @param controls - Orbit controls whose target is reset when framing content.
   * @param getRenderAreaSize - Returns the current `#render-area` size in CSS pixels.
   */
  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly controls: OrbitControls,
    private readonly getRenderAreaSize: () => { width: number; height: number }
  ) {}

  /** Clears {@link wcsOriginOffset} when scene content is removed. */
  resetOriginOffset(): void {
    this.wcsOriginOffset.set(0, 0, 0)
  }

  /**
   * Returns whether `object` should contribute to renderable bounds unions.
   *
   * @param object - Candidate scene-graph node (typically a mesh or line primitive).
   * @returns `false` if the node is invisible or has an ancestor with `userData.excludeFromFit`.
   */
  shouldIncludeInRenderableBounds(object: THREE.Object3D): boolean {
    if (!object.visible) {
      return false
    }

    let node: THREE.Object3D | null = object
    while (node) {
      if (node.userData?.excludeFromFit) {
        return false
      }
      node = node.parent
    }

    return true
  }

  /**
   * Unions world-space axis-aligned bounds of visible glyph geometry under `root`.
   *
   * @param root - Scene subgraph to traverse (usually the current MText group).
   * @returns World-space bounding box; may be empty when no qualifying geometry exists.
   */
  computeRenderableBounds(root: THREE.Object3D): THREE.Box3 {
    const bounds = new THREE.Box3()
    const tempBox = new THREE.Box3()
    root.updateWorldMatrix(true, true)

    root.traverse(child => {
      if (!this.shouldIncludeInRenderableBounds(child)) {
        return
      }

      if (
        child instanceof THREE.Line ||
        child instanceof THREE.LineSegments ||
        child instanceof THREE.Mesh
      ) {
        const geometry = child.geometry
        if (!geometry || geometry.userData?.isDecoration) {
          return
        }
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox()
        }
        if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
          return
        }
        tempBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld)
        bounds.union(tempBox)
      }
    })

    return bounds
  }

  /**
   * Chooses bounds for display/fit when the logical MText column is far wider than glyphs.
   *
   * @param source - Rendered MText object.
   * @param logicalBox - Renderer-reported logical extents (may span huge DXF width).
   * @returns Either `logicalBox` or glyph geometry bounds, whichever is more representative.
   *
   * @remarks
   * When logical span exceeds `max(geometrySpan × 1000, 1e6)`, glyph bounds are preferred.
   * This avoids empty-looking views for entities whose DXF group 41 width is astronomical
   * while actual text occupies a small fraction of that column.
   */
  getDisplayBounds(source: THREE.Object3D, logicalBox: THREE.Box3): THREE.Box3 {
    const renderable = this.computeRenderableBounds(source)
    if (renderable.isEmpty()) {
      return logicalBox.clone()
    }

    const logicalSpanX = logicalBox.max.x - logicalBox.min.x
    const logicalSpanY = logicalBox.max.y - logicalBox.min.y
    const geometrySpanX = renderable.max.x - renderable.min.x
    const geometrySpanY = renderable.max.y - renderable.min.y
    const geometrySpan = Math.max(geometrySpanX, geometrySpanY, 1)
    const logicalSpan = Math.max(logicalSpanX, logicalSpanY)

    if (logicalSpan > Math.max(geometrySpan * 1000, 1e6)) {
      return renderable.clone()
    }

    return logicalBox.clone()
  }

  /**
   * Bounds used when drawing debug bounding-box overlays.
   *
   * @param source - Rendered MText object.
   * @param logicalBox - Fallback logical extents when no glyph geometry is found.
   * @returns Tightest useful bounds for overlay placement.
   */
  getOverlayBounds(source: THREE.Object3D, logicalBox: THREE.Box3): THREE.Box3 {
    const renderable = this.computeRenderableBounds(source)
    if (!renderable.isEmpty()) {
      return renderable.clone()
    }
    return this.getDisplayBounds(source, logicalBox)
  }

  /**
   * Returns the world-space center of rendered glyph geometry for an MText object.
   *
   * @param mtextObj - Object whose drawable children are traversed.
   * @returns Geometry center, or `(0, 0, 0)` when bounds are empty.
   */
  getRebasedAnchorPoint(mtextObj: THREE.Object3D): THREE.Vector3 {
    const bounds = this.computeRenderableBounds(mtextObj)
    if (!bounds.isEmpty()) {
      return bounds.getCenter(new THREE.Vector3())
    }
    return new THREE.Vector3(0, 0, 0)
  }

  /**
   * Shifts rendered content near the origin when its geometric center lies at large WCS.
   *
   * @param currentContent - Root group currently displayed in the scene.
   *
   * @remarks
   * Large insertion transforms are rewritten on individual nodes (see
   * {@link subtractWorldOffset}) rather than translating an outer group, which would
   * still accumulate float32 error in child world matrices. No-op when center coordinates
   * are below {@link largeWorldCoordinateThreshold}.
   */
  rebaseSceneOrigin(currentContent: THREE.Object3D | null): void {
    if (!currentContent) {
      return
    }

    currentContent.position.set(0, 0, 0)
    currentContent.updateWorldMatrix(true, true)

    const bounds = this.computeRenderableBounds(currentContent)
    if (bounds.isEmpty()) {
      return
    }

    const center = bounds.getCenter(new THREE.Vector3())
    if (
      Math.abs(center.x) <= this.largeWorldCoordinateThreshold &&
      Math.abs(center.y) <= this.largeWorldCoordinateThreshold
    ) {
      return
    }

    this.wcsOriginOffset.copy(center)
    this.subtractWorldOffset(currentContent, center)
    currentContent.updateWorldMatrix(true, true)
    this.refreshDrawableBounds(currentContent)
  }

  /**
   * Moves large WCS insertion transforms to the origin while preserving local glyph geometry.
   *
   * @param currentContent - Root group whose descendants may carry survey-scale positions.
   *
   * @remarks
   * The first node with |position| above the threshold supplies {@link wcsOriginOffset}.
   * Used by the large-coordinates example when rebase is enabled.
   */
  rebaseInsertionToOrigin(currentContent: THREE.Object3D | null): void {
    let capturedOffset = false
    currentContent?.traverse(child => {
      if (
        Math.abs(child.position.x) > this.largeWorldCoordinateThreshold ||
        Math.abs(child.position.y) > this.largeWorldCoordinateThreshold
      ) {
        if (!capturedOffset) {
          this.wcsOriginOffset.set(child.position.x, child.position.y, 0)
          capturedOffset = true
        }
        child.position.set(0, 0, child.position.z)
        child.updateMatrix()
      }
    })
    currentContent?.updateWorldMatrix(true, true)
    this.refreshDrawableBounds(currentContent)
  }

  /**
   * Frames `currentContent` in the viewport by adjusting the orthographic frustum.
   *
   * @param currentContent - Content to fit; when `null`, resets frustum to the full pane.
   * @param paddingRatio - Fractional padding added on each side of the content bounds (default `0.08`).
   *
   * @remarks
   * The camera stays at the origin; only `left`/`right`/`top`/`bottom` change. Aspect
   * ratio is preserved by expanding the narrower axis when content and view aspects differ.
   */
  zoomToFit(
    currentContent: THREE.Object3D | null,
    paddingRatio = 0.08
  ): void {
    const { width: viewW, height: viewH } = this.getRenderAreaSize()

    this.camera.zoom = 1
    this.camera.position.set(0, 0, 100)
    this.controls.target.set(0, 0, 0)

    if (!currentContent) {
      this.setDefaultFrustum(viewW, viewH)
      return
    }

    const worldBox = this.computeRenderableBounds(currentContent)
    if (worldBox.isEmpty()) {
      this.setDefaultFrustum(viewW, viewH)
      return
    }

    const minX = worldBox.min.x
    const maxX = worldBox.max.x
    const minY = worldBox.min.y
    const maxY = worldBox.max.y
    const padX = Math.max((maxX - minX) * paddingRatio, 1e-6)
    const padY = Math.max((maxY - minY) * paddingRatio, 1e-6)
    let fitMinX = minX - padX
    let fitMaxX = maxX + padX
    let fitMinY = minY - padY
    let fitMaxY = maxY + padY

    const fitW = fitMaxX - fitMinX
    const fitH = fitMaxY - fitMinY
    const viewAspect = viewW / viewH
    const fitAspect = fitW / fitH

    if (fitAspect > viewAspect) {
      const expandedH = fitW / viewAspect
      const centerY = (minY + maxY) / 2
      fitMinY = centerY - expandedH / 2
      fitMaxY = centerY + expandedH / 2
    } else {
      const expandedW = fitH * viewAspect
      const centerX = (minX + maxX) / 2
      fitMinX = centerX - expandedW / 2
      fitMaxX = centerX + expandedW / 2
    }

    this.camera.left = fitMinX
    this.camera.right = fitMaxX
    this.camera.top = fitMaxY
    this.camera.bottom = fitMinY
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  /** Restores a pixel-aligned frustum covering the entire render pane. */
  private setDefaultFrustum(viewW: number, viewH: number): void {
    this.camera.left = 0
    this.camera.right = viewW
    this.camera.top = viewH
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  /**
   * Subtracts `offset` from local positions of nodes whose coordinates exceed the threshold.
   *
   * @param root - Subtree to rewrite.
   * @param offset - World-space center captured before rebase.
   */
  private subtractWorldOffset(
    root: THREE.Object3D,
    offset: THREE.Vector3
  ): void {
    root.traverse(child => {
      if (
        Math.abs(child.position.x) > this.largeWorldCoordinateThreshold ||
        Math.abs(child.position.y) > this.largeWorldCoordinateThreshold
      ) {
        child.position.x -= offset.x
        child.position.y -= offset.y
        child.updateMatrix()
      }
    })
  }

  /**
   * Recomputes geometry bounding volumes and disables frustum culling after a rebase.
   *
   * @param root - Subtree whose drawable primitives should be refreshed.
   */
  private refreshDrawableBounds(root: THREE.Object3D | null): void {
    if (!root) {
      return
    }

    root.traverse(child => {
      if (
        child instanceof THREE.Line ||
        child instanceof THREE.LineSegments ||
        child instanceof THREE.Mesh
      ) {
        child.frustumCulled = false
        const geometry = child.geometry as THREE.BufferGeometry | undefined
        if (!geometry) {
          return
        }
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
      }
    })
  }
}
