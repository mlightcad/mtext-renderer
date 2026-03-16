import {
  CharBox,
  CharBoxType,
  LineLayout,
  MTextColor,
  MTextData,
  MTextObject,
  RenderMode,
  TextStyle,
  UnifiedRenderer
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

class MTextRendererExample {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private unifiedRenderer: UnifiedRenderer
  private currentMText: MTextObject | null = null
  private mtextBox: THREE.LineSegments | null = null
  private charBoxOverlays: THREE.Object3D[] = []
  private lineBoxOverlays: THREE.Object3D[] = []

  // DOM elements
  private mtextInput: HTMLTextAreaElement
  private renderBtn: HTMLButtonElement
  private statusDiv: HTMLDivElement
  private fontSelect: HTMLSelectElement
  private showBoundingBoxCheckbox: HTMLInputElement
  private showCharBoxesCheckbox: HTMLInputElement
  private showLineBoxesCheckbox: HTMLInputElement
  private renderModeSelect: HTMLSelectElement
  private byLayerColorInput: HTMLInputElement
  private byBlockColorInput: HTMLInputElement
  private readonly defaultLayerName = '0'

  // Example texts
  private readonly exampleTexts = {
    basic:
      '\\P{\\C1;Hello World 材料 装车位置}\\P\\P{\\C2;Diameter: %%c50}\\P{\\C3;Temperature: 25%%d}\\P{\\C4;Tolerance: %%p0.1}\\P{\\C6;\\LUnderlined\\l, \\OOverlined\\o, \\KStriked\\k}\\P{\\C7;\\Q15;Oblique 15 deg}\\P{\\C8;\\FArial|b1;Bold Text}\\P{\\C9;\\FArial|i1;Italic Text}\\P{\\C10;\\FArial|b1|i1;Bold Italic Text}\\P{\\C11;Normal height \\H0.16;Absolute font height 0.16}\\PUnicode: \\U+4F60\\U+597D (should display 你好){\\P}',
    complex:
      '{\\C1;\\W2;Title}\\P{\\C2;This is a paragraph with different styles.}\\P{\\C3;\\W1.5;Subtitle}\\P{\\C4;• First item\\P• Second item\\P• Third item}\\P{\\T2;Absolute character spacing: 2, }{\\T0.2x;Relative character spacing: 0.2}\\P{\\W0.8;Footer text}',
    controlCode:
      '{Circle diameter dimensioning symbol: %%c},\\P{Degree symbol: %%d}\\P{Plus/minus tolerance symbol: %%p}\\P{A single percent sign: %%%}\\P{Unicode character: %%130 %%131}\\P{Toggles strikethrough on and off: %%kon, %%koff}\\P{Toggles overscoring on and off.: %%oon, %%ooff}\\P{Toggles underscoring  on and off.: %%uon, %%uoff}',
    color:
      '{\\C0;By Block}\\P{\\C1;Red Text}\\P{\\C2;Yellow Text}\\P{\\C3;Green Text}\\P{\\C4;Cyan Text}\\P{\\C5;Blue Text}\\P{\\C6;Magenta Text}\\P{\\C7;White Text}\\P{\\C256;By Layer}\\P{\\c16761035;Pink (0x0FFC0CB)}\\PRestore ByLayer\\P\\C1;Old Context Color: Red, {\\C2; New Context Color: Yellow, } Restored Context Color: Red',
    font: '{\\C1;\\W2;\\FSimSun;SimSun Text 宋体文字（面积、材料、8、①④⑧⑩⑫㉔㉚）}\\P{\\C2;\\W0.5;\\FArial;Arial Text}\\P{\\C3;30;\\Faehalf.shx;SHX Text}\\P{\\C4;\\Fgbcbig.shx;东亚字符集字体}\\P{\\C5;\\Q1;\\FSimHei;SimHei Text，黑体文字}\\P{\\C6;\\Q0.5;\\FSimKai;SimKai Text}',
    stacking:
      '{\\C1;Basic Fractions:}\\P{\\C2;The value is \\S1/2; and \\S3/4; of the total.}\\P{\\C3;\\H0.16;Stacked Fractions:}\\P{\\C4;\\S1 2/3 4; represents \\Sx^ y; in the equation \\S1#2;.}\\P{\\C5;Complex Fractions:}\\P{\\C6;The result \\S1/2/3; is between \\S1^ 2^ 3; and \\S1#2#3;.}\\P{\\C7;Subscript Examples:}\\P{\\C8;H\\S^ 2;O (Water)}\\P{\\C9;CO\\S^ 2; (Carbon Dioxide)}\\P{\\C10;x\\S^ 2; + y\\S^ 2;}\\P{\\C11;Superscript Examples:}\\P{\\C12;E = mc\\S2^ ; (Energy)}\\P{\\C13;x\\S2^ ; + y\\S2^ ; = r\\S2^ ; (Circle)}\\P{\\C14;Combined Examples:}\\P{\\C15;H\\S^ 2;O\\S2^ ; (Hydrogen Peroxide)}\\P{\\C16;Fe\\S^ 2;+\\S3^ ; (Iron Ion)}',
    alignment:
      '{\\pql;Left aligned paragraph.}\\P{\\pqc;Center aligned paragraph.}\\P{\\pqr;Right aligned paragraph.}\\P{\\pqc;Center again.}\\P{\\pql;Back to left.}',
    paragraph:
      '{\\pql;\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This paragraph has an indent of 2 units, left margin of 5 units, and right margin of 5 units. The first line is indented.}\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This is the second line of the same paragraph, showing the effect of margins.}}',
    multiple: 'multiple' // Special marker for multiple MText rendering
  }

  constructor() {
    // Initialize Three.js components
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x333333)

    // Use orthographic camera for 2D rendering
    const renderArea = document.getElementById('render-area') as HTMLElement

    const width = renderArea.clientWidth
    const height = renderArea.clientHeight
    this.camera = new THREE.OrthographicCamera(0, width, height, 0, -1000, 1000)
    this.camera.position.set(0, 0, 100)
    this.camera.lookAt(new THREE.Vector3(0, 0, 0))

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(width, height, false)
    renderArea.appendChild(this.renderer.domElement)

    // Add orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false
    this.controls.screenSpacePanning = true
    this.controls.minZoom = 0.3
    this.controls.maxZoom = 5

    // Initialize unified renderer (default to main thread)
    this.unifiedRenderer = new UnifiedRenderer('main', {
      workerUrl: new URL(
        '../../mtext-renderer/src/worker/mtextWorker.ts',
        import.meta.url
      )
    })

    // Get DOM elements
    this.mtextInput = document.getElementById(
      'mtext-input'
    ) as HTMLTextAreaElement
    this.renderBtn = document.getElementById('render-btn') as HTMLButtonElement
    this.statusDiv = document.getElementById('status') as HTMLDivElement
    this.fontSelect = document.getElementById(
      'font-select'
    ) as HTMLSelectElement
    this.showBoundingBoxCheckbox = document.getElementById(
      'show-bounding-box'
    ) as HTMLInputElement
    this.showCharBoxesCheckbox = document.getElementById(
      'show-char-boxes'
    ) as HTMLInputElement
    this.showLineBoxesCheckbox = document.getElementById(
      'show-line-boxes'
    ) as HTMLInputElement
    this.renderModeSelect = document.getElementById(
      'render-mode'
    ) as HTMLSelectElement
    this.byLayerColorInput = document.getElementById(
      'by-layer-color'
    ) as HTMLInputElement
    this.byBlockColorInput = document.getElementById(
      'by-block-color'
    ) as HTMLInputElement

    // Add lights
    this.setupLights()

    // Setup event listeners
    this.setupEventListeners()

    // Initialize fonts and UI, then render
    this.initializeFonts(true)
      .then(() => {
        // Initial render after fonts are loaded
        void this.renderMText(this.mtextInput.value)
      })
      .catch(error => {
        console.error('Failed to initialize fonts:', error)
        this.statusDiv.textContent = 'Failed to initialize fonts'
        this.statusDiv.style.color = '#f00'
      })

    // Start animation loop
    this.animate()
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.set(1, 1, 1)
    this.scene.add(directionalLight)
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', () => {
      const renderArea = document.getElementById('render-area')
      if (!renderArea) return

      const width = renderArea.clientWidth
      const height = renderArea.clientHeight
      this.camera.left = 0
      this.camera.right = width
      this.camera.top = height
      this.camera.bottom = 0
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(width, height, false)
    })

    // Render button
    this.renderBtn.addEventListener('click', async () => {
      const content = this.mtextInput.value
      await this.renderMText(content)
    })

    // Font selection
    this.fontSelect.addEventListener('change', async () => {
      const content = this.mtextInput.value

      // Re-render MText with new font
      await this.renderMText(content)
    })

    // Example buttons
    document.querySelectorAll('.example-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const exampleType = (button as HTMLElement).dataset.example
        if (
          exampleType &&
          this.exampleTexts[exampleType as keyof typeof this.exampleTexts]
        ) {
          const content =
            this.exampleTexts[exampleType as keyof typeof this.exampleTexts]

          if (content === 'multiple') {
            // For multiple MText, don't update the textarea but render directly
            await this.renderMText(content)
          } else {
            // For regular examples, update textarea and render
            this.mtextInput.value = content
            await this.renderMText(content)
          }
        }
      })
    })

    // Bounding box toggle
    this.showBoundingBoxCheckbox.addEventListener('change', () => {
      if (this.mtextBox) {
        this.mtextBox.visible = this.showBoundingBoxCheckbox.checked
      }
    })

    this.showCharBoxesCheckbox.addEventListener('change', () => {
      this.setCharBoxOverlayVisibility(this.showCharBoxesCheckbox.checked)
    })
    this.showLineBoxesCheckbox.addEventListener('change', () => {
      this.setLineBoxOverlayVisibility(this.showLineBoxesCheckbox.checked)
    })

    // Render mode toggle
    this.renderModeSelect.addEventListener('change', async () => {
      const mode = this.renderModeSelect.value as RenderMode
      this.unifiedRenderer.setDefaultMode(mode)
      this.statusDiv.textContent = `Switched to ${mode} thread rendering`
      this.statusDiv.style.color = '#0f0'

      // Call this function to guarantee default font is loaded
      await this.initializeFonts(false)

      // Re-render with current content to reflect the new mode
      await this.renderMText(this.mtextInput.value)
    })

    // Color settings
    this.byLayerColorInput.addEventListener('change', async () => {
      await this.renderMText(this.mtextInput.value)
    })
    this.byBlockColorInput.addEventListener('change', async () => {
      await this.renderMText(this.mtextInput.value)
    })
  }

  private async initializeFonts(isResetAvaiableFonts = true): Promise<void> {
    try {
      if (isResetAvaiableFonts) {
        // Load available fonts for the dropdown
        const result = await this.unifiedRenderer.getAvailableFonts()
        const fonts = result.fonts

        // Clear existing options
        this.fontSelect.innerHTML = ''

        // Add all available fonts to dropdown
        fonts.forEach(font => {
          const option = document.createElement('option')
          option.value = font.name[0]
          option.textContent = font.name[0] // Use the first name from the array
          // Set selected if this is the default font
          if (font.name[0] === 'simkai') {
            option.selected = true
          }
          this.fontSelect.appendChild(option)
        })
      }

      // Load default fonts
      const selectedFont = this.fontSelect.value
      await this.unifiedRenderer.loadFonts([selectedFont])
      this.statusDiv.textContent = 'Fonts loaded successfully'
      this.statusDiv.style.color = '#0f0'
    } catch (error) {
      console.error('Error loading fonts:', error)
      this.statusDiv.textContent = 'Error loading fonts'
      this.statusDiv.style.color = '#f00'
      throw error // Re-throw to handle in the constructor
    }
  }

  /**
   * Draws a bounding box for the text using the given position, max width, and the height from the box property.
   * @param box The bounding box of the MText (for height)
   * @param position The position (THREE.Vector3) of the text box (min corner)
   * @param maxWidth The maximum width of the text box
   */
  private createMTextBox(
    box: THREE.Box3,
    position: THREE.Vector3,
    maxWidth?: number
  ): THREE.LineSegments {
    // Remove existing box if any
    if (this.mtextBox) {
      this.scene.remove(this.mtextBox)
    }

    // The min and max y/z come from the box, x is from position and maxWidth
    const minY = box.min.y
    const maxY = box.max.y
    const minZ = box.min.z
    const maxZ = box.max.z
    const minX = position.x
    const maxX =
      maxWidth !== undefined && maxWidth > 0 ? minX + maxWidth : box.max.x

    const vertices = [
      // Bottom face
      minX,
      minY,
      minZ,
      maxX,
      minY,
      minZ,
      maxX,
      minY,
      minZ,
      maxX,
      maxY,
      minZ,
      maxX,
      maxY,
      minZ,
      minX,
      maxY,
      minZ,
      minX,
      maxY,
      minZ,
      minX,
      minY,
      minZ,
      // Top face
      minX,
      minY,
      maxZ,
      maxX,
      minY,
      maxZ,
      maxX,
      minY,
      maxZ,
      maxX,
      maxY,
      maxZ,
      maxX,
      maxY,
      maxZ,
      minX,
      maxY,
      maxZ,
      minX,
      maxY,
      maxZ,
      minX,
      minY,
      maxZ,
      // Sides
      minX,
      minY,
      minZ,
      minX,
      minY,
      maxZ,
      maxX,
      minY,
      minZ,
      maxX,
      minY,
      maxZ,
      maxX,
      maxY,
      minZ,
      maxX,
      maxY,
      maxZ,
      minX,
      maxY,
      minZ,
      minX,
      maxY,
      maxZ
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

    // Apply the same transformation as the MText object
    if (this.currentMText) {
      this.mtextBox.position.copy(this.currentMText.position)
      this.mtextBox.rotation.copy(this.currentMText.rotation)
      this.mtextBox.scale.copy(this.currentMText.scale)
    }

    return this.mtextBox
  }

  private createMultipleMTextData(): {
    mtextData: MTextData
    textStyle: TextStyle
  }[] {
    const texts = [
      '\\H15.5{\\C1;Title Text 1}\\P{\\C2;Subtitle with different colors}',
      '\\H15.5{\\C3;Title Text 2}\\P{\\C4;Subtitle with different colors}',
      '\\H15.5{\\C5;Title Text 3}\\P{\\C6;Subtitle with different colors}',
      '\\H15.5{\\C7;Title Text 4}\\P{\\C8;Subtitle with different colors}',
      '\\H15.5{\\C9;Title Text 5}\\P{\\C10;Subtitle with different colors}',
      '\\H15.5{\\C11;Title Text 6}\\P{\\C12;Subtitle with different colors}',
      '\\H15.5{\\C13;Title Text 7}\\P{\\C14;Subtitle with different colors}',
      '\\H15.5{\\C15;Title Text 8}\\P{\\C16;Subtitle with different colors}',
      '\\H15.5{\\C17;Title Text 9}\\P{\\C18;Subtitle with different colors}',
      '\\H15.5{\\C19;Title Text 10}\\P{\\C20;Subtitle with different colors}'
    ]

    return texts.map((text, index) => {
      const col = index % 3
      const row = Math.floor(index / 3)
      const x = 70 + col * 300
      const y = 530 - row * 120

      return {
        mtextData: {
          text,
          height: 24,
          width: 240,
          position: new THREE.Vector3(x, y, 0)
        },
        textStyle: {
          name: 'Standard',
          standardFlag: 0,
          fixedTextHeight: 24,
          widthFactor: 1,
          obliqueAngle: 0,
          textGenerationFlag: 0,
          lastHeight: 24,
          font: this.fontSelect.value,
          bigFont: ''
        }
      }
    })
  }

  private setCharBoxOverlayVisibility(visible: boolean): void {
    this.charBoxOverlays.forEach(overlay => {
      overlay.visible = visible
    })
  }

  private setLineBoxOverlayVisibility(visible: boolean): void {
    this.lineBoxOverlays.forEach(overlay => {
      overlay.visible = visible
    })
  }

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
        minX,
        minY,
        z,
        maxX,
        minY,
        z,
        maxX,
        minY,
        z,
        maxX,
        maxY,
        z,
        maxX,
        maxY,
        z,
        minX,
        maxY,
        z,
        minX,
        maxY,
        z,
        minX,
        minY,
        z
      ]

      const outlineGeometry = new THREE.BufferGeometry()
      outlineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(outlineVertices, 3)
      )

      const outline = new THREE.LineSegments(outlineGeometry, charMaterial)
      overlay.add(outline)
    })

    return overlay
  }

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
        lineMinX,
        minY,
        z,
        lineMaxX,
        minY,
        z,
        lineMaxX,
        minY,
        z,
        lineMaxX,
        maxY,
        z,
        lineMaxX,
        maxY,
        z,
        lineMinX,
        maxY,
        z,
        lineMinX,
        maxY,
        z,
        lineMinX,
        minY,
        z
      ]
      const outlineGeometry = new THREE.BufferGeometry()
      outlineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(outlineVertices, 3)
      )
      const outline = new THREE.LineSegments(outlineGeometry, material)
      outline.frustumCulled = false
      overlay.add(outline)
    })

    return overlay
  }

  private attachCharBoxOverlay(mtextObj: MTextObject): void {
    const layout = mtextObj.createLayoutData()
    if (!layout.chars || layout.chars.length === 0) return

    const overlay = this.createCharBoxOverlay(layout.chars)
    overlay.visible = this.showCharBoxesCheckbox.checked
    overlay.renderOrder = 999
    mtextObj.add(overlay)
    this.charBoxOverlays.push(overlay)
  }

  private attachLineBoxOverlay(mtextObj: MTextObject): void {
    const layout = mtextObj.createLayoutData()
    if (!layout.lines || layout.lines.length === 0) return
    if (!mtextObj.box || mtextObj.box.isEmpty()) return

    const overlay = this.createLineBoxOverlay(
      layout.lines,
      mtextObj.box.min.x,
      mtextObj.box.max.x
    )
    overlay.visible = this.showLineBoxesCheckbox.checked
    overlay.renderOrder = 998
    mtextObj.add(overlay)
    this.lineBoxOverlays.push(overlay)
  }

  private parseColorInput(input: HTMLInputElement, fallback: number): number {
    const value = input.value?.trim()
    if (!value) return fallback

    const normalized = value.startsWith('#') ? value.slice(1) : value
    const parsed = Number.parseInt(normalized, 16)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private getColorSettings() {
    return {
      byLayerColor: this.parseColorInput(this.byLayerColorInput, 0xffffff),
      byBlockColor: this.parseColorInput(this.byBlockColorInput, 0xffffff),
      layer: this.defaultLayerName,
      color: new MTextColor(256)
    }
  }

  private async renderMText(content: string): Promise<void> {
    try {
      const startTime = performance.now()

      // Show loading status
      this.statusDiv.textContent = 'Rendering MText...'
      this.statusDiv.style.color = '#ffa500'

      // Remove existing MText if any
      if (this.currentMText) {
        this.scene.remove(this.currentMText)
      }

      // Remove existing bounding boxes
      if (this.mtextBox) {
        this.scene.remove(this.mtextBox)
        this.mtextBox = null
      }
      this.charBoxOverlays = []
      this.lineBoxOverlays = []

      let renderTime: number
      const colorSettings = this.getColorSettings()

      if (content === 'multiple') {
        // Render multiple MText objects
        const multipleData = this.createMultipleMTextData()

        const renderPromises = multipleData.map(({ mtextData, textStyle }) => {
          return this.unifiedRenderer.asyncRenderMText(
            mtextData,
            textStyle,
            colorSettings
          )
        })

        const mtextObjects: MTextObject[] = await Promise.all(renderPromises)

        // Create a group to hold all MText objects
        const group = new THREE.Group()
        let combinedBox: THREE.Box3 | null = null

        mtextObjects.forEach((mtextObj, index) => {
          this.attachCharBoxOverlay(mtextObj)
          this.attachLineBoxOverlay(mtextObj)
          group.add(mtextObj)

          // Combine bounding boxes
          if (mtextObj.box && !mtextObj.box.isEmpty()) {
            if (combinedBox === null) {
              combinedBox = mtextObj.box.clone()
            } else {
              combinedBox.union(mtextObj.box)
            }
          }

          // Add bounding boxes if enabled
          if (
            this.showBoundingBoxCheckbox.checked &&
            mtextObj.box &&
            !mtextObj.box.isEmpty()
          ) {
            const box = this.createMTextBox(
              mtextObj.box,
              new THREE.Vector3(
                multipleData[index].mtextData.position.x,
                multipleData[index].mtextData.position.y,
                multipleData[index].mtextData.position.z
              ),
              multipleData[index].mtextData.width
            )
            group.add(box)
          }
        })

        // Add combined bounding box to the group
        if (combinedBox) {
          ;(group as unknown as MTextObject).box = combinedBox
        } else {
          ;(group as unknown as MTextObject).box = new THREE.Box3()
        }

        this.currentMText = group as unknown as MTextObject
        this.scene.add(this.currentMText)

        renderTime = performance.now() - startTime
        this.statusDiv.textContent = `Rendered ${mtextObjects.length}/${multipleData.length} MText objects in ${renderTime.toFixed(2)}ms (${this.renderModeSelect.value} thread)`
      } else {
        // Render single MText object
        const mtextContent: MTextData = {
          text: content,
          height: 24,
          width: 820,
          position: new THREE.Vector3(70, 530, 0)
        }

        const textStyle: TextStyle = {
          name: 'Standard',
          standardFlag: 0,
          fixedTextHeight: 24,
          widthFactor: 1,
          obliqueAngle: 0,
          textGenerationFlag: 0,
          lastHeight: 24,
          font: this.fontSelect.value,
          bigFont: ''
        }

        // Render MText using unified renderer
        this.currentMText = await this.unifiedRenderer.asyncRenderMText(
          mtextContent,
          textStyle,
          colorSettings
        )
        this.attachCharBoxOverlay(this.currentMText)
        this.attachLineBoxOverlay(this.currentMText)
        this.scene.add(this.currentMText)

        // Create box around MText using its bounding box only if checkbox is checked
        if (
          this.showBoundingBoxCheckbox.checked &&
          this.currentMText &&
          this.currentMText.box &&
          !this.currentMText.box.isEmpty()
        ) {
          const box = this.createMTextBox(
            this.currentMText.box,
            new THREE.Vector3(
              mtextContent.position.x,
              mtextContent.position.y,
              mtextContent.position.z
            ),
            mtextContent.width
          )
          this.scene.add(box)
        }

        renderTime = performance.now() - startTime
        this.statusDiv.textContent = `MText rendered in ${renderTime.toFixed(2)}ms (${this.renderModeSelect.value} thread)`
      }

      this.statusDiv.style.color = '#0f0'
    } catch (error) {
      console.error('Error rendering MText:', error)
      this.statusDiv.textContent = 'Error rendering MText'
      this.statusDiv.style.color = '#f00'
    }
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Cleanup method to destroy the renderer
   */
  public destroy(): void {
    this.unifiedRenderer.destroy()
  }
}

// Create and start the example
const app = new MTextRendererExample()

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  app.destroy()
})
