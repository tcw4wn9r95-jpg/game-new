// Tiny isometric 3D toolkit for building sprites. Coordinates: x, y in tiles from
// the footprint's north corner (+x toward the lower right, +y toward the lower
// left), z in units up. One tile is a diamond 64 units wide and 32 tall, and a
// tile edge is 32 units long. Surfaces are filled with procedural materials and
// lit by a sun high in the south-west (lower left of the screen).
import { type Material, material } from './materials';

export type G = CanvasRenderingContext2D;
export type V3 = [number, number, number];

export const HALF_W = 32;
export const HALF_H = 16;

/** Device px per unit for the sprite being painted (materials are generated at this resolution). */
let K = 1;
export function setScale(k: number): void {
  K = k;
}
export const mat = (g: G, m: Material, base: string, seed = 1) => material(g, m, base, K, seed);

/**
 * Vertical exaggeration: heights (z, in units) are drawn this much taller than
 * a tile edge, so buildings stand well above the people beside them, as in AoE.
 */
export const ZK = 1.6;

export function P(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HALF_W, (x + y) * HALF_H - z * ZK];
}

/** Sun direction in unit space (x, y along tile axes, z up), normalised. */
const SUN = (() => {
  const v = [0.35, 1, 1.3];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();
const LEFT_WALL = 0.45 + 0.65 * SUN[1];

/** Brightness of a surface with normal n, relative to a south-west wall (1). */
export function lightOf(n: [number, number, number]): number {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const d = (n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) / l;
  return (0.45 + 0.65 * Math.max(0, d)) / LEFT_WALL;
}

/** Darkens (cool shade) or brightens (warm sun) whatever is in the current path/clip. */
function lightOverlay(g: G, b: number, fill: () => void): void {
  if (Math.abs(b - 1) < 0.02) return;
  g.fillStyle = b < 1 ? `rgba(16,20,38,${Math.min(0.8, (1 - b) * 0.95)})` : `rgba(255,236,196,${Math.min(0.4, (b - 1) * 0.42)})`;
  fill();
}

function path3(g: G, pts: V3[]): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [X, Y] = P(p[0], p[1], p[2]);
    if (i) g.lineTo(X, Y);
    else g.moveTo(X, Y);
  });
  g.closePath();
}

export function poly3(g: G, pts: V3[], fill: string | CanvasGradient | CanvasPattern, stroke: string | null = 'rgba(25,15,5,0.4)', lw = 0.6): void {
  path3(g, pts);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.stroke();
  }
}

export function line3(g: G, a: V3, b: V3, color: string, lw = 1): void {
  const [ax, ay] = P(a[0], a[1], a[2]);
  const [bx, by] = P(b[0], b[1], b[2]);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
}

/**
 * Runs `draw` in the plane of a wall: local u runs along the wall in units
 * (32 per tile), v runs up. 'left' walls lie along +x at fixed y (facing the
 * lower left); 'right' walls lie along -y at fixed x (facing the lower right),
 * with u = 0 at the southern end.
 */
export function onWall(g: G, side: 'left' | 'right', x: number, y: number, z: number, draw: () => void): void {
  g.save();
  const [ex, ey] = P(x, y, z);
  if (side === 'left') g.transform(1, 0.5, 0, -ZK, ex, ey);
  else g.transform(1, -0.5, 0, -ZK, ex, ey);
  draw();
  g.restore();
}

/** Runs `draw` on the ground plane: local (u, v) in units along +x and +y. */
export function onGround(g: G, x: number, y: number, draw: () => void): void {
  g.save();
  const [ex, ey] = P(x, y, 0);
  g.transform(1, 0.5, -1, 0.5, ex, ey);
  draw();
  g.restore();
}

export function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Fills a ground-level polygon as a soft shadow. Canvas shadows ignore the
 * transform, so the shape is drawn far off to one side and only its blurred
 * shadow is offset back into place.
 */
