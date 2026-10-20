// Procedural material textures for buildings: plaster, masonry, wood, thatch,
// shingles, canvas and packed earth. Each is a seamless tile painted at device
// resolution (k device px per unit) and used as a CanvasPattern scaled back to
// units, so detail stays crisp at every zoom level. Light comes from the upper left.
import { Rng } from '../sim/rng';

type G = CanvasRenderingContext2D;
type RGB = [number, number, number];

export type Material = 'plaster' | 'stone' | 'woodH' | 'woodV' | 'thatch' | 'shingle' | 'canvas' | 'earth' | 'planks';

/** Tile size in units for each material. */
const SIZE: Record<Material, [number, number]> = {
  plaster: [64, 64],
  stone: [48, 30],
  woodH: [64, 24],
  woodV: [24, 64],
  thatch: [48, 40],
  shingle: [40, 30],
  canvas: [48, 48],
  earth: [64, 64],
  planks: [64, 24],
};

const cache = new Map<string, CanvasPattern>();

/** Parses '#rrggbb' or 'rgb(r,g,b)'. */
export function rgbOf(c: string): RGB {
  if (c[0] !== '#') {
    const m = c.match(/[\d.]+/g) ?? ['0', '0', '0'];
    return [+m[0], +m[1], +m[2]];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function css([r, g, b]: RGB, a = 1): string {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

/** Scales a colour's brightness (k < 1 darker, k > 1 toward white), with a small hue jitter. */
function tone(c: RGB, k: number, warm = 0): RGB {
  const f = (v: number) => Math.max(0, Math.min(255, k >= 1 ? v + (255 - v) * (k - 1) : v * k));
  return [f(c[0] + warm), f(c[1]), f(c[2] - warm)];
}

/** Smooth, periodic value noise on the unit square: tiles seamlessly. */
function periodicNoise(rng: Rng, cells: number): (u: number, v: number) => number {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const at = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Multiplies every pixel by 1 + f(u, v) where u, v in [0, 1). */
function modulate(g: G, w: number, h: number, f: (u: number, v: number, px: number, py: number) => number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const m = 1 + f(px / w, py / h, px, py);
      const o = (py * w + px) * 4;
      d[o] = Math.min(255, d[o] * m);
      d[o + 1] = Math.min(255, d[o + 1] * m);
      d[o + 2] = Math.min(255, d[o + 2] * m);
    }
  g.putImageData(img, 0, 0);
}

/** Draws `paint` at x and its wrapped copies so shapes crossing an edge tile seamlessly. */
function wrapped(W: number, H: number, x: number, y: number, w: number, h: number, paint: (x: number, y: number) => void): void {
  for (const dx of [0, -W, W])
    for (const dy of [0, -H, H]) {
      if (x + dx > W || x + dx + w < 0 || y + dy > H || y + dy + h < 0) continue;
      paint(x + dx, y + dy);
    }
}

type Painter = (g: G, W: number, H: number, k: number, base: RGB, rng: Rng) => void;

const PAINT: Record<Material, Painter> = {
  plaster(g, W, H, k, base, rng) {
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    const lo = periodicNoise(rng, 4), mid = periodicNoise(rng, 11), streak = periodicNoise(rng, 9);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const w = Math.round(W * k), h = Math.round(H * k);
    modulate(g, w, h, (u, v) => {
      // Mottling, water stains running down, and fine grit.
      const s = streak(u, v * 0.15);
      return (lo(u, v) - 0.5) * 0.16 + (mid(u, v) - 0.5) * 0.08 - Math.max(0, s - 0.62) * 0.5 + (Math.random() - 0.5) * 0.07;
    });
    g.setTransform(k, 0, 0, k, 0, 0);
    // A few hairline cracks.
    g.strokeStyle = css(tone(base, 0.55), 0.35);
    g.lineWidth = 0.35;
    for (let n = 0; n < 3; n++) {
      let x = rng.next() * W, y = rng.next() * H;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (rng.next() - 0.5) * 6;
        y += 2 + rng.next() * 3;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  stone(g, W, H, k, base, rng) {
    // Mortar, then rough-cut stones in courses, each lit from the upper left.
    g.fillStyle = css(tone(base, 1.18));
    g.fillRect(0, 0, W, H);
    const rows = 5, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const widths: number[] = [];
      let sum = 0;
      while (sum < W) {
        const w = 6 + rng.next() * 8;
        widths.push(w);
        sum += w;
      }
      const scale = W / sum;
      let x = rng.next() * 6;
      for (const w0 of widths) {
        const w = w0 * scale;
        const y = r * rh;
        const c = tone(base, 0.78 + rng.next() * 0.38, (rng.next() - 0.5) * 18);
        wrapped(W, H, x, y, w, rh, (sx, sy) => {
          const inset = 0.45;
          const x0 = sx + inset, y0 = sy + inset, x1 = sx + w - inset, y1 = sy + rh - inset;
          const rr = Math.min(1.4, (x1 - x0) / 4);
          g.beginPath();
          g.roundRect(x0, y0, x1 - x0, y1 - y0, rr);
          const grad = g.createLinearGradient(x0, y0, x1, y1);
          grad.addColorStop(0, css(tone(c, 1.12)));
          grad.addColorStop(1, css(tone(c, 0.8)));
          g.fillStyle = grad;
          g.fill();
          // Upper-left bevel highlight, lower-right shadow.
          g.lineWidth = 0.5;
          g.strokeStyle = css(tone(c, 1.35), 0.6);
          g.beginPath();
          g.moveTo(x0 + rr, y0 + 0.3);
          g.lineTo(x1 - rr, y0 + 0.3);
          g.stroke();
          g.strokeStyle = 'rgba(20,16,12,0.45)';
          g.beginPath();
          g.moveTo(x0 + 0.3, y1 - 0.25);
          g.lineTo(x1 - 0.3, y1 - 0.25);
          g.lineTo(x1 - 0.25, y0 + rr);
          g.stroke();
        });
        x += w;
      }
    }
    const lo = periodicNoise(rng, 6);
    g.setTransform(1, 0, 0, 1, 0, 0);
    modulate(g, Math.round(W * k), Math.round(H * k), (u, v) => (lo(u, v) - 0.5) * 0.14 + (Math.random() - 0.5) * 0.12);
    g.setTransform(k, 0, 0, k, 0, 0);
  },
  woodH(g, W, H, k, base, rng) {
    paintWood(g, W, H, k, base, rng, false);
  },
  woodV(g, W, H, k, base, rng) {
    paintWood(g, W, H, k, base, rng, true);
  },
  planks(g, W, H, k, base, rng) {
    // Horizontal boards with dark seams and the odd knot.
    paintWood(g, W, H, k, base, rng, false);
    const n = 6, bh = H / n;
    for (let i = 0; i < n; i++) {
      const y = i * bh;
      g.fillStyle = css(tone(base, 0.75 + rng.next() * 0.4), 0.35);
      g.fillRect(0, y, W, bh);
      g.fillStyle = 'rgba(25,14,6,0.55)';
      g.fillRect(0, y + bh - 0.55, W, 0.55);
      g.fillStyle = 'rgba(255,230,190,0.18)';
      g.fillRect(0, y, W, 0.35);
      const seam = rng.next() * W;
      g.fillStyle = 'rgba(25,14,6,0.5)';
      g.fillRect(seam, y, 0.5, bh);
    }
  },
  thatch(g, W, H, k, base, rng) {
    // Bundled straw laid in overlapping courses; strands run down the slope (+v).
    g.fillStyle = css(tone(base, 0.45));
    g.fillRect(0, 0, W, H);
    const courses = 4, ch = H / courses;
    for (let c = 0; c < courses; c++) {
      const y0 = c * ch;
      for (let n = 0; n < W * 3.2; n++) {
        const x = rng.next() * W;
        const len = ch * (0.8 + rng.next() * 0.7);
        const y = y0 - ch * 0.25 + rng.next() * ch * 0.2;
        const col = tone(base, 0.62 + rng.next() * 0.62, (rng.next() - 0.5) * 20);
        const lean = (rng.next() - 0.5) * 1.6;
        wrapped(W, H, x - 1, y, 2, len, (sx, sy) => {
          const grad = g.createLinearGradient(0, sy, 0, sy + len);
          grad.addColorStop(0, css(tone(col, 0.55)));
          grad.addColorStop(0.75, css(col));
          grad.addColorStop(1, css(tone(col, 1.15)));
          g.strokeStyle = grad;
          g.lineWidth = 0.45 + rng.next() * 0.45;
          g.beginPath();
          g.moveTo(sx + 1, sy);
          g.lineTo(sx + 1 + lean, sy + len);
          g.stroke();
        });
      }
      // Shadow cast by the course above onto this one.
      const sh = g.createLinearGradient(0, y0, 0, y0 + ch * 0.35);
      sh.addColorStop(0, 'rgba(20,12,4,0.45)');
      sh.addColorStop(1, 'rgba(20,12,4,0)');
      g.fillStyle = sh;
      g.fillRect(0, y0, W, ch * 0.35);
    }
    const lo = periodicNoise(rng, 5);
    g.setTransform(1, 0, 0, 1, 0, 0);
    modulate(g, Math.round(W * k), Math.round(H * k), (u, v) => (lo(u, v) - 0.5) * 0.22);
    g.setTransform(k, 0, 0, k, 0, 0);
  },
  shingle(g, W, H, k, base, rng) {
    // Split wooden shingles in staggered rows, weathered unevenly.
    g.fillStyle = 'rgb(28,18,10)';
    g.fillRect(0, 0, W, H);
    const rows = 6, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 2.5 - 2.5;
      while (x < W) {
        const w = 3.2 + rng.next() * 2.4;
        const c = tone(base, 0.7 + rng.next() * 0.5, (rng.next() - 0.5) * 14);
        const y = r * rh;
        wrapped(W, H, x, y, w, rh * 1.5, (sx, sy) => {
          const grad = g.createLinearGradient(0, sy, 0, sy + rh * 1.4);
          grad.addColorStop(0, css(tone(c, 0.6)));
          grad.addColorStop(1, css(tone(c, 1.1)));
          g.fillStyle = grad;
          g.beginPath();
          g.roundRect(sx + 0.25, sy, w - 0.5, rh * 1.4, [0, 0, 0.6, 0.6]);
          g.fill();
          g.fillStyle = 'rgba(255,235,200,0.18)';
          g.fillRect(sx + 0.3, sy + rh * 1.25, w - 0.6, 0.3);
        });
        x += w;
      }
    }
    const lo = periodicNoise(rng, 5);
    g.setTransform(1, 0, 0, 1, 0, 0);
    modulate(g, Math.round(W * k), Math.round(H * k), (u, v) => (lo(u, v) - 0.5) * 0.25 + (Math.random() - 0.5) * 0.08);
    g.setTransform(k, 0, 0, k, 0, 0);
  },
  canvas(g, W, H, k, base, rng) {
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    const lo = periodicNoise(rng, 3), stain = periodicNoise(rng, 7);
    g.setTransform(1, 0, 0, 1, 0, 0);
    modulate(g, Math.round(W * k), Math.round(H * k), (u, v, px, py) => {
      // Sagging folds between the ropes, the weave, and weather stains.
      const fold = Math.sin(u * Math.PI * 6) * 0.07;
      const weave = ((px + py) & 1 ? 0.025 : -0.025) + ((px >> 1) & 1 ? 0.012 : -0.012);
      return fold + (lo(u, v) - 0.5) * 0.12 - Math.max(0, stain(u, v) - 0.66) * 0.6 + weave;
    });
    g.setTransform(k, 0, 0, k, 0, 0);
  },
  earth(g, W, H, k, base, rng) {
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    const lo = periodicNoise(rng, 5), mid = periodicNoise(rng, 14);
    g.setTransform(1, 0, 0, 1, 0, 0);
    modulate(g, Math.round(W * k), Math.round(H * k), (u, v) => (lo(u, v) - 0.5) * 0.3 + (mid(u, v) - 0.5) * 0.14 + (Math.random() - 0.5) * 0.16);
    g.setTransform(k, 0, 0, k, 0, 0);
    // Pebbles and tufts of straw trodden into the ground.
    for (let n = 0; n < 40; n++) {
      const x = rng.next() * W, y = rng.next() * H, r = 0.4 + rng.next() * 0.9;
      const c = tone(base, 0.8 + rng.next() * 0.6);
      wrapped(W, H, x - r, y - r, r * 2, r * 2, (sx, sy) => {
        g.fillStyle = 'rgba(20,12,6,0.35)';
        g.beginPath();
        g.ellipse(sx + r + 0.3, sy + r + 0.3, r, r * 0.7, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = css(c);
        g.beginPath();
        g.ellipse(sx + r, sy + r, r, r * 0.7, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
  },
};

function paintWood(g: G, W: number, H: number, k: number, base: RGB, rng: Rng, vertical: boolean): void {
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, H);
  const warp = periodicNoise(rng, 4), lo = periodicNoise(rng, 3);
  const rings = 9 + Math.floor(rng.next() * 4);
  g.setTransform(1, 0, 0, 1, 0, 0);
  modulate(g, Math.round(W * k), Math.round(H * k), (u, v) => {
    // Grain runs along the board: bands across it, wavering along it.
    const [a, b] = vertical ? [v, u] : [u, v];
    const t = b * rings + warp(a, b) * 2.2;
    const band = Math.pow(Math.abs(Math.sin(t * Math.PI)), 6);
    return -band * 0.22 + (lo(a, b) - 0.5) * 0.16 + (Math.random() - 0.5) * 0.06;
  });
  g.setTransform(k, 0, 0, k, 0, 0);
}

/**
 * A repeating pattern of `mat` in `base` colour, drawn in units for a canvas
 * whose current transform maps one unit to `k` device px.
 */
export function material(g: G, mat: Material, base: string, k: number, seed = 1): CanvasPattern {
  const kq = Math.round(k * 4) / 4;
  const key = `${mat}|${base}|${kq}|${seed}`;
  let p = cache.get(key);
  if (p) return p;
  const [W, H] = SIZE[mat];
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(W * kq));
  c.height = Math.max(4, Math.round(H * kq));
  const tg = c.getContext('2d', { willReadFrequently: true })!;
  tg.setTransform(kq, 0, 0, kq, 0, 0);
  PAINT[mat](tg, W, H, kq, rgbOf(base), new Rng(seed * 7919 + mat.length * 131 + rgbOf(base).reduce((a, v) => a * 31 + v, 0)));
  p = g.createPattern(c, 'repeat')!;
  p.setTransform(new DOMMatrix().scale(W / c.width, H / c.height));
  cache.set(key, p);
  return p;
}

/** Fine luminance grain and gentle colour grading over a finished sprite, for a painted, photographic feel. */
export function grade(c: HTMLCanvasElement, grain = 0.05, seed = 1): void {
  const g = c.getContext('2d')!;
  if (!c.width || !c.height) return;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const rng = new Rng(seed);
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] === 0) continue;
    const r = d[o], gg = d[o + 1], b = d[o + 2];
    // Pull saturation in a touch and warm the highlights, like late-afternoon sun.
    const l = 0.3 * r + 0.59 * gg + 0.11 * b;
    const n = 1 + (rng.next() - 0.5) * grain;
    const sat = 0.9;
    d[o] = Math.min(255, (l + (r - l) * sat) * n + (l > 150 ? 4 : 0));
    d[o + 1] = Math.min(255, (l + (gg - l) * sat) * n + (l > 150 ? 2 : 0));
    d[o + 2] = Math.min(255, (l + (b - l) * sat) * n);
  }
  g.putImageData(img, 0, 0);
}
