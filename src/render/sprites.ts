// Procedural object sprites, drawn as vector shapes in a 32-unit-per-tile space and
// rasterised once per zoom level. Light comes from the upper left; shadows fall
// to the lower right.
import { Rng } from '../sim/rng';

export interface Sprite {
  c: HTMLCanvasElement;
  /** Anchor in device px: this canvas point is placed on the object's ground point. */
  ax: number;
  ay: number;
  /** Drawn this many times its canvas size (art painted below display resolution to save memory). */
  k?: number;
}

const bytesOf = (s: Sprite) => s.c.width * s.c.height * 4;

/**
 * Sprites rendered on demand, kept up to a memory budget: the least recently
 * drawn are dropped (and their canvases released) when it is exceeded. Phones
 * cap total canvas memory, and running out locks the page up.
 */
export class SpriteCache {
  private readonly map = new Map<string, Sprite>();
  private bytes = 0;

  constructor(private readonly budget: number) {}

  get(key: string, make: () => Sprite): Sprite {
    let sp = this.map.get(key);
    if (sp) {
      // Most recently used goes to the back of the queue.
      this.map.delete(key);
      this.map.set(key, sp);
      return sp;
    }
    sp = make();
    this.map.set(key, sp);
    this.bytes += bytesOf(sp);
    while (this.bytes > this.budget && this.map.size > 1) {
      const [k, old] = this.map.entries().next().value as [string, Sprite];
      this.map.delete(k);
      this.bytes -= bytesOf(old);
      old.c.width = old.c.height = 0;
    }
    return sp;
  }

  clear(): void {
    for (const sp of this.map.values()) sp.c.width = sp.c.height = 0;
    this.map.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.bytes;
  }
}

/** Trims a sprite's canvas to its painted pixels (keeping the anchor in place). */
export function cropSprite(sp: Sprite): Sprite {
  const { c } = sp;
  if (!c.width || !c.height) return sp;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return sp;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, -x0, -y0);
  c.width = c.height = 0;
  return { c: out, ax: sp.ax - x0, ay: sp.ay - y0, k: sp.k };
}

type Painter = (g: CanvasRenderingContext2D) => void;
type RGB = [number, number, number];

/** w, h, ax, ay in 32-unit tile space. */
function make(s: number, w: number, h: number, ax: number, ay: number, paint: Painter, flip = false): Sprite {
  const u = s / 32;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * u);
  c.height = Math.ceil(h * u);
  const g = c.getContext('2d')!;
  if (flip) {
    g.translate(c.width, 0);
    g.scale(-1, 1);
  }
  g.scale(u, u);
  paint(g);
  return { c, ax: (flip ? w - ax : ax) * u, ay: ay * u };
}

const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** Soft elliptical ground shadow, offset away from the light. */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.38) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, `rgba(10,16,4,${alpha})`);
  grad.addColorStop(0.6, `rgba(10,16,4,${alpha * 0.6})`);
  grad.addColorStop(1, 'rgba(10,16,4,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function trunk(g: CanvasRenderingContext2D, x: number, base: number, top: number, w: number) {
  const grad = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  grad.addColorStop(0, '#7a5634');
  grad.addColorStop(0.5, '#5a3c22');
  grad.addColorStop(1, '#32210f');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x - w / 2 - 0.6, base);
  g.lineTo(x - w / 2 + 0.4, top);
  g.lineTo(x + w / 2 - 0.4, top);
  g.lineTo(x + w / 2 + 0.6, base);
  g.closePath();
  g.fill();
}

/** Points inside an ellipse, each with a lighting value from its position. */
function leafPoints(rng: Rng, cx: number, cy: number, rx: number, ry: number, n: number) {
  const pts: Array<{ x: number; y: number; l: number }> = [];
  while (pts.length < n) {
    const nx = rng.next() * 2 - 1, ny = rng.next() * 2 - 1;
    if (nx * nx + ny * ny > 1) continue;
    const l = clamp01(0.55 - nx * 0.38 - ny * 0.45 + (rng.next() - 0.5) * 0.35);
    pts.push({ x: cx + nx * rx, y: cy + ny * ry, l });
  }
  return pts.sort((a, b) => a.l - b.l);
}

