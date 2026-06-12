import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Owns the Three.js scene graph, orthographic camera, WebGL renderer, and
 * 2D pan/zoom controls for the example application's render pane.
 *
 * @remarks
 * The camera uses a Y-down orthographic frustum matching CSS pixel coordinates
 * (`left=0`, `top=0`, `right=width`, `bottom=height`). Rotation is disabled on
 * {@link OrbitControls}; only pan and zoom are available. The animation loop
 * runs for the lifetime of the page and is started once via
 * {@link SceneViewport.startAnimationLoop}.
 */
export class SceneViewport {
  /** Root scene containing all rendered MText, SHAPE, and debug geometry. */
  readonly scene: THREE.Scene
  /** Orthographic camera; frustum is adjusted by {@link SceneBoundsHelper.zoomToFit}. */
  readonly camera: THREE.OrthographicCamera
  /** WebGL renderer whose canvas is appended to `#render-area`. */
  readonly renderer: THREE.WebGLRenderer
  /** Pan/zoom controls bound to {@link renderer.domElement}. */
  readonly controls: OrbitControls
  /** DOM container (`#render-area`) that defines the drawable size. */
  private readonly renderArea: HTMLElement

  /**
   * Creates the viewport and mounts the renderer canvas into `renderArea`.
   *
   * @param renderArea - Host element; must already exist in the document.
   */
  constructor(renderArea: HTMLElement) {
    this.renderArea = renderArea

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x333333)

    const { width, height } = this.getSize()
    this.camera = new THREE.OrthographicCamera(0, width, height, 0, -1000, 1000)
    this.camera.position.set(0, 0, 100)
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(width, height, false)
    renderArea.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false
    this.controls.screenSpacePanning = true
    this.controls.minZoom = 0.01
    this.controls.maxZoom = 50

    this.setupLights()
  }

  /**
   * Returns the current drawable size of `#render-area` in CSS pixels.
   *
   * @returns Width and height used for camera and renderer sizing.
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.renderArea.clientWidth,
      height: this.renderArea.clientHeight
    }
  }

  /**
   * Resizes the renderer and resets the camera frustum to the full render area.
   *
   * @param onResized - Optional callback invoked after resize (e.g. to refit content).
   */
  resize(onResized?: () => void): void {
    const { width, height } = this.getSize()
    this.camera.left = 0
    this.camera.right = width
    this.camera.top = height
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    onResized?.()
  }

  /**
   * Starts a perpetual `requestAnimationFrame` loop that updates controls and renders.
   *
   * @remarks
   * Intended to be called exactly once during application bootstrap.
   */
  startAnimationLoop(): void {
    const tick = (): void => {
      requestAnimationFrame(tick)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    tick()
  }

  /** Adds ambient and directional lights required by mesh-based glyph rendering. */
  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.set(1, 1, 1)
    this.scene.add(directionalLight)
  }
}
