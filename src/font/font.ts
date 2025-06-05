import { ShxFontData } from '@mlightcad/shx-parser';
import { MeshFontData } from './meshFont';

export type FontDataType = ShxFontData | MeshFontData;

/**
 * Represents font data stored in the cache database
 */
export interface FontData {
  /** The file name of the font */
  fileName: string;
  /** The order/priority of the font */
  order: number;
  /** Mapping of character codes to their bitmap data */
  data: FontDataType;
}