export function softShadow(g: G, pts: V3[], blur = 6, alpha = 0.42): void {
  const OFF = 4000;
  g.save();
  g.shadowColor = `rgba(8,12,4,${alpha})`;
  g.shadowBlur = blur * K;
  g.shadowOffsetX = -OFF * K;
  g.translate(OFF, 0);
  path3(g, pts);
  g.fillStyle = '#000';
  g.fill();
  g.restore();
}

/** Shadow of a box of height h on the ground, thrown away from the sun (toward the upper right). */
export function boxShadow(g: G, x0: number, y0: number, x1: number, y1: number, h: number): void {
  const off = (h / 32) * 0.75;
  softShadow(g, [
    [x0, y1, 0],
    [x0 - off * 0.35, y0 - off, 0],
    [x1 - off * 0.35, y0 - off, 0],
    [x1, y0, 0],
    [x1, y1, 0],
  ], 5 + h * 0.08);
  // Contact shadow hugging the base.
  softShadow(g, [[x0 - 0.04, y0 - 0.04, 0], [x1 + 0.08, y0 - 0.04, 0], [x1 + 0.08, y1 + 0.08, 0], [x0 - 0.04, y1 + 0.08, 0]], 2.5, 0.5);
}

export interface WallStyle {
  base: string;
  /** Wall material: plaster (default), stone or planks. */
  mat?: 'plaster' | 'stone' | 'planks';
  /** Timber frame colour for half-timbered plaster, or null for plain. */
  frame?: string | null;
  /** Height of a stone footing under plaster or planks, in units. */
  plinth?: number;
  /** Kept for older call sites: shorthand for mat. */
  stone?: boolean;
  planks?: boolean;
}

/** A squared timber in wall space from (u0, v0) to (u1, v1), with grain and a sunlit bevel. */
function timber(g: G, u0: number, v0: number, u1: number, v1: number, w: number, color: string): void {
  const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv);
  g.save();
  g.translate(u0, v0);
  g.rotate(Math.atan2(dv, du));
  const vertical = Math.abs(dv) > Math.abs(du);
  g.fillStyle = mat(g, vertical ? 'woodV' : 'woodH', color, 3);
  g.fillRect(-w / 2, -w / 2, len + w, w);
  g.fillStyle = 'rgba(255,225,180,0.22)';
  g.fillRect(-w / 2, w / 2 - 0.45, len + w, 0.45);
  g.fillStyle = 'rgba(15,8,2,0.4)';
  g.fillRect(-w / 2, -w / 2, len + w, 0.5);
  g.restore();
}

