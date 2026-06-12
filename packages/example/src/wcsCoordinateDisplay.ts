import * as THREE from 'three'

import { SceneBoundsHelper } from './sceneBoundsHelper'
import { SceneViewport } from './sceneViewport'

/**
 * Displays live World Coordinate System (WCS) X/Y values under the mouse cursor.
 *
 * @remarks
 * Scene coordinates reflect rebased geometry near the origin. {@link SceneBoundsHelper.wcsOriginOffset}
 * is added so the overlay reports the original survey coordinates after a rebase.
 * The HUD element (`#wcs-coords`) uses `pointer-events: none` and is toggled via CSS
 * `visibility` rather than `display` to avoid layout shifts.
 */
export class WcsCoordinateDisplay {
  /** Reused buffer for unprojected scene coordinates (avoids per-frame allocations). */
  private readonly pointerScene = new THREE.Vector3()
  /** Reused buffer for WCS coordinates shown in the overlay. */
  private readonly pointerWcs = new THREE.Vector3()

  /**
   * @param wcsCoordsDiv - Overlay element in `#render-area` that shows formatted coordinates.
   * @param viewport - Source of camera and canvas for client-to-scene mapping.
   * @param boundsHelper - Supplies {@link SceneBoundsHelper.wcsOriginOffset} after rebase.
   */
  constructor(
    private readonly wcsCoordsDiv: HTMLDivElement,
    private readonly viewport: SceneViewport,
    private readonly boundsHelper: SceneBoundsHelper
  ) {}

  /**
   * Attaches mouse listeners to the render canvas.
   *
   * @param canvas - Typically {@link SceneViewport.renderer.domElement}.
   */
  bind(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousemove', event => {
      this.update(event.clientX, event.clientY)
    })
    canvas.addEventListener('mouseleave', () => {
      this.hide()
    })
  }

  /** Hides the coordinate overlay without clearing its last text. */
  hide(): void {
    this.wcsCoordsDiv.style.visibility = 'hidden'
  }

  /**
   * Updates the overlay from a client-space pointer position.
   *
   * @param clientX - Viewport X in CSS pixels.
   * @param clientY - Viewport Y in CSS pixels.
   */
  private update(clientX: number, clientY: number): void {
    const wcs = this.sceneToWcs(this.clientToScene(clientX, clientY))
    this.wcsCoordsDiv.textContent = `WCS: X ${this.formatWcsValue(wcs.x)}, Y ${this.formatWcsValue(wcs.y)}`
    this.wcsCoordsDiv.style.visibility = 'visible'
  }

  /**
   * Converts client coordinates to a point on the Z=0 plane in scene space.
   *
   * @param clientX - Pointer X relative to the viewport.
   * @param clientY - Pointer Y relative to the viewport.
   * @returns Unprojected scene position (same space as rendered geometry).
   */
  private clientToScene(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.viewport.renderer.domElement.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
    this.pointerScene.set(ndcX, ndcY, 0).unproject(this.viewport.camera)
    return this.pointerScene
  }

  /**
   * Applies {@link SceneBoundsHelper.wcsOriginOffset} to recover WCS from scene space.
   *
   * @param scene - Point in rebased scene coordinates.
   * @returns Equivalent WCS point (`scene + wcsOriginOffset`).
   */
  private sceneToWcs(scene: THREE.Vector3): THREE.Vector3 {
    return this.pointerWcs.copy(scene).add(this.boundsHelper.wcsOriginOffset)
  }

  /**
   * Formats a coordinate for human-readable display with magnitude-dependent precision.
   *
   * @param value - Coordinate component in drawing units.
   * @returns Fixed-point string (4 decimals for very large/small values, otherwise 2–3).
   */
  private formatWcsValue(value: number): string {
    const abs = Math.abs(value)
    if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) {
      return value.toFixed(4)
    }
    if (abs >= 1000) {
      return value.toFixed(3)
    }
    return value.toFixed(2)
  }
}
