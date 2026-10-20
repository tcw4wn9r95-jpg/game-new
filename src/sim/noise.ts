import { Rng } from './rng';

/** Seeded 2D value noise with fractal octaves. Output roughly in [0, 1]. */
export class Noise {
  private perm = new Uint8Array(512);
  private vals = new Float32Array(256);

  constructor(rng: Rng) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = rng.next();
  }

  private lattice(x: number, y: number): number {
    return this.vals[this.perm[(this.perm[x & 255] + y) & 511]];
  }

  value(x: number, y: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(x0, y0), b = this.lattice(x0 + 1, y0);
    const c = this.lattice(x0, y0 + 1), d = this.lattice(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /** Fractal sum; `scale` is the base feature size in tiles. */
  fbm(x: number, y: number, scale: number, octaves = 3): number {
    let sum = 0, amp = 1, norm = 0, f = 1 / scale;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(x * f + o * 17.3, y * f + o * 31.7) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