/** Fills one wall face (wall space, v up) with its material, detail, then light and weathering. */
function wallFace(g: G, len: number, h: number, style: WallStyle, lit: number, seed: number, detail?: (len: number, h: number) => void): void {
  const m = style.mat ?? (style.stone ? 'stone' : style.planks ? 'planks' : 'plaster');
  // Textures are authored top-down, so flip them into wall space (v up).
  g.save();
  g.translate(0, h);
  g.scale(1, -1);
  g.fillStyle = mat(g, m, style.base, seed);
  g.fillRect(0, 0, len, h);
  if (style.plinth) {
    g.fillStyle = mat(g, 'stone', '#8f8a80', seed + 1);
    g.fillRect(0, h - style.plinth, len, style.plinth);
    g.fillStyle = 'rgba(20,14,8,0.35)';
    g.fillRect(0, h - style.plinth - 0.6, len, 0.6);
  }
  g.restore();
  if (style.frame) {
    // Half-timbering: sill and wall plates, posts, a mid rail and braces.
    const f = style.frame, w = 2.2, base = style.plinth ?? 0;
    const n = Math.max(2, Math.round(len / 11));
    const mid = base + (h - base) * 0.5;
    for (let k = 1; k < n; k++) timber(g, (len * k) / n, base, (len * k) / n, h, w * 0.85, f);
    timber(g, 0, mid, len, mid, w * 0.8, f);
    timber(g, 0, h, len / n, mid, w * 0.75, f);
    timber(g, len, h, len - len / n, mid, w * 0.75, f);
    if (n > 3) {
      timber(g, (len * 2) / n, base, (len * 1.5) / n, mid, w * 0.7, f);
      timber(g, len - (len * 2) / n, base, len - (len * 1.5) / n, mid, w * 0.7, f);
    }
    timber(g, 0, base + w / 2, len, base + w / 2, w, f);
    timber(g, 0, h - w / 2, len, h - w / 2, w, f);
    timber(g, w / 2, base, w / 2, h, w, f);
    timber(g, len - w / 2, base, len - w / 2, h, w, f);
  }
  detail?.(len, h);
  // Sun or shade on the whole face.
  lightOverlay(g, lit, () => g.fillRect(0, 0, len, h));
  // Deep shadow under the eaves.
  const eave = g.createLinearGradient(0, h, 0, h - 9);
  eave.addColorStop(0, 'rgba(12,8,4,0.6)');
  eave.addColorStop(1, 'rgba(12,8,4,0)');
  g.fillStyle = eave;
  g.fillRect(0, h - 9, len, 9);
  // Grime splashed up from the ground and ambient occlusion at the foot.
  const foot = g.createLinearGradient(0, 0, 0, 7);
  foot.addColorStop(0, 'rgba(40,28,14,0.55)');
  foot.addColorStop(1, 'rgba(60,44,24,0)');
  g.fillStyle = foot;
  g.fillRect(0, 0, len, 7);
  // Darken toward the inside corner, brighten the sunlit outside edge.
  const side = g.createLinearGradient(0, 0, len, 0);
  side.addColorStop(0, 'rgba(255,240,210,0.08)');
  side.addColorStop(0.85, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = side;
  g.fillRect(0, 0, len, h);
}

/** Window with a deep reveal, sill, lintel, mullions and open shutters (v from the bottom). */
export function windowAt(g: G, u: number, v: number, w = 4, h = 5): void {
  const x0 = u - w / 2;
  // Open shutters either side.
  g.fillStyle = mat(g, 'woodV', '#5b3d22', 5);
  g.fillRect(x0 - w * 0.55, v, w * 0.5, h);
  g.fillRect(x0 + w + 0.05, v, w * 0.5, h);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x0 - w * 0.55, v, w * 0.5, 0.4);
  g.fillRect(x0 + w + 0.05, v, w * 0.5, 0.4);
  // Dark interior with a warm glimmer and the reveal's shadow.
  const glass = g.createLinearGradient(0, v + h, 0, v);
  glass.addColorStop(0, '#120a05');
  glass.addColorStop(1, '#3a2614');
  g.fillStyle = glass;
  g.fillRect(x0, v, w, h);
  g.fillStyle = 'rgba(255,200,120,0.22)';
  g.fillRect(x0 + 0.5, v + 0.5, w * 0.35, h * 0.35);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(x0, v + h - 0.9, w, 0.9);
  g.fillRect(x0, v, 0.6, h);
  // Mullions, lintel and sill.
  g.fillStyle = '#4a3019';
  g.fillRect(u - 0.3, v, 0.6, h);
  g.fillRect(x0, v + h * 0.5 - 0.25, w, 0.5);
  g.fillStyle = mat(g, 'woodH', '#5e3f22', 6);
  g.fillRect(x0 - 0.8, v + h, w + 1.6, 1.1);
  g.fillStyle = '#b3aa98';
  g.fillRect(x0 - 0.7, v - 0.9, w + 1.4, 0.9);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(x0 - 0.7, v - 0.25, w + 1.4, 0.25);
}

