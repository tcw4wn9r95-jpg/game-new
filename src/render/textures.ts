// Procedural ground textures. Each terrain gets a seamless sheet SHEET tiles wide,
// generated per pixel from periodic noise, so neighbouring tiles of the same ground
// join without seams.
import { Terrain } from '../sim/terrain';
import type { Biome } from './biome';

/** Sheet size in tiles. Tiles sample the sheet at (x mod SHEET, y mod SHEET). */
export const SHEET = 4;

type RGB = [number, number, number];

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise whose lattice wraps every (px, py) cells, so it tiles seamlessly. */
export function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wx0 = ((x0 % px) + px) % px, wx1 = (wx0 + 1) % px;
  const wy0 = ((y0 % py) + py) % py, wy1 = (wy0 + 1) % py;
  const a = hash2(wx0, wy0, seed), b = hash2(wx1, wy0, seed);
  const c = hash2(wx0, wy1, seed), d = hash2(wx1, wy1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Seamless fractal noise over the sheet; u, v in tiles, f = base cells per tile. */
function pfbm(u: number, v: number, f: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = SHEET * f;
    sum += pnoise(u * f, v * f, cells, cells, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Stretched noise for blades, ripples and waves; fx/fy cells per tile on each axis. */
const aniso = (u: number, v: number, fx: number, fy: number, seed: number) => pnoise(u * fx, v * fy, SHEET * fx, SHEET * fy, seed);

type Shader = (u: number, v: number, px: number, py: number) => RGB;

function shaders(b: Biome): Record<number, Shader> {
  const grass = hexRgb(b.grass), dirt = hexRgb(b.dirt), sand = hexRgb(b.sand);
  const shallow = hexRgb(b.shallow), deep = hexRgb(b.deep);
  const grassDark = scale(grass, 0.66), grassLight = mix(scale(grass, 1.2), [226, 222, 128], 0.16);
  const dry: RGB = mix(grass, [205, 190, 110], 0.55);
  return {
    [Terrain.Grass]: (u, v, px, py) => {
      const fine = pfbm(u, v, 5, 3, 11);
      const grain = pnoise(u * 14, v * 14, SHEET * 14, SHEET * 14, 15);
      const blade = aniso(u, v, 20, 11, 12);
      const coarse = pfbm(u, v, 1, 2, 13);
      let c = mix(grassDark, grassLight, clamp01(0.5 + (fine - 0.5) * 0.8 + (grain - 0.5) * 0.45 + (blade - 0.5) * 0.25 + (coarse - 0.5) * 0.45));
      if (hash2(px, py, 14) < 0.01) c = mix(c, dry, 0.6);
      return c;
    },
    [Terrain.Dirt]: (u, v) => {
      const fine = pfbm(u, v, 7, 3, 21);
      const coarse = pfbm(u, v, 1.5, 2, 22);
      let c = mix(scale(dirt, 0.72), scale(dirt, 1.14), clamp01(0.5 + (fine - 0.5) * 1.1 + (coarse - 0.5) * 0.5));
      // Pebbles: one candidate per 1/6-tile cell, lit from the top-left.
      const cells = 6;
      const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
      const wx = ((cx % (SHEET * cells)) + SHEET * cells) % (SHEET * cells), wy = ((cy % (SHEET * cells)) + SHEET * cells) % (SHEET * cells);
      if (hash2(wx, wy, 23) < 0.07) {
        const ox = (cx + 0.25 + hash2(wx, wy, 24) * 0.5) / cells, oy = (cy + 0.25 + hash2(wx, wy, 25) * 0.5) / cells;
        const r = (0.18 + hash2(wx, wy, 26) * 0.18) / cells;
        const d = Math.hypot(u - ox, v - oy);
        const ds = Math.hypot(u - ox - r * 0.35, v - oy - r * 0.35);
        if (d < r) c = mix([112, 100, 82], [168, 154, 128], clamp01(0.6 - ((u - ox) + (v - oy)) / (r * 2)));
        else if (ds < r) c = scale(c, 0.78);
      }
      return c;
    },
    [Terrain.Sand]: (u, v, px, py) => {
      const grain = pfbm(u, v, 12, 2, 31);
      const warp = pfbm(u, v, 1, 2, 32);
      const ripple = Math.sin((v * 3 + warp * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      let c = mix(scale(sand, 0.86), scale(sand, 1.08), clamp01(0.45 + (grain - 0.5) * 0.9 + (ripple - 0.5) * 0.28));
      if (hash2(px, py, 33) < 0.015) c = scale(c, 0.85);
      return c;
    },
    [Terrain.Shallow]: (u, v) => {
      const bed = pfbm(u, v, 3, 3, 41);
      const caustic = Math.pow(1 - Math.abs(2 * pfbm(u, v, 2.5, 2, 42) - 1), 7);
      const c = mix(mix(shallow, sand, 0.35), shallow, clamp01(0.4 + (bed - 0.5) * 0.9));
      return mix(c, [240, 252, 250], caustic * 0.55);
    },
    [Terrain.Deep]: (u, v) => {
      const body = pfbm(u, v, 1.5, 3, 51);
      const swell = aniso(u, v, 2, 6, 52);
      const glint = Math.pow(1 - Math.abs(2 * aniso(u + 0.37, v, 3, 12, 53) - 1), 6);
      const c = scale(deep, 0.84 + body * 0.2 + (swell - 0.5) * 0.14);
      return mix(c, [190, 220, 240], glint * 0.1);
    },
  };
}

/** Ground textures for one zoom level (`s` device px per tile). */
export class TerrainTextures {
  /** Seamless sheet per terrain, SHEET*s px square. */
  readonly sheets: HTMLCanvasElement[] = [];
  /** Raw RGBA of each sheet, for per-pixel blending at terrain boundaries. */
  readonly pixels: Uint8ClampedArray[] = [];
  /** Sheet width in px. */
  readonly P: number;

  constructor(
    readonly s: number,
    biome: Biome,
  ) {
    this.P = SHEET * s;
    const sh = shaders(biome);
    for (let t = 0; t <= Terrain.Deep; t++) {
      const [c, d] = this.sheet(sh[t]);
      this.sheets[t] = c;
      this.pixels[t] = d;
    }
  }

  private sheet(shade: Shader): [HTMLCanvasElement, Uint8ClampedArray] {
    const P = this.P;
    const c = document.createElement('canvas');
    c.width = c.height = P;
    const g = c.getContext('2d')!;
    const img = g.createImageData(P, P);
    const d = img.data;
    for (let py = 0; py < P; py++)
      for (let px = 0; px < P; px++) {
        const [r, gg, b] = shade((px + 0.5) / this.s, (py + 0.5) / this.s, px, py);
        const o = (py * P + px) * 4;
        d[o] = r;
        d[o + 1] = gg;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return [c, d];
  }
}

/** Samples per tile of the boundary-noise grid. */
export const EDGE_NOISE_RES = 32;
/** Period of the boundary-noise grid in tiles. */
export const EDGE_NOISE_TILES = 16;
let edgeNoise: Float32Array | null = null;

/**
 * Seamless noise in tile space (EDGE_NOISE_RES samples per tile, wrapping every
 * EDGE_NOISE_TILES tiles), centred on 0. Perturbs terrain boundaries so coasts and
 * dirt patches look organic rather than following the grid.
 */
export function boundaryNoise(): Float32Array {
  if (edgeNoise) return edgeNoise;
  const W = EDGE_NOISE_RES * EDGE_NOISE_TILES;
  const out = new Float32Array(W * W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const u = x / EDGE_NOISE_RES, v = y / EDGE_NOISE_RES;
      const P = EDGE_NOISE_TILES;
      const n =
        pnoise(u * 1.25, v * 1.25, P * 1.25, P * 1.25, 81) * 0.55 +
        pnoise(u * 3, v * 3, P * 3, P * 3, 82) * 0.3 +
        pnoise(u * 7, v * 7, P * 7, P * 7, 83) * 0.15;
      out[y * W + x] = n - 0.5;
    }
  edgeNoise = out;
  return out;
}
