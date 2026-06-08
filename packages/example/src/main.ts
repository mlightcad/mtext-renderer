import {
  CharBox,
  CharBoxType,
  DefaultFontsPreset,
  FontInfo,
  LineLayout,
  MTextAttachmentPoint,
  MTextColor,
  MTextData,
  MTextObject,
  RenderMode,
  ShapeData,
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
  private defaultFontsPresetSelect: HTMLSelectElement
  private contentTypeSelect: HTMLSelectElement
  private mtextPanel: HTMLDivElement
  private shapePanel: HTMLDivElement
  private shapeFontSelect: HTMLSelectElement
  private shapeNameInput: HTMLInputElement
  private shapeNumberInput: HTMLInputElement
  private shapeSizeInput: HTMLInputElement
  private shapeWidthFactorInput: HTMLInputElement
  private shapeRotationInput: HTMLInputElement
  private showBoundingBoxCheckbox: HTMLInputElement
  private showCharBoxesCheckbox: HTMLInputElement
  private showLineBoxesCheckbox: HTMLInputElement
  private renderModeSelect: HTMLSelectElement
  private byLayerColorInput: HTMLInputElement
  private byBlockColorInput: HTMLInputElement
  private fontCacheInput: HTMLInputElement
  private fontCacheBtn: HTMLButtonElement
  private readonly defaultLayerName = '0'
  private readonly supportedFontExtensions = new Set([
    '.shx',
    '.ttf',
    '.otf',
    '.woff'
  ])

  // Example texts
  private readonly exampleTexts = {
    basic:
      '\\P{\\C1;Hello World 材料 装车位置}\\P\\P{\\C2;Diameter: %%c50}\\P{\\C3;Temperature: 25%%d}\\P{\\C4;Tolerance: %%p0.1}\\P{\\C6;\\LUnderlined\\l, \\OOverlined\\o, \\KStriked\\k}\\P{\\C7;\\Q15;Oblique 15 deg}\\P{\\C8;\\FArial|b1;Bold Text}\\P{\\C9;\\FArial|i1;Italic Text}\\P{\\C10;\\FArial|b1|i1;Bold Italic Text}\\P{\\C11;Normal height \\H0.16;Absolute font height 0.16}\\PUnicode: \\U+4F60\\U+597D (should display 你好){\\P}',
    complex:
      '{\\C1;\\W2;Title}\\P{\\C2;This is a paragraph with different styles.}\\P{\\C3;\\W1.5;Subtitle}\\P{\\C4;• First item\\P• Second item\\P• Third item}\\P{\\T2;Absolute character spacing: 2, }{\\T0.2x;Relative character spacing: 0.2}\\P{\\W0.8;Footer text}',
    controlCode:
      '{Circle diameter dimensioning symbol: %%c},\\P{Degree symbol: %%d}\\P{Plus/minus tolerance symbol: %%p}\\P{A single percent sign: %%%}\\P{Unicode character: %%130 %%131 \\Ftssdeng;%%1326@600}\\P{Strikethrough toggle (%%k): %%kstruck%%k normal}\\P{Strikethrough explicit: %%konstruck%%koff normal}\\P{Overscore toggle (%%o): %%oover%%o normal}\\P{Overscore explicit: %%oonover%%ooff normal}\\P{Underscore toggle (%%u): %%uunder%%u normal}\\P{Underscore explicit: %%uonunder%%uoff normal}',
    color:
      '{\\C0;By Block}\\P{\\C1;Red Text}\\P{\\C2;Yellow Text}\\P{\\C3;Green Text}\\P{\\C4;Cyan Text}\\P{\\C5;Blue Text}\\P{\\C6;Magenta Text}\\P{\\C7;White Text}\\P{\\C256;By Layer}\\P{\\c16761035;Pink (0x0FFC0CB)}\\PRestore ByLayer\\P\\C1;Old Context Color: Red, {\\C2; New Context Color: Yellow, } Restored Context Color: Red',
    font: '{\\C1;\\W2;\\FSimSun;SimSun 宋体}\\P{\\F仿宋_gb2312;SimFang 仿宋（面积、材料、8、①④⑧⑩⑫㉔㉚）}\\P{\\C2;\\W0.5;\\FArial;Arial Text}\\P{\\C3;30;\\Faehalf.shx;SHX Text “250~280”}\\P{\\C4;\\Fgbcbig.shx;东亚字符集字体}\\P{\\C5;\\Q1;\\FSimHei;SimHei Text，黑体}\\P{\\C6;\\Q0.5;\\FSimKai;SimKai 楷体}',
    defaultFonts:
      '{\\C1;Primary \\Ftxt;txt (SHX) — Latin: Hello %%c50}\\P{\\C2;CJK falls back via preset chain: 材料 装车 直径 你好}\\P{\\C3;Symbol %%c %%d %%p — may use gdt in chain}\\P{\\C4;Switch preset above and re-render to compare fallback order}',
    stacking:
      '%%c30{\\C3;\\H0.7x;\\S+0.021^  0;}\\P{\\C1;Basic Fractions:}\\P{\\C2;The value is \\S1/2; and \\S3/4; of the total.}\\P{\\C3;\\H0.16;Stacked Fractions:}\\P{\\C4;\\S1 2/3 4; represents \\Sx^ y; in the equation \\S1#2;.}\\P{\\C5;Complex Fractions:}\\P{\\C6;The result \\S1/2/3; is between \\S1^ 2^ 3; and \\S1#2#3;.}\\P{\\C7;Subscript Examples:}\\P{\\C8;H\\S^ 2;O (Water)}\\P{\\C9;CO\\S^ 2; (Carbon Dioxide)}\\P{\\C10;x\\S^ 2; + y\\S^ 2;}\\P{\\C11;Superscript Examples:}\\P{\\C12;E = mc\\S2^ ; (Energy)}\\P{\\C13;x\\S2^ ; + y\\S2^ ; = r\\S2^ ; (Circle)}\\P{\\C14;Combined Examples:}\\P{\\C15;H\\S^ 2;O\\S2^ ; (Hydrogen Peroxide)}\\P{\\C16;Fe\\S^ 2;+\\S3^ ; (Iron Ion)}',
    alignment:
      '{\\pql;Left aligned paragraph.}\\P{\\pqc;Center aligned paragraph.}\\P{\\pqr;Right aligned paragraph.}\\P{\\pqc;Center again.}\\P{\\pql;Back to left.}',
    paragraph:
      '{\\pql;\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This paragraph has an indent of 2 units, left margin of 5 units, and right margin of 5 units. The first line is indented.}\\P{\\pqi;\\pxi2;\\pxl5;\\pxr5;This is the second line of the same paragraph, showing the effect of margins.}}',
    multiple: 'multiple', // Special marker for multiple MText rendering
    /** Grid of SHX shape glyphs from complex.shx (shape numbers 128–132). */
    shapes: 'shapes',
    /** DXF group 71 attachment points 1–12; renders a grid with insertion crosshairs */
    attachmentGrid: 'attachmentGrid'
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
    this.defaultFontsPresetSelect = document.getElementById(
      'default-fonts-preset'
    ) as HTMLSelectElement
    this.contentTypeSelect = document.getElementById(
      'content-type'
    ) as HTMLSelectElement
    this.mtextPanel = document.getElementById('mtext-panel') as HTMLDivElement
    this.shapePanel = document.getElementById('shape-panel') as HTMLDivElement
    this.shapeFontSelect = document.getElementById(
      'shape-font-select'
    ) as HTMLSelectElement
    this.shapeNameInput = document.getElementById(
      'shape-name'
    ) as HTMLInputElement
    this.shapeNumberInput = document.getElementById(
      'shape-number'
    ) as HTMLInputElement
    this.shapeSizeInput = document.getElementById(
      'shape-size'
    ) as HTMLInputElement
    this.shapeWidthFactorInput = document.getElementById(
      'shape-width-factor'
    ) as HTMLInputElement
    this.shapeRotationInput = document.getElementById(
      'shape-rotation'
    ) as HTMLInputElement
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
    this.fontCacheInput = document.getElementById(
      'font-cache-input'
    ) as HTMLInputElement
    this.fontCacheBtn = document.getElementById(
      'font-cache-btn'
    ) as HTMLButtonElement

    // Add lights
    this.setupLights()

    // Setup event listeners
    this.setupEventListeners()

    // Initialize fonts and UI, then render
    this.initializeFonts(true)
      .then(() => {
        // Initial render after fonts are loaded
        void this.renderCurrentContent()
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
      await this.renderCurrentContent()
    })

    this.contentTypeSelect.addEventListener('change', () => {
      this.updateContentPanels()
      void this.renderCurrentContent()
    })
    this.updateContentPanels()

    ;[
      this.shapeFontSelect,
      this.shapeNameInput,
      this.shapeNumberInput,
      this.shapeSizeInput,
      this.shapeWidthFactorInput,
      this.shapeRotationInput
    ].forEach(element => {
      element.addEventListener('change', () => {
        if (this.contentTypeSelect.value === 'shape') {
          void this.renderCurrentContent()
        }
      })
    })

    // Text style font selection
    this.fontSelect.addEventListener('change', async () => {
      await this.applyDefaultFontsPreset()
      await this.renderCurrentContent()
    })

    // Default fonts preset (fallback chain)
    this.defaultFontsPresetSelect.addEventListener('change', async () => {
      await this.applyDefaultFontsPreset()
      await this.renderCurrentContent()
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

          if (content === 'shapes') {
            this.contentTypeSelect.value = 'shape'
            this.updateContentPanels()
            await this.renderCurrentContent('shapes')
          } else if (content === 'multiple' || content === 'attachmentGrid') {
            this.contentTypeSelect.value = 'mtext'
            this.updateContentPanels()
            await this.renderCurrentContent(content)
          } else {
            this.contentTypeSelect.value = 'mtext'
            this.updateContentPanels()
            this.mtextInput.value = content
            await this.renderCurrentContent(content)
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
      await this.renderCurrentContent()
    })

    // Color settings
    this.byLayerColorInput.addEventListener('change', async () => {
      await this.renderCurrentContent()
    })
    this.byBlockColorInput.addEventListener('change', async () => {
      await this.renderCurrentContent()
    })

    this.fontCacheBtn.addEventListener('click', async () => {
      await this.cacheSelectedFontFile()
    })
    this.fontCacheInput.addEventListener('change', () => {
      const file = this.fontCacheInput.files?.[0]
      this.fontCacheBtn.disabled = !file
    })
    this.fontCacheBtn.disabled = !this.fontCacheInput.files?.[0]
  }

  private updateContentPanels(): void {
    const isShape = this.contentTypeSelect.value === 'shape'
    this.mtextPanel.classList.toggle('hidden', isShape)
    this.shapePanel.classList.toggle('hidden', !isShape)
    this.renderBtn.textContent = isShape ? 'Render Shape' : 'Render'
    this.showCharBoxesCheckbox.disabled = isShape
    this.showLineBoxesCheckbox.disabled = isShape
  }

  private async renderCurrentContent(content?: string): Promise<void> {
    if (this.contentTypeSelect.value === 'shape') {
      await this.renderShape(content)
      return
    }
    await this.renderMText(content ?? this.mtextInput.value)
  }

  private getSelectedDefaultFontsPreset(): DefaultFontsPreset {
    return this.defaultFontsPresetSelect.value as DefaultFontsPreset
  }

  private async applyDefaultFontsPreset(): Promise<void> {
    const preset = this.getSelectedDefaultFontsPreset()
    await this.unifiedRenderer.setDefaultFonts(preset)
    const textChain = this.unifiedRenderer.getDefaultFontsPreset(preset)
    const symbolChain = this.unifiedRenderer.getSymbolFontsPreset(preset)
    const fontsToLoad = [
      ...new Set([
        ...textChain,
        ...symbolChain,
        this.fontSelect.value,
        this.shapeFontSelect.value
      ])
    ]
    await this.unifiedRenderer.loadFonts(fontsToLoad)
    this.statusDiv.textContent = `Preset "${preset}": text ${textChain.join(' → ')} | symbol ${symbolChain.join(' → ')}`
    this.statusDiv.style.color = '#0f0'
  }

  private getFontExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.')
    if (dotIndex < 0) {
      return ''
    }
    return fileName.slice(dotIndex).toLowerCase()
  }

  private isSupportedFontFile(file: File): boolean {
    return this.supportedFontExtensions.has(this.getFontExtension(file.name))
  }

  private formatFontLabel(font: FontInfo): string {
    const label = font.name[0]
    return font.source === 'cache' ? `${label} [cached]` : label
  }

  private populateFontSelects(
    fonts: FontInfo[],
    selectedTextFont?: string,
    selectedShapeFont?: string
  ): void {
    const previousTextFont = selectedTextFont ?? this.fontSelect.value
    const previousShapeFont = selectedShapeFont ?? this.shapeFontSelect.value

    this.fontSelect.innerHTML = ''
    this.shapeFontSelect.innerHTML = ''

    let textFontMatched = false
    let shapeFontMatched = false

    const matchesSelection = (
      font: FontInfo,
      selectedName: string
    ): boolean =>
      font.name.some(
        name => name.toLowerCase() === selectedName.toLowerCase()
      )

    fonts.forEach(font => {
      const option = document.createElement('option')
      option.value = font.name[0]
      option.textContent = this.formatFontLabel(font)
      if (matchesSelection(font, previousTextFont)) {
        option.selected = true
        textFontMatched = true
      } else if (!textFontMatched && font.name[0] === 'simkai') {
        option.selected = true
        textFontMatched = true
      }
      this.fontSelect.appendChild(option)

      if (font.type === 'shx' || font.file.toLowerCase().endsWith('.shx')) {
        const shapeOption = document.createElement('option')
        shapeOption.value = font.name[0]
        shapeOption.textContent = this.formatFontLabel(font)
        if (matchesSelection(font, previousShapeFont)) {
          shapeOption.selected = true
          shapeFontMatched = true
        } else if (!shapeFontMatched && font.name[0] === 'complex') {
          shapeOption.selected = true
          shapeFontMatched = true
        }
        this.shapeFontSelect.appendChild(shapeOption)
      }
    })
  }

  private async refreshAvailableFonts(
    selectedTextFont?: string,
    selectedShapeFont?: string
  ): Promise<FontInfo[]> {
    const result = await this.unifiedRenderer.getAvailableFonts()
    const fonts = result.fonts as FontInfo[]
    this.populateFontSelects(fonts, selectedTextFont, selectedShapeFont)
    return fonts
  }

  private async cacheSelectedFontFile(): Promise<void> {
    const file = this.fontCacheInput.files?.[0]
    if (!file) {
      this.statusDiv.textContent = 'Select a font file to cache'
      this.statusDiv.style.color = '#f00'
      return
    }

    if (!this.isSupportedFontFile(file)) {
      this.statusDiv.textContent =
        'Unsupported font type. Use .shx, .ttf, .otf, or .woff'
      this.statusDiv.style.color = '#f00'
      return
    }

    try {
      this.statusDiv.textContent = `Caching ${file.name}...`
      this.statusDiv.style.color = '#ffa500'
      this.fontCacheBtn.disabled = true

      const status = await this.unifiedRenderer.cacheFont(file)
      if (status.status !== 'Success') {
        this.statusDiv.textContent = `Failed to cache ${file.name}`
        this.statusDiv.style.color = '#f00'
        return
      }

      await this.refreshAvailableFonts(status.fontName, status.fontName)

      await this.applyDefaultFontsPreset()
      await this.renderCurrentContent()

      this.statusDiv.textContent = `Cached and loaded ${file.name} (${status.fontName})`
      this.statusDiv.style.color = '#0f0'
      this.fontCacheInput.value = ''
    } catch (error) {
      console.error('Error caching font:', error)
      this.statusDiv.textContent = 'Error caching font'
      this.statusDiv.style.color = '#f00'
    } finally {
      this.fontCacheBtn.disabled = !this.fontCacheInput.files?.[0]
    }
  }

  private async initializeFonts(isResetAvaiableFonts = true): Promise<void> {
    try {
      if (isResetAvaiableFonts) {
        await this.refreshAvailableFonts()
      }

      await this.applyDefaultFontsPreset()
    } catch (error) {
      console.error('Error loading fonts:', error)
      this.statusDiv.textContent = 'Error loading fonts'
      this.statusDiv.style.color = '#f00'
      throw error // Re-throw to handle in the constructor
    }
  }

  /**
   * Draws a bounding box from the renderer-computed MText extents.
   */
  private createMTextBox(box: THREE.Box3): THREE.LineSegments {
    const minX = box.min.x
    const maxX = box.max.x
    const minY = box.min.y
    const maxY = box.max.y
    const minZ = box.min.z
    const maxZ = box.max.z

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
    return this.mtextBox
  }

  /**
   * Small cross at the insertion point (DXF alignment anchor) for visual checks.
   */
  private createInsertionCrosshair(
    x: number,
    y: number,
    arm = 22,
    z = 0.03
  ): THREE.LineSegments {
    const vertices = new Float32Array([
      x - arm,
      y,
      z,
      x + arm,
      y,
      z,
      x,
      y - arm,
      z,
      x,
      y + arm,
      z
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
    lines.renderOrder = 1000
    return lines
  }

  /**
   * Twelve MText samples on a 3×4 grid (DXF attachment 1–9 then 10–12).
   * Each entity shares the same insertion coordinates as the red crosshair;
   * only {@link MTextData.attachmentPoint} changes so you can compare layout.
   */
  private createAttachmentPointTestData(): {
    mtextData: MTextData
    textStyle: TextStyle
  }[] {
    const cellW = 330
    const cellH = 175
    const originX = 60
    const originY = 610

    const cells: {
      attachmentPoint: MTextAttachmentPoint
      title: string
      subtitle: string
      col: number
      row: number
    }[] = [
      {
        attachmentPoint: MTextAttachmentPoint.TopLeft,
        title: '1 TopLeft',
        subtitle: 'GC71=1',
        col: 0,
        row: 0
      },
      {
        attachmentPoint: MTextAttachmentPoint.TopCenter,
        title: '2 TopCenter',
        subtitle: 'GC71=2',
        col: 1,
        row: 0
      },
      {
        attachmentPoint: MTextAttachmentPoint.TopRight,
        title: '3 TopRight',
        subtitle: 'GC71=3',
        col: 2,
        row: 0
      },
      {
        attachmentPoint: MTextAttachmentPoint.MiddleLeft,
        title: '4 MiddleLeft',
        subtitle: 'GC71=4',
        col: 0,
        row: 1
      },
      {
        attachmentPoint: MTextAttachmentPoint.MiddleCenter,
        title: '5 MiddleCenter',
        subtitle: 'GC71=5',
        col: 1,
        row: 1
      },
      {
        attachmentPoint: MTextAttachmentPoint.MiddleRight,
        title: '6 MiddleRight',
        subtitle: 'GC71=6',
        col: 2,
        row: 1
      },
      {
        attachmentPoint: MTextAttachmentPoint.BottomLeft,
        title: '7 BottomLeft',
        subtitle: 'GC71=7',
        col: 0,
        row: 2
      },
      {
        attachmentPoint: MTextAttachmentPoint.BottomCenter,
        title: '8 BottomCenter',
        subtitle: 'GC71=8',
        col: 1,
        row: 2
      },
      {
        attachmentPoint: MTextAttachmentPoint.BottomRight,
        title: '9 BottomRight',
        subtitle: 'GC71=9',
        col: 2,
        row: 2
      },
      {
        attachmentPoint: MTextAttachmentPoint.BaselineLeft,
        title: '10 BaselineL',
        subtitle: 'GC71=10',
        col: 0,
        row: 3
      },
      {
        attachmentPoint: MTextAttachmentPoint.BaselineCenter,
        title: '11 BaselineC',
        subtitle: 'GC71=11',
        col: 1,
        row: 3
      },
      {
        attachmentPoint: MTextAttachmentPoint.BaselineRight,
        title: '12 BaselineR',
        subtitle: 'GC71=12',
        col: 2,
        row: 3
      }
    ]

    return cells.map(({ attachmentPoint, title, subtitle, col, row }) => {
      const cx = originX + col * cellW + cellW / 2
      const cy = originY - row * cellH - cellH / 2
      const text = `{\\C1;${title}}\\P{\\C3;${subtitle}}\\P{\\C2;+ anchor}\\P{\\C7;sample}`

      return {
        mtextData: {
          text,
          height: 10,
          width: 170,
          position: new THREE.Vector3(cx, cy, 0),
          attachmentPoint
        },
        textStyle: {
          name: 'Standard',
          standardFlag: 0,
          fixedTextHeight: 10,
          widthFactor: 1,
          obliqueAngle: 0,
          textGenerationFlag: 0,
          lastHeight: 10,
          font: this.fontSelect.value,
          bigFont: ''
        }
      }
    })
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

  private createShapeTextStyle(font: string, size: number): TextStyle {
    return {
      name: 'Standard',
      standardFlag: 0,
      fixedTextHeight: size,
      widthFactor: 1,
      obliqueAngle: 0,
      textGenerationFlag: 0,
      lastHeight: size,
      font,
      bigFont: ''
    }
  }

  private buildShapeDataFromInputs(): ShapeData {
    const size = Number(this.shapeSizeInput.value) || 24
    const widthFactor = Number(this.shapeWidthFactorInput.value) || 1
    const rotationDeg = Number(this.shapeRotationInput.value) || 0
    const shapeNumber = Number(this.shapeNumberInput.value)
    const shapeName = this.shapeNameInput.value.trim()

    const shapeData: ShapeData = {
      size,
      widthFactor,
      position: new THREE.Vector3(120, 420, 0),
      rotation: (rotationDeg * Math.PI) / 180
    }

    if (shapeName) {
      shapeData.name = shapeName
    }
    if (Number.isFinite(shapeNumber) && shapeNumber > 0) {
      shapeData.shapeNumber = shapeNumber
    }

    return shapeData
  }

  private createShapeTestData(): {
    shapeData: ShapeData
    textStyle: TextStyle
  }[] {
    const font = this.shapeFontSelect.value || 'complex'
    const size = 28
    const shapeNumbers = [128, 129, 130, 131, 132]
    const originX = 90
    const originY = 420
    const gapX = 110

    return shapeNumbers.map((shapeNumber, index) => ({
      shapeData: {
        shapeNumber,
        size,
        widthFactor: 1,
        position: new THREE.Vector3(originX + index * gapX, originY, 0)
      },
      textStyle: this.createShapeTextStyle(font, size)
    }))
  }

  private clearSceneContent(): void {
    if (this.currentMText) {
      this.scene.remove(this.currentMText)
      this.currentMText = null
    }
    if (this.mtextBox) {
      this.scene.remove(this.mtextBox)
      this.mtextBox = null
    }
    this.charBoxOverlays = []
    this.lineBoxOverlays = []
  }

  private isShapeRenderEmpty(shapeObj: MTextObject): boolean {
    return shapeObj.children.length === 0 || shapeObj.box.isEmpty()
  }

  private validateShapeInputs(shapeData: ShapeData, font: string): string | null {
    const name = shapeData.name?.trim()
    const number = shapeData.shapeNumber
    const hasName = Boolean(name)
    const hasNumber = number != null && number > 0

    if (!hasName && !hasNumber) {
      return 'Provide a shape name or shape number'
    }
    if (hasName && !hasNumber) {
      return `Shape name "${name}" not found in ${font}.shx`
    }
    if (!hasName && hasNumber) {
      return `Shape number ${number} not found in ${font}.shx`
    }
    return `Shape name "${name}" and number ${number} not found in ${font}.shx`
  }

  private async renderShape(content?: string): Promise<void> {
    try {
      const startTime = performance.now()
      this.statusDiv.textContent = 'Rendering SHAPE...'
      this.statusDiv.style.color = '#ffa500'

      this.clearSceneContent()
      const colorSettings = this.getColorSettings()
      const shapeFont = this.shapeFontSelect.value || 'complex'
      await this.unifiedRenderer.loadFonts([shapeFont])

      const isGrid = content === 'shapes'

      if (!isGrid) {
        const shapeData = this.buildShapeDataFromInputs()
        const hasName = Boolean(shapeData.name?.trim())
        const hasNumber =
          shapeData.shapeNumber != null && shapeData.shapeNumber > 0
        if (!hasName && !hasNumber) {
          this.statusDiv.textContent = 'Provide a shape name or shape number'
          this.statusDiv.style.color = '#f00'
          return
        }
      }

      const items = isGrid
        ? this.createShapeTestData()
        : [
            {
              shapeData: this.buildShapeDataFromInputs(),
              textStyle: this.createShapeTextStyle(
                shapeFont,
                Number(this.shapeSizeInput.value) || 24
              )
            }
          ]

      const shapeObjects = await Promise.all(
        items.map(({ shapeData, textStyle }) =>
          this.unifiedRenderer.asyncRenderShape(
            shapeData,
            textStyle,
            colorSettings
          )
        )
      )

      if (!isGrid) {
        const shapeObj = shapeObjects[0]
        if (this.isShapeRenderEmpty(shapeObj)) {
          this.statusDiv.textContent = this.validateShapeInputs(
            items[0].shapeData,
            shapeFont
          )
          this.statusDiv.style.color = '#f00'
          return
        }
      }

      const group = new THREE.Group()
      let combinedBox: THREE.Box3 | null = null

      if (isGrid) {
        items.forEach(({ shapeData }) => {
          group.add(
            this.createInsertionCrosshair(
              shapeData.position.x,
              shapeData.position.y,
              14
            )
          )
        })
      } else {
        const { position } = items[0].shapeData
        group.add(
          this.createInsertionCrosshair(position.x, position.y, 18)
        )
      }

      shapeObjects.forEach(shapeObj => {
        group.add(shapeObj)
        if (shapeObj.box && !shapeObj.box.isEmpty()) {
          if (combinedBox === null) {
            combinedBox = shapeObj.box.clone()
          } else {
            combinedBox.union(shapeObj.box)
          }
          if (
            this.showBoundingBoxCheckbox.checked &&
            !shapeObj.box.isEmpty()
          ) {
            group.add(this.createMTextBox(shapeObj.box))
          }
        }
      })

      ;(group as unknown as MTextObject).box = combinedBox ?? new THREE.Box3()
      this.currentMText = group as unknown as MTextObject
      this.scene.add(this.currentMText)

      const renderTime = performance.now() - startTime
      const label = isGrid
        ? `${shapeObjects.length} SHX shapes (128–132)`
        : `SHAPE #${items[0].shapeData.shapeNumber ?? items[0].shapeData.name ?? '?'}`
      this.statusDiv.textContent = `Rendered ${label} in ${renderTime.toFixed(2)}ms (main thread; SHAPE uses sync path)`
      this.statusDiv.style.color = '#0f0'
    } catch (error) {
      console.error('Error rendering SHAPE:', error)
      this.statusDiv.textContent = 'Error rendering SHAPE'
      this.statusDiv.style.color = '#f00'
    }
  }

  private async renderMText(content: string): Promise<void> {
    try {
      const startTime = performance.now()

      // Show loading status
      this.statusDiv.textContent = 'Rendering MText...'
      this.statusDiv.style.color = '#ffa500'

      // Remove existing content if any
      this.clearSceneContent()

      let renderTime: number
      const colorSettings = this.getColorSettings()

      const multiData =
        content === 'multiple'
          ? this.createMultipleMTextData()
          : content === 'attachmentGrid'
            ? this.createAttachmentPointTestData()
            : null

      if (multiData) {
        const renderPromises = multiData.map(({ mtextData, textStyle }) => {
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

        if (content === 'attachmentGrid') {
          for (const { mtextData } of multiData) {
            group.add(
              this.createInsertionCrosshair(
                mtextData.position.x,
                mtextData.position.y
              )
            )
          }
        }

        mtextObjects.forEach(mtextObj => {
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
            const box = this.createMTextBox(mtextObj.box)
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
        const label =
          content === 'attachmentGrid' ? 'attachment-point grid' : 'MText batch'
        this.statusDiv.textContent = `Rendered ${mtextObjects.length}/${multiData.length} (${label}) in ${renderTime.toFixed(2)}ms (${this.renderModeSelect.value} thread)`
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
          const box = this.createMTextBox(this.currentMText.box)
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
