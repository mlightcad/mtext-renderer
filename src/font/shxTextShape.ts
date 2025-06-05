import { Point, ShxShape } from '@mlightcad/shx-parser';
import * as THREE from 'three';

import { BaseTextShape } from './baseTextShape';

export class ShxTextShape extends BaseTextShape {
  private readonly shape: ShxShape;

  constructor(char: string, shape: ShxShape) {
    super(char);
    this.shape = shape;
    this.width = this.calcWidth();
  }

  protected calcWidth() {
    const box = this.shape.bbox;
    return box.maxX - box.minX;
  }

  offset(offset: Point) {
    return new ShxTextShape(this.char, this.shape.offset(offset));
  }

  /**
   * Converts current text shape to THREE.BufferGeometry
   */
  toGeometry() {
    const polylines = this.shape.polylines;
    const positions = [];
    const indices = [];
    let index = 0;
    const geom = new THREE.BufferGeometry();
    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i];
      for (let j = 0; j < line.length; j++) {
        const coord = line[j];
        positions.push(coord.x, coord.y, 0);
        if (j === line.length - 1) {
          index++;
        } else {
          indices.push(index, index + 1);
          index++;
        }
      }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    return geom;
  }
}
