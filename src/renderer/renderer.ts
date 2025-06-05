import { TextStyle } from './types';

export interface Renderer {
  render: (parsedMText: string) => void;
  setStyle: (style: TextStyle) => void;
  dispose: () => void;
}
