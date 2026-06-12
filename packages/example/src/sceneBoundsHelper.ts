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
 * 3. Frames content with a camera centered on its bounds so large WCS insertions
 *    cancel in modelView before local glyph vertices are projected.
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
   * Frames `currentContent` in the viewport by adjusting the orthographic frustum.
   *
   * @param currentContent - Content to fit; when `null`, resets frustum to the full pane.
   * @param paddingRatio - Fractional padding added on each side of the content bounds (default `0.08`).
   *
   * @remarks
   * The camera moves to the content center and uses a symmetric local frustum so
   * survey-scale insertions cancel in modelView before local glyph vertices are
   * projected. Aspect ratio is preserved by expanding the narrower axis.
   */
  zoomToFit(
    currentContent: THREE.Object3D | null,
    paddingRatio = 0.08
  ): void {
    const { width: viewW, height: viewH } = this.getRenderAreaSize()

    this.camera.zoom = 1

    if (!currentContent) {
      this.camera.position.set(0, 0, 100)
      this.controls.target.set(0, 0, 0)
      this.setDefaultFrustum(viewW, viewH)
      return
    }

    const worldBox = this.computeRenderableBounds(currentContent)
    if (worldBox.isEmpty()) {
      this.camera.position.set(0, 0, 100)
      this.controls.target.set(0, 0, 0)
      this.setDefaultFrustum(viewW, viewH)
      return
    }

    const center = worldBox.getCenter(new THREE.Vector3())
    this.camera.position.set(center.x, center.y, 100)
    this.controls.target.set(center.x, center.y, 0)

    const spanX = Math.max(worldBox.max.x - worldBox.min.x, 1e-6)
    const spanY = Math.max(worldBox.max.y - worldBox.min.y, 1e-6)
    let fitW = spanX * (1 + paddingRatio * 2)
    let fitH = spanY * (1 + paddingRatio * 2)
    const viewAspect = viewW / viewH
    const fitAspect = fitW / fitH

    if (fitAspect > viewAspect) {
      fitH = fitW / viewAspect
    } else {
      fitW = fitH * viewAspect
    }

    // Frame in camera-local coordinates so large WCS insertions cancel in
    // modelView before local glyph vertices are transformed.
    this.camera.left = -fitW / 2
    this.camera.right = fitW / 2
    this.camera.top = fitH / 2
    this.camera.bottom = -fitH / 2
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
  refreshDrawableBounds(root: THREE.Object3D | null): void {
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
