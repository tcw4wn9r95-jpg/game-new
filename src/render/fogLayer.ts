import type { Fog } from '../sim/fog';

export const FOG_RGB = [5, 7, 13] as const;
const EXPLORED_ALPHA = 130;

/**
 * One texel per tile, drawn stretched with bilinear filtering so fog edges are soft.
 * Rebuilt only when the fog's version changes.
 */
export class FogLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private version = -1;

  constructor(private readonly fog: Fog) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = fog.size;
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(fog.size, fog.size);
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = FOG_RGB[0];
      d[i + 1] = FOG_RGB[1];
      d[i + 2] = FOG_RGB[2];
    }
  }

  refresh(): void {
    if (this.version === this.fog.version) return;
    this.version = this.fog.version;
    const { visible, explored } = this.fog;
    const d = this.img.data;
    for (let i = 0, p = 3; i < visible.length; i++, p += 4) d[p] = visible[i] ? 0 : explored[i] ? EXPLORED_ALPHA : 255;
    this.g.putImageData(this.img, 0, 0);
  }
}