/** Arched plank door with iron strap hinges, a dark reveal and a step. */
export function doorAt(g: G, u: number, w = 6, h = 10): void {
  const arch = () => {
    g.beginPath();
    g.moveTo(u - w / 2, 0);
    g.lineTo(u - w / 2, h - w / 2);
    g.arc(u, h - w / 2, w / 2, Math.PI, 0, true);
    g.lineTo(u + w / 2, 0);
    g.closePath();
  };
  // Stone surround.
  g.save();
  g.translate(u, 0);
  g.scale(1.25, 1.08);
  g.translate(-u, 0);
  arch();
  g.fillStyle = mat(g, 'stone', '#a39d90', 9);
  g.fill();
  g.restore();
  arch();
  g.fillStyle = mat(g, 'woodV', '#5a381c', 8);
  g.fill();
  g.save();
  arch();
  g.clip();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const k of [-w / 4, 0, w / 4]) g.fillRect(u + k - 0.15, 0, 0.3, h);
  // Iron straps and a ring pull.
  g.fillStyle = '#2b2622';
  g.fillRect(u - w / 2, h * 0.22, w * 0.8, 0.8);
  g.fillRect(u - w / 2, h * 0.62, w * 0.8, 0.8);
  g.strokeStyle = '#2b2622';
  g.lineWidth = 0.5;
  g.beginPath();
  g.arc(u + w * 0.3, h * 0.42, 0.8, 0, Math.PI * 2);
  g.stroke();
  // Reveal shadow from the head of the doorway.
  const sh = g.createLinearGradient(0, h, 0, h - 4);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(u - w / 2, 0, w, h);
  g.restore();
  g.fillStyle = '#a7a090';
  g.fillRect(u - w / 2 - 1, -0.6, w + 2, 1.2);
}

/**
 * A box with walls (two visible faces). Detail callbacks draw in wall space:
 * u along the wall (left: from the west corner; right: from the south corner), v up.
 */
export function box(
  g: G,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  style: WallStyle,
  detail: { left?: (len: number, h: number) => void; right?: (len: number, h: number) => void } = {},
  seed = 1,
): void {
  const lenL = (x1 - x0) * 32, lenR = (y1 - y0) * 32;
  onWall(g, 'right', x1, y1, 0, () => wallFace(g, lenR, h, style, lightOf([1, 0, 0]), seed, detail.right));
  onWall(g, 'left', x0, y1, 0, () => wallFace(g, lenL, h, style, 1, seed + 1, detail.left));
  // Corner highlight where the sunlit face meets the shaded one.
  line3(g, [x1, y1, 0.5], [x1, y1, h - 0.5], 'rgba(255,236,200,0.35)', 0.6);
  path3(g, [[x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x1, y0, h], [x1, y1, h], [x0, y1, h]]);
  g.strokeStyle = 'rgba(25,15,5,0.45)';
  g.lineWidth = 0.6;
  g.stroke();
}

/** Flat top of a box (a terrace or plinth), textured in the ground plane and lit from above. */
export function boxTop(g: G, x0: number, y0: number, x1: number, y1: number, h: number, m: Material, base: string): void {
  const pts: V3[] = [[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]];
  g.save();
  path3(g, pts);
  g.clip();
  g.translate(0, -h * ZK);
  onGround(g, 0, 0, () => {
    g.fillStyle = mat(g, m, base, 4);
    g.fillRect(-400, -400, 800, 800);
  });
  g.restore();
  path3(g, pts);
  lightOverlay(g, lightOf([0, 0, 1]), () => g.fill());
  g.strokeStyle = 'rgba(25,15,5,0.4)';
  g.lineWidth = 0.6;
  g.stroke();
}

export interface RoofStyle {
  /** Base colour of the roof covering. */
  color: string;
  kind: 'thatch' | 'shingle' | 'canvas';
  /** Team-coloured trim along the eaves (canvas roofs). */
  trim?: string;
}

const MAT_OF: Record<RoofStyle['kind'], Material> = { thatch: 'thatch', shingle: 'shingle', canvas: 'canvas' };

/** Unit-space vector (x, y scaled to units) and its screen projection. */
const U = (p: V3): V3 => [p[0] * 32, p[1] * 32, p[2]];
const proj = (v: V3): [number, number] => [v[0] - v[1], (v[0] + v[1]) / 2 - v[2] * ZK];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * One roof face: the polygon `face`, sloping down from a ridge point to the eave
 * edge eaveA -> eaveB. The material is laid in the face's own plane, with
 * strands/courses running down the slope, then lit by its true normal.
 */
