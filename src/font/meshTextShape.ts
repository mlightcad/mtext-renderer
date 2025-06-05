import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

import { BaseTextShape } from './baseTextShape';
import { MeshFont } from './meshFont';

export class MeshTextShape extends BaseTextShape {
  /**
   * Flag to indicate whether the character is found or not.
   */
  public isFound = false;

  private readonly font: MeshFont;
  private readonly fontSize: number;

  constructor(char: string, fontSize: number, font: MeshFont) {
    super(char);
    this.fontSize = fontSize;
    this.font = font;
    this.width = this.getCharWidth(char, fontSize, font);
  }

  toGeometry(): THREE.BufferGeometry {
    return new TextGeometry(this.char, {
      font: this.font.font,
      depth: 0,
      size: this.fontSize,
      curveSegments: 3, // change this to increase/decrease display precision
      bevelSegments: 3,
    });
  }

  private getCharWidth(char: string, fontSize: number, font: MeshFont) {
    const glyph = font.data.glyphs[char];
    if (!glyph) {
      this.isFound = false;
      return 0;
    }
    this.isFound = true;
    return (glyph.ha * fontSize) / font.data.resolution;
  }
}