/**
 * Fine foliage grain over whatever was drawn last: hundreds of tiny dark and
 * light flecks, kept inside the canopy with 'source-atop'.
 */
function foliageGrain(g: CanvasRenderingContext2D, rng: Rng, x0: number, y0: number, x1: number, y1: number, count: number): void {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < count; k++) {
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0);
    // Upper-left flecks catch light, lower-right ones fall in shade.
    const lit = (x - x0) / (x1 - x0) + (y - y0) / (y1 - y0) < 0.9;
    g.fillStyle = rng.next() < (lit ? 0.6 : 0.25) ? `rgba(225,240,170,${0.25 + rng.next() * 0.3})` : `rgba(5,20,5,${0.25 + rng.next() * 0.3})`;
    const r = 0.5 + rng.next() * 0.9;
    g.fillRect(x, y, r, r);
  }
  g.restore();
}

/** Long soft shadow thrown to the lower right by a tall object. */
function castShadow(g: CanvasRenderingContext2D, x: number, y: number, len: number, w: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(-0.18);
  const grad = g.createRadialGradient(len * 0.45, 0, 0, len * 0.45, 0, len * 0.6);
  grad.addColorStop(0, 'rgba(10,16,4,0.38)');
  grad.addColorStop(0.7, 'rgba(10,16,4,0.18)');
  grad.addColorStop(1, 'rgba(10,16,4,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(len * 0.45, 0, len * 0.6, w, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Broadleaf tree: a dark under-mass, then many shaded leaf clusters, light on top. */
function broadleaf(seed: number, leaf: RGB): Painter {
  const dark = mix(leaf, [8, 20, 6], 0.55), light = mix(leaf, [230, 235, 140], 0.38);
  return (g) => {
    const rng = new Rng(seed);
    const cx = 20, base = 44, cy = 22, rx = 13 + rng.next() * 2, ry = 11.5 + rng.next() * 2;
    castShadow(g, cx - 2, base - 1, 34, 7);
    trunk(g, cx, base, cy + 4, 3.4);
    // Branch hints under the canopy.
    g.strokeStyle = '#4a311b';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(cx, cy + 9);
    g.lineTo(cx - 5, cy + 3);
    g.moveTo(cx + 0.5, cy + 8);
    g.lineTo(cx + 6, cy + 2);
    g.stroke();
    for (const p of leafPoints(rng, cx, cy, rx, ry, 22)) circle(g, p.x, p.y + 1, 3.6 + rng.next() * 2.4, rgb(dark));
    for (const p of leafPoints(rng, cx, cy - 0.5, rx - 1.5, ry - 1.5, 70)) {
      const c = p.l < 0.5 ? mix(dark, leaf, p.l * 2) : mix(leaf, light, (p.l - 0.5) * 2);
      circle(g, p.x, p.y, 2 + rng.next() * 2, rgb(c));
    }
    for (let k = 0; k < 10; k++) {
      const p = leafPoints(rng, cx - 4, cy - 4, rx * 0.5, ry * 0.45, 1)[0];
      circle(g, p.x, p.y, 0.9, rgb(mix(light, [255, 255, 220], 0.4), 0.8));
    }
    foliageGrain(g, rng, cx - rx - 4, cy - ry - 4, cx + rx + 4, cy + ry + 4, 420);
  };
}

/** Conifer: stacked, jagged tiers shaded left-to-right, with a soft long shadow. */
function conifer(seed: number, tall: boolean, needle: RGB): Painter {
  const dark = mix(needle, [5, 15, 10], 0.6), light = mix(needle, [200, 225, 160], 0.3);
  return (g) => {
    const rng = new Rng(seed);
    const cx = 20, base = 44, top = tall ? 4 : 10;
    castShadow(g, cx - 2, base - 1, tall ? 40 : 32, 5.5);
    trunk(g, cx, base, base - 9, 2.6);
    const tiers = tall ? 6 : 5;
    const height = base - 6 - top;
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1);
      const ty = top + t * height * 0.78;
      const half = 3 + t * (tall ? 9 : 11);
      const tierH = height * 0.32;
      const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
      grad.addColorStop(0, rgb(light));
      grad.addColorStop(0.45, rgb(needle));
      grad.addColorStop(1, rgb(dark));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, ty);
      const jag = 7;
      for (let j = 1; j <= jag; j++) {
        const f = j / jag;
        g.lineTo(cx + half * f + (j % 2 ? 1.2 : -0.5), ty + tierH * f + (j % 2 ? -0.6 : 0.6) + rng.next() * 0.6);
      }
      for (let j = jag; j >= 0; j--) {
        const f = j / jag;
        g.lineTo(cx - half * f + (j % 2 ? -1.2 : 0.5), ty + tierH * f + (j % 2 ? -0.6 : 0.6) + rng.next() * 0.6);
      }
      g.closePath();
      g.fill();
      // Underside shade of the tier.
      g.fillStyle = rgb(dark, 0.45);
      g.fillRect(cx - half * 0.8, ty + tierH * 0.86, half * 1.6, 1.1);
    }
    // Needles: short dark and light strokes over the tiers.
    g.save();
    g.globalCompositeOperation = 'source-atop';
    for (let k = 0; k < 260; k++) {
      const y = top + rng.next() * (base - 6 - top), x = cx + (rng.next() - 0.5) * 26;
      g.strokeStyle = rng.next() < (x < cx ? 0.55 : 0.2) ? 'rgba(200,230,170,0.35)' : 'rgba(0,15,5,0.4)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (x < cx ? -1.4 : 1.4), y + 1.2);
      g.stroke();
    }
    g.restore();
  };
}

