import {
  MText,
  MTextAttachmentPoint,
  MTextData,
  MTextFlowDirection,
  MTextObject,
  ShapeData,
  TextStyle,
  UnifiedRenderer
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

/**
 * Pair of {@link MTextData} and {@link TextStyle} passed to {@link UnifiedRenderer.asyncRenderMText}.
 */
export type MTextTestCase = {
  /** Entity geometry and format string. */
  mtextData: MTextData
  /** DXF-style text style applied during layout. */
  textStyle: TextStyle
}

/**
 * Pair of {@link ShapeData} and {@link TextStyle} passed to {@link UnifiedRenderer.asyncRenderShape}.
 */
export type ShapeTestCase = {
  /** SHX shape lookup parameters and placement. */
  shapeData: ShapeData
  /** Style supplying the SHX font name and nominal height. */
  textStyle: TextStyle
}

/** Input fields from the SHAPE panel in the example UI. */
export type ShapeInputValues = {
  /** Nominal shape height in drawing units. */
  size: number
  /** Horizontal width factor (DXF group 41 analog). */
  widthFactor: number
  /** Rotation in degrees; converted to radians in {@link buildShapeDataFromInputs}. */
  rotationDeg: number
  /** SHX shape number when numeric lookup is used. */
  shapeNumber: number
  /** SHX shape name when name lookup is used. */
  shapeName: string
}

/**
 * Builds a minimal AutoCAD-style {@link TextStyle} for example test cases.
 *
 * @param font - Primary font file name (without extension).
 * @param height - Fixed text height (`fixedTextHeight` / `lastHeight`).
 */
function createStandardTextStyle(font: string, height: number): TextStyle {
  return {
    name: 'Standard',
    standardFlag: 0,
    fixedTextHeight: height,
    widthFactor: 1,
    obliqueAngle: 0,
    textGenerationFlag: 0,
    lastHeight: height,
    font,
    bigFont: ''
  }
}

/**
 * Creates twelve MText samples on a 3×4 grid exercising DXF attachment points 1–12.
 *
 * @param textFont - Font name applied to every cell's {@link TextStyle}.
 * @returns One test case per attachment point, each with a red crosshair anchor at `mtextData.position`.
 *
 * @remarks
 * Every entity shares the same insertion coordinates within a cell; only
 * {@link MTextData.attachmentPoint} varies so alignment behavior can be compared visually.
 */
export function createAttachmentPointTestData(textFont: string): MTextTestCase[] {
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
      textStyle: createStandardTextStyle(textFont, 10)
    }
  })
}

/**
 * Creates ten MText entities arranged in a 3-column grid for batch-render demos.
 *
 * @param textFont - Font applied to each entity's {@link TextStyle}.
 */
export function createMultipleMTextData(textFont: string): MTextTestCase[] {
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
      textStyle: createStandardTextStyle(textFont, 24)
    }
  })
}

/**
 * Utilities for the large WCS coordinate regression example.
 *
 * @remarks
 * Sample geometry is taken from a real DXF entity inserted near
 * `(38425645.89, 4069531.44)`. Two MText blocks (SHX + mesh) are separated by
 * {@link LargeCoordinatesExample.TEXT_DELIMITER} in the textarea. The rebase
 * variant moves insertion to the origin; the no-rebase variant deliberately
 * preserves survey coordinates to demonstrate float32 precision loss.
 */
export class LargeCoordinatesExample {
  /** Paragraph break sequence separating two editable MText blocks in the textarea. */
  static readonly TEXT_DELIMITER = '\\P\\P'

  /** Default textarea content when either large-coordinate example button is clicked. */
  static readonly DEFAULT_TEXT =
    '{\\Ftxt;SHX (476.473)}\\P\\P{\\Fsimkai;Mesh 大坐标 (476.473)}'

  /**
   * @param content - Example marker from {@link EXAMPLE_TEXTS} or a render pipeline key.
   * @returns Whether `content` selects a large-coordinate demo path.
   */
  static isExample(content: string): boolean {
    return (
      content === 'largeCoordinatesRebase' ||
      content === 'largeCoordinatesNoRebase'
    )
  }

  /**
   * @param content - Example marker passed to the render pipeline.
   * @returns `true` only for the rebase-enabled variant.
   */
  static shouldRebase(content: string): boolean {
    return content === 'largeCoordinatesRebase'
  }