function roofFace(g: G, face: V3[], eaveA: V3, eaveB: V3, ridge: V3, style: RoofStyle, seed: number): void {
  const a = U(eaveA), b = U(eaveB), r = U(ridge);
  const eLen = Math.hypot(...sub(b, a));
  const e = scale(sub(b, a), 1 / eLen);
  const w = sub(r, a);
  const up = sub(w, scale(e, dot(w, e)));
  const L = Math.hypot(...up);
  const down = scale(up, -1 / L);
  const O: V3 = [a[0] + up[0], a[1] + up[1], a[2] + up[2]];
  let n = cross(e, down);
  if (n[2] < 0) n = scale(n, -1);
  const lit = lightOf(n);

  g.save();
  path3(g, face);
  g.clip();
  const [ex, ey] = proj(e), [dx, dy] = proj(down), [ox, oy] = proj(O);
  g.save();
  g.transform(ex, ey, dx, dy, ox, oy);
  g.fillStyle = mat(g, MAT_OF[style.kind], style.color, seed);
  g.fillRect(-eLen * 2, -4, eLen * 4, L + 12);
  // Weathering darker toward the eave, sun-bleached toward the ridge.
  const wx = g.createLinearGradient(0, 0, 0, L);
  wx.addColorStop(0, 'rgba(255,240,200,0.12)');
  wx.addColorStop(1, 'rgba(30,20,8,0.22)');
  g.fillStyle = wx;
  g.fillRect(-eLen * 2, -4, eLen * 4, L + 12);
  if (style.trim) {
    // Team-coloured valance hem along the eave.
    g.fillStyle = style.trim;
    g.fillRect(-eLen * 2, L - 3.2, eLen * 4, 3.2);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-eLen * 2, L - 3.2, eLen * 4, 0.5);
  }
  g.restore();
  path3(g, face);
  lightOverlay(g, lit, () => g.fill());
  g.restore();
  path3(g, face);
  g.strokeStyle = 'rgba(25,15,5,0.35)';
  g.lineWidth = 0.5;
  g.stroke();
  void ey;
  void dx;
}

/** Visible thickness under an eave edge, plus a ragged fringe for thatch or scallops for canvas. */
function eaveEdge(g: G, a: V3, b: V3, style: RoofStyle, lit: number, seed: number): void {
  const t = style.kind === 'thatch' ? 3.2 : style.kind === 'shingle' ? 1.6 : 0.8;
  const pts: V3[] = [a, b, [b[0], b[1], b[2] - t], [a[0], a[1], a[2] - t]];
  path3(g, pts);
  g.fillStyle = style.kind === 'canvas' ? style.trim ?? style.color : mat(g, style.kind === 'thatch' ? 'thatch' : 'woodH', shadeColor(style.color, 0.8), seed);
  g.fill();
  path3(g, pts);
  lightOverlay(g, lit * 0.8, () => g.fill());
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = Math.max(6, Math.round(Math.hypot((b[0] - a[0]) * 32, (b[1] - a[1]) * 32) / 1.6));
  if (style.kind === 'thatch') {
    // Straw ends hanging unevenly.
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const [x, y] = P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] - t);
      g.strokeStyle = shadeColor(style.color, (0.5 + rnd() * 0.6) * Math.min(1.1, lit));
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(x, y - 0.5);
      g.lineTo(x + (rnd() - 0.5) * 0.8, y + 0.6 + rnd() * 1.8);
      g.stroke();
    }
  } else if (style.kind === 'canvas' && style.trim) {
    // Scalloped valance.
    const m = Math.max(3, Math.round(n / 3));
    g.fillStyle = shadeColor(style.trim, Math.min(1, lit));
    for (let i = 0; i < m; i++) {
      const f0 = i / m, f1 = (i + 1) / m;
      const [x0, y0] = P(a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0, a[2] - t);
      const [x1, y1] = P(a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1, a[2] - t);
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 3.2, x1, y1);
      g.closePath();
      g.fill();
    }
  }
}