/** Decor: a clump of grass blades. */
function grassTuft(seed: number): Painter {
  return (g) => {
    const rng = new Rng(seed);
    shadow(g, 9, 12, 7, 2, 0.22);
    const n = 9 + Math.floor(rng.next() * 6);
    for (let k = 0; k < n; k++) {
      const x = 4 + rng.next() * 10, h = 5 + rng.next() * 6, lean = (rng.next() - 0.5) * 6;
      g.strokeStyle = rng.next() < 0.5 ? '#5f8a34' : rng.next() < 0.5 ? '#7da444' : '#c2b866';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x, 12);
      g.quadraticCurveTo(x + lean * 0.3, 12 - h * 0.6, x + lean, 12 - h);
      g.stroke();
    }
  };
}

/** Decor: a low leafy shrub. */
function shrub(seed: number): Painter {
  return (g) => {
    const rng = new Rng(seed);
    const leaf: RGB = [62, 98, 44];
    const dark = mix(leaf, [5, 15, 5], 0.55), light = mix(leaf, [215, 230, 150], 0.4);
    castShadow(g, 12, 17, 22, 4);
    for (const p of leafPoints(rng, 13, 11, 9, 6, 16)) circle(g, p.x, p.y + 1, 2.8, rgb(dark));
    for (const p of leafPoints(rng, 13, 10.5, 8, 5.5, 46)) circle(g, p.x, p.y, 1.4 + rng.next() * 1.2, rgb(p.l < 0.5 ? mix(dark, leaf, p.l * 2) : mix(leaf, light, (p.l - 0.5) * 2)));
    foliageGrain(g, rng, 3, 3, 23, 18, 160);
  };
}

