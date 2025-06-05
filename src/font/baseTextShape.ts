import * as THREE from 'three';

/**
 * The class represents the shape of one character.
 */
export abstract class BaseTextShape extends THREE.Shape {
  /**
   * The character of the shape
   */
  public readonly char: string;
  /**
   * Width used to render this character
   */
  public width = 0;

  /**
   * Constructor
   * @param char - The character of the shape
   */
  constructor(char: string) {
    super();
    this.char = char;
  }

  /**
   * Converts current text shape to THREE.BufferGeometry
   */
  abstract toGeometry(): THREE.BufferGeometry;
}