  /**
   * Splits the textarea into individual MText format strings.
   *
   * @param input - Raw textarea value containing one or more blocks.
   * @returns Non-empty trimmed segments separated by {@link TEXT_DELIMITER}.
   */
  static parseTexts(input: string): string[] {
    return input
      .split(LargeCoordinatesExample.TEXT_DELIMITER)
      .map(part => part.trim())
      .filter(part => part.length > 0)
  }

  /**
   * Shared DXF-derived fields except the format `text` (height, width, WCS insert, rotation).
   */
  private static createSharedMTextData(): Omit<MTextData, 'text'> {
    return {
      height: 4.0222404674496,
      width: 100,
      position: new THREE.Vector3(38425645.890718, 4069531.4443921, 0),
      attachmentPoint: MTextAttachmentPoint.MiddleCenter,
      drawingDirection: MTextFlowDirection.BY_STYLE,
      directionVector: new THREE.Vector3(
        0.9995686730481862,
        -0.02936780313009985,
        0
      ),
      lineSpaceFactor: 1.0
    }
  }

  /**
   * Builds one {@link MTextTestCase} per parsed textarea segment.
   *
   * @param mtextInput - Full textarea contents (may contain {@link TEXT_DELIMITER}).
   * @param textFont - Base style font; inline `\\F` switches may override per run.
   */
  static createTestData(
    mtextInput: string,
    textFont: string
  ): MTextTestCase[] {
    const texts = LargeCoordinatesExample.parseTexts(mtextInput)
    const shared = LargeCoordinatesExample.createSharedMTextData()
    const textStyle = createStandardTextStyle(textFont, shared.height)

    return texts.map(text => ({
      mtextData: {
        ...shared,
        text
      },
      textStyle
    }))
  }

  /**
   * Loads fonts referenced by inline `\\F` codes plus the base text font.
   *
   * @param unifiedRenderer - Renderer whose font registry receives the load request.
   * @param texts - Parsed MText format strings from {@link parseTexts}.
   * @param baseFont - Primary style font always included in the load set.
   */
  static async loadFonts(
    unifiedRenderer: UnifiedRenderer,
    texts: string[],
    baseFont: string
  ): Promise<void> {
    const fonts = new Set<string>([baseFont])
    for (const text of texts) {
      for (const font of MText.getFonts(text, true)) {
        fonts.add(font)
      }
    }
    await unifiedRenderer.loadFonts([...fonts])
  }

  /**
   * Vertically stacks rebased MText objects for side-by-side comparison in the viewport.
   *
   * @param mtextObjects - Rendered entities whose positions are rewritten in scene space.
   *
   * @remarks
   * Uses a fixed row gap of 67 drawing units, centered around Y=0 when two blocks are present.
   */
  static layoutPair(mtextObjects: MTextObject[]): void {
    const rowGap = 67
    const startY = ((mtextObjects.length - 1) * rowGap) / 2
    mtextObjects.forEach((obj, index) => {
      obj.position.set(0, startY - index * rowGap, 0)
      obj.updateMatrixWorld(true)
    })
  }
}

/**
 * @param font - SHX font file name for SHAPE rendering.
 * @param size - Nominal shape height.
 */
export function createShapeTextStyle(font: string, size: number): TextStyle {
  return createStandardTextStyle(font, size)
}

/**
 * Maps SHAPE panel inputs to a {@link ShapeData} instance at a fixed demo position.
 *
 * @param inputs - Parsed numeric and string fields from the example UI.
 */
export function buildShapeDataFromInputs(inputs: ShapeInputValues): ShapeData {
  const shapeData: ShapeData = {
    size: inputs.size,
    widthFactor: inputs.widthFactor,
    position: new THREE.Vector3(120, 420, 0),
    rotation: (inputs.rotationDeg * Math.PI) / 180
  }

  if (inputs.shapeName) {
    shapeData.name = inputs.shapeName
  }
  if (Number.isFinite(inputs.shapeNumber) && inputs.shapeNumber > 0) {
    shapeData.shapeNumber = inputs.shapeNumber
  }

  return shapeData
}

/**
 * Creates five SHAPE test cases (numbers 128–132) from `complex.shx` in a horizontal row.
 *
 * @param font - SHX font providing the shape definitions.
 */
export function createShapeTestData(font: string): ShapeTestCase[] {
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
    textStyle: createShapeTextStyle(font, size)
  }))
}

/**
 * Produces a user-facing error when a SHAPE render returns no geometry.
 *
 * @param shapeData - Requested shape lookup parameters.
 * @param font - SHX font that was queried.
 * @returns Error message, or `null` when inputs are incomplete (handled separately).
 */
export function validateShapeInputs(
  shapeData: ShapeData,
  font: string
): string | null {
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