/** Decor: a few pebbles. */
function pebbles(seed: number): Painter {
  return (g) => {
    const rng = new Rng(seed);
    for (let k = 0; k < 4; k++) {
      const x = 3 + rng.next() * 10, y = 7 + rng.next() * 4, r = 1.2 + rng.next() * 1.4;
      circle(g, x + 0.6, y + 0.6, r, 'rgba(10,16,4,0.3)');
      g.fillStyle = rgb(mix([110, 106, 98], [190, 186, 176], rng.next()));
      g.beginPath();
      g.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
}

/** Decor: wild flowers among grass. */
function flowers(seed: number, color: string): Painter {
  return (g) => {
    grassTuft(seed)(g);
    const rng = new Rng(seed + 9);
    for (let k = 0; k < 5; k++) {
      const x = 4 + rng.next() * 10, y = 4 + rng.next() * 5;
      circle(g, x, y, 1.1, color);
      circle(g, x, y, 0.4, '#f6e27a');
    }
  };
}

/** A pile of faceted rocks; optional ore nuggets with glints. */
function rockPile(seed: number, rock: RGB, ore?: RGB): Painter {
  const dark = mix(rock, [10, 10, 12], 0.55), light = mix(rock, [255, 255, 245], 0.35);
  return (g) => {
    const rng = new Rng(seed);
    shadow(g, 19, 25, 15, 5, 0.42);
    const stones = [
      [10, 21, 7.5],
      [24, 21, 8],
      [17, 14, 7],
      [6, 25, 4],
      [29, 25, 4.5],
    ];
    for (const [x, y, r] of stones) {
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = r * (0.78 + rng.next() * 0.3) * (Math.sin(a) > 0 ? 0.75 : 1);
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]);
      }
      const grad = g.createLinearGradient(x - r, y - r, x + r, y + r);
      grad.addColorStop(0, rgb(light));
      grad.addColorStop(0.5, rgb(rock));
      grad.addColorStop(1, rgb(dark));
      g.fillStyle = grad;
      g.strokeStyle = rgb(mix(dark, [0, 0, 0], 0.4));
      g.lineWidth = 0.7;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fill();
      g.stroke();
      // Top facet catches the light.
      g.fillStyle = rgb(light, 0.55);
      g.beginPath();
      g.moveTo(x - r * 0.55, y - r * 0.2);
      g.lineTo(x - r * 0.1, y - r * 0.62);
      g.lineTo(x + r * 0.45, y - r * 0.38);
      g.lineTo(x + r * 0.05, y - r * 0.05);
      g.closePath();
      g.fill();
      if (ore) {
        for (let k = 0; k < 3; k++) {
          const ox = x + (rng.next() - 0.5) * r, oy = y + (rng.next() - 0.4) * r * 0.8;
          const or = 0.9 + rng.next() * 1.3;
          g.fillStyle = rgb(mix(ore, [90, 60, 0], 0.4));
          g.beginPath();
          g.ellipse(ox + 0.3, oy + 0.3, or, or * 0.8, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = rgb(ore);
          g.beginPath();
          g.ellipse(ox, oy, or, or * 0.8, 0, 0, Math.PI * 2);
          g.fill();
          circle(g, ox - or * 0.35, oy - or * 0.35, or * 0.35, 'rgba(255,250,210,0.95)');
        }
      }
    }
    if (ore) {
      // Glints.
      g.strokeStyle = 'rgba(255,255,230,0.9)';
      g.lineWidth = 0.6;
      for (const [x, y] of [[13, 12], [27, 18]]) {
        g.beginPath();
        g.moveTo(x - 2, y);
        g.lineTo(x + 2, y);
        g.moveTo(x, y - 2);
        g.lineTo(x, y + 2);
        g.stroke();
      }
    }
  };
}

const berryBush: Painter = (g) => {
  const rng = new Rng(77);
  const leaf: RGB = [52, 104, 46];
  const dark = mix(leaf, [5, 15, 5], 0.55), light = mix(leaf, [210, 230, 140], 0.35);
  shadow(g, 18, 25, 13, 4.5);
  for (const p of leafPoints(rng, 16, 17, 11, 8, 18)) circle(g, p.x, p.y + 1, 3.2, rgb(dark));
  for (const p of leafPoints(rng, 16, 16.5, 10, 7, 50)) circle(g, p.x, p.y, 1.8 + rng.next() * 1.4, rgb(p.l < 0.5 ? mix(dark, leaf, p.l * 2) : mix(leaf, light, (p.l - 0.5) * 2)));
  for (let k = 0; k < 16; k++) {
    const p = leafPoints(rng, 16, 17, 9, 6, 1)[0];
    circle(g, p.x + 0.3, p.y + 0.3, 1.25, '#5a0d22');
    circle(g, p.x, p.y, 1.15, '#c8264f');
    circle(g, p.x - 0.4, p.y - 0.4, 0.4, '#ffc2d2');
  }
};

const sheep: Painter = (g) => {
  const rng = new Rng(5);
  shadow(g, 11, 15, 8, 2.6);
  g.fillStyle = '#2c2622';
  for (const x of [5.5, 8, 13, 15.5]) g.fillRect(x, 11, 1.2, 4);
  for (let k = 0; k < 26; k++) {
    const p = leafPoints(rng, 10.5, 9, 6, 3.8, 1)[0];
    circle(g, p.x, p.y, 1.8, rgb(mix([150, 148, 138], [252, 250, 240], p.l)));
  }
  g.fillStyle = '#2c2622';
  g.beginPath();
  g.ellipse(17.5, 8.5, 2.4, 1.8, 0.3, 0, Math.PI * 2);
  g.fill();
  circle(g, 16.4, 7.4, 0.9, '#3e3630');
};