/** A rolled ridge cap along the top of the roof. */
function ridgeCap(g: G, a: V3, b: V3, style: RoofStyle): void {
  if (style.kind === 'canvas') {
    line3(g, a, b, '#5b3d22', 1.6);
    return;
  }
  line3(g, [a[0], a[1], a[2] + 0.6], [b[0], b[1], b[2] + 0.6], shadeColor(style.color, 0.42), 3.2);
  line3(g, [a[0], a[1], a[2] + 1.2], [b[0], b[1], b[2] + 1.2], shadeColor(style.color, 0.85), 1.8);
  line3(g, [a[0], a[1], a[2] + 1.8], [b[0], b[1], b[2] + 1.8], 'rgba(255,240,200,0.35)', 0.6);
}

/** Gable end wall: a triangle in the wall plane under the roof. */
function gable(g: G, pts: V3[], wallColor: string, lit: number, style: RoofStyle): void {
  path3(g, pts);
  g.fillStyle = style.kind === 'canvas' ? mat(g, 'canvas', style.color, 2) : mat(g, 'woodV', shadeColor(wallColor, 0.55), 2);
  g.fill();
  path3(g, pts);
  lightOverlay(g, lit * 0.92, () => g.fill());
  // Eave shadow down from the roof edge.
  g.strokeStyle = 'rgba(10,6,2,0.4)';
  g.lineWidth = 1.6;
  g.stroke();
}

/**
 * Gable roof over a box, ridge along x (gable ends face the lower right) or
 * along y (gable ends face the lower left). `o` is the eave overhang in tiles.
 */
export function gableRoof(g: G, x0: number, y0: number, x1: number, y1: number, h: number, rise: number, style: RoofStyle, along: 'x' | 'y' = 'x', o = 0.12, seed = 7): void {
  const top = h + rise;
  const wall = style.kind === 'canvas' ? style.color : '#d8c8a0';
  if (along === 'x') {
    const ym = (y0 + y1) / 2;
    const A: V3 = [x0 - o, ym, top], B: V3 = [x1 + o, ym, top];
    const back: V3[] = [A, B, [x1 + o, y0 - o, h], [x0 - o, y0 - o, h]];
    roofFace(g, back, [x0 - o, y0 - o, h], [x1 + o, y0 - o, h], A, style, seed);
    gable(g, [[x1, y0, h], [x1, y1, h], [x1, ym, top]], wall, lightOf([1, 0, 0]), style);
    const front: V3[] = [[x0 - o, y1 + o, h], [x1 + o, y1 + o, h], B, A];
    roofFace(g, front, front[0], front[1], A, style, seed + 1);
    // Bargeboard thickness along the gable's sloped edges.
    line3(g, [x1 + o, y1 + o, h], B, shadeColor(style.color, 0.45), 1.6);
    eaveEdge(g, front[0], front[1], style, lightOf([0, 1, 0]), seed);
    ridgeCap(g, A, B, style);
  } else {
    const xm = (x0 + x1) / 2;
    const A: V3 = [xm, y0 - o, top], B: V3 = [xm, y1 + o, top];
    const left: V3[] = [A, B, [x0 - o, y1 + o, h], [x0 - o, y0 - o, h]];
    roofFace(g, left, [x0 - o, y0 - o, h], [x0 - o, y1 + o, h], A, style, seed);
    const right: V3[] = [[x1 + o, y1 + o, h], [x1 + o, y0 - o, h], A, B];
    roofFace(g, right, right[0], right[1], B, style, seed + 1);
    eaveEdge(g, right[0], right[1], style, lightOf([1, 0, 0]), seed);
    gable(g, [[x0, y1, h], [x1, y1, h], [xm, y1, top]], wall, 1, style);
    line3(g, [x0 - o, y1 + o, h], B, shadeColor(style.color, 0.5), 1.6);
    line3(g, [x1 + o, y1 + o, h], B, shadeColor(style.color, 0.4), 1.6);
    ridgeCap(g, A, B, style);
  }
}

