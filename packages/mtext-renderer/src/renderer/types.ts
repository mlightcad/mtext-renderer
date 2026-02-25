import * as THREE from 'three'

/**
 * A 3D point in drawing coordinates.
 */
export interface Point3d {
  /** X coordinate */
  x: number
  /** Y coordinate */
  y: number
  /** Z coordinate */
  z: number
}

/**
 * A 2D point in drawing coordinates.
 */
export interface Point2d {
  /** X coordinate */
  x: number
  /** Y coordinate */
  y: number
}

/**
 * Defines the global text flow direction for MText layout.
 */
export enum MTextFlowDirection {
  /** Text flows from left to right. */
  LEFT_TO_RIGHT = 1,
  /** Text flows from right to left. */
  RIGHT_TO_LEFT = 2,
  /** Text flows from top to bottom. */
  TOP_TO_BOTTOM = 3,
  /** Text flows from bottom to top. */
  BOTTOM_TO_TOP = 4,
  /** Use the direction defined by the active text style. */
  BY_STYLE = 5
}

/**
 * Anchor position used to align rendered MText relative to its insertion point.
 */
export enum MTextAttachmentPoint {
  /** Top-left corner. */
  TopLeft = 1,
  /** Top-center point. */
  TopCenter = 2,
  /** Top-right corner. */
  TopRight = 3,
  /** Middle-left point. */
  MiddleLeft = 4,
  /** Center point. */
  MiddleCenter = 5,
  /** Middle-right point. */
  MiddleRight = 6,
  /** Bottom-left corner. */
  BottomLeft = 7,
  /** Bottom-center point. */
  BottomCenter = 8,
  /** Bottom-right corner. */
  BottomRight = 9
}

/**
 * Logical text token with optional pick box information.
 *
 * Semantics by {@link CharBoxType}:
 * - `CHAR`: `char` is the rendered character, `box` is defined, `children` is empty.
 * - `NEW_PARAGRAPH`: `char` is `\n`. The `box` represents a zero-width vertical
 *   line whose height equals the current line height. `children` is empty.
 * - `STACK`: `char` is `''`, `box` is the union box of stack components, `children` contains stack parts.
 */
export interface CharBox {
  /** Token type. */
  type: CharBoxType
  /** Token bounding box in local MText coordinates. */
  box: THREE.Box3
  /** Token character payload (`''` for `STACK`, `\n` for `NEW_PARAGRAPH`). */
  char: string
  /** Nested token components (currently used by `STACK`). */
  children: CharBox[]
}

/**
 * Type of logical token emitted in {@link CharBox} output.
 */
export enum CharBoxType {
  /** Regular rendered character token. */
  CHAR = 'CHAR',
  /** Explicit paragraph break token. */
  NEW_PARAGRAPH = 'NEW_PARAGRAPH',
  /** Stack token (for fraction-style stacked expressions). */
  STACK = 'STACK'
}

export interface StyleTraits {
  /**
   * Optional layer name. Material is identified by layer and color. So it means different
   * materials are created for the same color and differnt layer.
   */
  layer?: string
  /**
   * The color of material
   */
  color: number
  /**
   * One flag to indicate whether the color is by layer. If it is true, it means that the
   * material become invalid once layer color changed.
   */
  isByLayer?: boolean
}

/**
 * Represents the data structure for multiline text (MText) entities.
 * Contains all necessary properties to define the appearance and positioning of text.
 */
export interface MTextData {
  /** The actual text content to be displayed */
  text: string
  /** The height of the text characters in drawing units */
  height: number
  /** The width of the text box in drawing units. Text will wrap if it exceeds this width */
  width: number
  /** The 3D insertion point coordinates where the text will be placed */
  position: Point3d
  /** The rotation angle of the text in radians. Default is 0 (horizontal) */
  rotation?: number
  /** The normal vector that defines the plane in which the text lies. Used for 3D orientation */
  directionVector?: Point3d
  /** Specifies which point of the text boundary is aligned with the insertion point */
  attachmentPoint?: MTextAttachmentPoint
  /** Determines the primary direction in which text flows */
  drawingDirection?: MTextFlowDirection
  /** Factor that controls the spacing between text lines. Default is 1.0 */
  lineSpaceFactor?: number
  /** The width scaling factor applied to each character. Default is 1.0 */
  widthFactor?: number
  /** Whether to collect per-character bounding boxes for picking. Default is true */
  collectCharBoxes?: boolean
}

/**
 * Represents a text style configuration that defines the visual appearance and formatting of text.
 * This interface contains properties that control various aspects of text rendering including font,
 * dimensions, and display characteristics.
 */
export interface TextStyle extends StyleTraits {
  /** The unique name identifier for this text style */
  name: string
  /** Flag indicating standard text style settings. Controls various text generation behaviors */
  standardFlag: number
  /** The fixed height of the text in drawing units. Used when text height should remain constant */
  fixedTextHeight: number
  /** The horizontal scaling factor applied to text characters. Default is 1.0 for normal width */
  widthFactor: number
  /** The angle in radians for italic text. 0.0 represents vertical text, positive values slant to the right */
  obliqueAngle: number
  /** Bit-coded flag controlling text generation options (e.g., mirroring, upside-down) */
  textGenerationFlag: number
  /** The most recently used text height for this style */
  lastHeight: number
  /** The primary font name or file to be used for text rendering */
  font: string
  /** The font name or file to be used for wide characters (typically used for CJK characters) */
  bigFont: string
  /** Optional extended font settings or alternative font specification */
  extendedFont?: string
}

/**
 * Defines the default color settings for special color modes in text rendering.
 * These settings are used to resolve color values when text uses layer-dependent
 * or block-dependent coloring.
 */
export interface ColorSettings {
  /** The color value to use when text is set to "by layer" color mode */
  byLayerColor: number
  /** The color value to use when text is set to "by block" color mode */
  byBlockColor: number
}