const deer: Painter = (g) => {
  shadow(g, 12, 19, 9, 2.6);
  g.fillStyle = '#5b3a1e';
  for (const x of [6, 8.5, 15, 17]) g.fillRect(x, 11, 1.2, 8);
  const body = g.createLinearGradient(0, 6, 0, 14);
  body.addColorStop(0, '#b07a46');
  body.addColorStop(1, '#6d4524');
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(11.5, 10.5, 7.5, 3.6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8d6bb';
  g.beginPath();
  g.ellipse(4.6, 9.6, 1.4, 1.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9b6a3c';
  g.beginPath();
  g.moveTo(16.5, 9);
  g.lineTo(19, 3);
  g.lineTo(21.2, 3.6);
  g.lineTo(19.2, 10);
  g.closePath();
  g.fill();
  g.beginPath();
  g.ellipse(21, 3.6, 2.6, 1.5, 0.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d8c6a4';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(19.6, 2.4);
  g.lineTo(18.4, -0.2 + 1);
  g.moveTo(18.9, 1.5);
  g.lineTo(17.2, 1.2);
  g.moveTo(20.4, 2.2);
  g.lineTo(21.6, 0.6);
  g.stroke();
};

const fish: Painter = (g) => {
  g.strokeStyle = 'rgba(230,245,255,0.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(14, 10, 11, 5, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(12,38,66,0.6)';
  g.beginPath();
  g.ellipse(13, 10, 6, 2.2, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(18.5, 10);
  g.lineTo(22, 7.5);
  g.lineTo(21.5, 12.5);
  g.closePath();
  g.fill();
};

const OAK_DARK: RGB = [46, 96, 40];
const OAK_LIGHT: RGB = [72, 128, 52];
const PINE: RGB = [36, 92, 58];
const PINE_TALL: RGB = [30, 80, 54];

/** All object sprites for one zoom level (`s` device px per tile). */
export class SpriteSet {
  /** Tree sprites grouped by kind (dark oak, light oak, pine, tall pine), each with variants incl. mirrored. */
  readonly trees: Sprite[][];
  readonly gold: Sprite;
  readonly stone: Sprite;
  readonly berries: Sprite;
  readonly sheep: Sprite;
  readonly deer: Sprite;
  readonly fish: Sprite;
  /** Small ground scatter: grass tufts, shrubs, pebbles, flowers. */
  readonly decor: Sprite[];

  constructor(readonly s: number) {
    const tree = (p: Painter, flip: boolean) => make(s, 40, 48, 20, 44, p, flip);
    const kinds: Painter[][] = [
      [broadleaf(1, OAK_DARK), broadleaf(2, OAK_DARK)],
      [broadleaf(3, OAK_LIGHT), broadleaf(4, OAK_LIGHT)],
      [conifer(5, false, PINE), conifer(6, false, PINE)],
      [conifer(7, true, PINE_TALL), conifer(8, true, PINE_TALL)],
    ];
    this.trees = kinds.map((ps) => ps.flatMap((p) => [tree(p, false), tree(p, true)]));
    this.gold = make(s, 38, 32, 19, 26, rockPile(11, [120, 104, 84], [246, 196, 58]));
    this.stone = make(s, 38, 32, 19, 26, rockPile(12, [150, 152, 150]));
    this.berries = make(s, 32, 30, 16, 25, berryBush);
    this.sheep = make(s, 22, 18, 11, 15, sheep);
    this.deer = make(s, 26, 22, 12, 19, deer);
    this.fish = make(s, 28, 20, 14, 10, fish);
    const tuft = (p: Painter) => make(s, 18, 14, 9, 12, p);
    this.decor = [
      tuft(grassTuft(1)),
      tuft(grassTuft(2)),
      tuft(grassTuft(3)),
      tuft(grassTuft(4)),
      tuft(flowers(5, '#f2f0e6')),
      tuft(flowers(6, '#d65a8a')),
      tuft(pebbles(7)),
      make(s, 34, 22, 13, 17, shrub(8)),
      make(s, 34, 22, 13, 17, shrub(9)),
    ];
  }
}