/** Four-sided (hipped) roof, e.g. a canvas awning or a tower cap. */
export function hipRoof(g: G, x0: number, y0: number, x1: number, y1: number, h: number, rise: number, style: RoofStyle, o = 0.12, seed = 3): void {
  const ym = (y0 + y1) / 2;
  const inset = Math.min(x1 - x0, y1 - y0) / 2 - 0.05;
  const peakA: V3 = [x0 + inset, ym, h + rise], peakB: V3 = [x1 - inset, ym, h + rise];
  const c00: V3 = [x0 - o, y0 - o, h], c10: V3 = [x1 + o, y0 - o, h], c11: V3 = [x1 + o, y1 + o, h], c01: V3 = [x0 - o, y1 + o, h];
  roofFace(g, [c00, c10, peakB, peakA], c00, c10, peakA, style, seed);
  roofFace(g, [c00, peakA, c01], c01, c00, peakA, style, seed + 1);
  roofFace(g, [c10, c11, peakB], c11, c10, peakB, style, seed + 2);
  roofFace(g, [c01, c11, peakB, peakA], c01, c11, peakA, style, seed + 3);
  eaveEdge(g, c11, c10, style, lightOf([1, 0, 0]), seed);
  eaveEdge(g, c01, c11, style, lightOf([0, 1, 0]), seed + 1);
  // Hip ridges.
  for (const [p, c] of [[peakB, c11], [peakA, c01]] as const) line3(g, p, c, shadeColor(style.color, style.kind === 'canvas' ? 0.75 : 0.55), 1.2);
  if (peakA[0] !== peakB[0]) ridgeCap(g, peakA, peakB, style);
}

/** A round wooden post (log) standing at (x, y). */
export function post(g: G, x: number, y: number, h: number, w = 2.2, color = '#6e4b2a'): void {
  const [bx, by] = P(x, y, 0);
  h *= ZK;
  g.fillStyle = mat(g, 'woodV', color, 11);
  g.fillRect(bx - w / 2, by - h, w, h);
  const grad = g.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0);
  grad.addColorStop(0, 'rgba(255,230,190,0.3)');
  grad.addColorStop(0.35, 'rgba(255,230,190,0)');
  grad.addColorStop(1, 'rgba(10,6,2,0.55)');
  g.fillStyle = grad;
  g.fillRect(bx - w / 2, by - h, w, h);
  g.fillStyle = shadeColor(color, 1.3);
  g.beginPath();
  g.ellipse(bx, by - h, w / 2, w / 4, 0, 0, Math.PI * 2);
  g.fill();
}

/** A horizontal log lying from a to b at height z, with bark and a sawn end. */
export function log(g: G, a: [number, number], b: [number, number], z: number, r = 1.8): void {
  const [ax, ay] = P(a[0], a[1], z), [bx, by] = P(b[0], b[1], z);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(20,12,4,0.7)';
  g.lineWidth = r * 2 + 0.6;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.strokeStyle = mat(g, 'woodH', '#6b4626', 13);
  g.lineWidth = r * 2;
  g.stroke();
  g.strokeStyle = 'rgba(255,220,160,0.28)';
  g.lineWidth = r * 0.5;
  g.beginPath();
  g.moveTo(ax, ay - r * 0.55);
  g.lineTo(bx, by - r * 0.55);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.moveTo(ax, ay + r * 0.6);
  g.lineTo(bx, by + r * 0.6);
  g.stroke();
  const end = g.createRadialGradient(bx, by, 0, bx, by, r);
  end.addColorStop(0, '#e6c48c');
  end.addColorStop(0.7, '#c99a5e');
  end.addColorStop(0.85, '#8a5d32');
  end.addColorStop(1, '#4a2e14');
  g.fillStyle = end;
  g.beginPath();
  g.ellipse(bx, by, r * 0.85, r, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(120,80,40,0.5)';
  g.lineWidth = 0.25;
  g.beginPath();
  g.ellipse(bx, by, r * 0.45, r * 0.55, 0, 0, Math.PI * 2);
  g.stroke();
}

/**
 * A vertical prism over a ground polygon (tile coords, any orientation) from
 * z0 to z0 + h: the faces turned toward the viewer, lit by their normals, then
 * the top. Used for wall runs at any angle.
 */
export function prism(g: G, base: Array<[number, number]>, z0: number, h: number, style: WallStyle, top: Material = 'stone', topColor = '#a8a294', seed = 1): void {
  const n = base.length;
  // Faces whose outward normal points toward the viewer (+x+y), back to front.
  const faces: Array<{ a: [number, number]; b: [number, number]; nx: number; ny: number; d: number }> = [];
  let cx = 0, cy = 0;
  for (const p of base) (cx += p[0] / n), (cy += p[1] / n);
  for (let i = 0; i < n; i++) {
    const a = base[i], b = base[(i + 1) % n];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) (nx = -nx), (ny = -ny);
    if (nx + ny <= 0.001) continue;
    faces.push({ a, b, nx, ny, d: (a[0] + a[1] + b[0] + b[1]) / 2 });
  }
  faces.sort((p, q) => p.d - q.d);
  const m = style.mat ?? (style.stone ? 'stone' : style.planks ? 'planks' : 'plaster');
  for (const f of faces) {
    const pts: V3[] = [[f.a[0], f.a[1], z0], [f.b[0], f.b[1], z0], [f.b[0], f.b[1], z0 + h], [f.a[0], f.a[1], z0 + h]];
    path3(g, pts);
    g.save();
    g.clip();
    // Lay the material in the face's own plane so courses run along the wall.
    const [ax, ay] = P(f.a[0], f.a[1], z0), [bx, by] = P(f.b[0], f.b[1], z0);
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) * 32 || 1;
    g.transform((bx - ax) / len, (by - ay) / len, 0, ZK, ax, ay - h * ZK);
    g.fillStyle = mat(g, m, style.base, seed);
    g.fillRect(-4, -2, len + 8, h + 4);
    const foot = g.createLinearGradient(0, h, 0, h - 6);
    foot.addColorStop(0, 'rgba(40,28,14,0.5)');
    foot.addColorStop(1, 'rgba(40,28,14,0)');
    g.fillStyle = foot;
    g.fillRect(-4, h - 6, len + 8, 6);
    g.restore();
    path3(g, pts);
    lightOverlay(g, lightOf([f.nx, f.ny, 0]), () => g.fill());
    g.strokeStyle = 'rgba(25,15,5,0.4)';
    g.lineWidth = 0.5;
    g.stroke();
  }
  const topPts: V3[] = base.map(([x, y]) => [x, y, z0 + h]);
  g.save();
  path3(g, topPts);
  g.clip();
  g.translate(0, -(z0 + h) * ZK);
  onGround(g, 0, 0, () => {
    g.fillStyle = mat(g, top, topColor, seed + 2);
    g.fillRect(-400, -400, 800, 800);
  });
  g.restore();
  path3(g, topPts);
  lightOverlay(g, lightOf([0, 0, 1]), () => g.fill());
  g.strokeStyle = 'rgba(25,15,5,0.45)';
  g.lineWidth = 0.5;
  g.stroke();
}

/** Battlements: merlons along the four top edges of a box, back to front. */
export function crenels(g: G, x0: number, y0: number, x1: number, y1: number, h: number, style: WallStyle, size = 0.16, seed = 1): void {
  const pts: Array<[number, number]> = [];
  const step = size * 2;
  for (let x = x0; x <= x1 - size + 1e-6; x += step) pts.push([x, y0], [x, y1 - size]);
  for (let y = y0 + step; y <= y1 - size - step + 1e-6; y += step) pts.push([x0, y], [x1 - size, y]);
  pts.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [x, y] of pts)
    prism(g, [[x, y], [x + size, y], [x + size, y + size], [x, y + size]], h, size * 40, style, 'stone', style.base, seed);
}
