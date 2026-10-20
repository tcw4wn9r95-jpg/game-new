// Articulated unit figures. Each figure is posed from a small skeleton (hips,
// shoulders, two-segment limbs) and drawn with outlined, shaded vector parts in
// "figure space": feet at y = 0, top of a standing villager's head at y = -100,
// +x is the direction the figure faces in side view.
import type { ResourceKind } from '../sim/constants';

export type View = 'front' | 'side' | 'back';
export type Anim = 'idle' | 'walk' | 'work';
export type Tool = 'none' | 'axe' | 'pick' | 'hammer' | 'basket' | 'knife' | 'spear' | 'hoe' | 'sword' | 'bow' | 'javelin' | 'staff';

export interface Look {
  female: boolean;
  skin: string;
  hair: string;
  /** Second clothing colour (trousers, skirt trim). */
  cloth: string;
}

export interface FigureSpec {
  view: View;
  anim: Anim;
  /** Animation frame (walk: 0-5, work: 0-3). */
  frame: number;
  tool: Tool;
  carry: ResourceKind | null;
  team: string;
  look: Look;
  /** Upgraded (Swordsman, Pikeman, Crossbowman, Light Cavalry): better kit. */
  elite?: boolean;
  /** Trebuchets: folded for travel. */
  packed?: boolean;
  /** Faction unique units drawn on a shared body. */
  variant?: 'claymore' | 'horse_archer' | 'iron_bear';
}

/** A dyed horsehair crest or plume on top of a helm at (x, y). */
function plume(g: G, x: number, y: number, team: string, view: View) {
  const back = view === 'side' ? -1 : 0;
  g.beginPath();
  g.moveTo(x - 1.5, y);
  g.quadraticCurveTo(x + back * 6 - 2, y - 9, x + back * 10 - 1, y - 4 + (view === 'side' ? 6 : -2));
  g.quadraticCurveTo(x + back * 4 + 2, y - 4, x + 1.5, y);
  g.closePath();
  g.strokeStyle = OUT;
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = roundLight(g, x, y - 4, 5, 5, team);
  g.fill();
}

/** Steel kettle hat: a domed crown with a wide brim. */
function kettleHat(g: G, x: number, y: number) {
  const steel = g.createLinearGradient(x - 12, 0, x + 12, 0);
  steel.addColorStop(0, '#9aa4a9');
  steel.addColorStop(0.3, '#eef3f5');
  steel.addColorStop(1, '#4e575c');
  blob(g, x, y - 2, 13, 3, steel as unknown as string);
  g.beginPath();
  g.moveTo(x - 8.5, y - 2);
  g.quadraticCurveTo(x - 8.5, y - 14, x, y - 14);
  g.quadraticCurveTo(x + 8.5, y - 14, x + 8.5, y - 2);
  g.closePath();
  g.strokeStyle = OUT;
  g.lineWidth = 1.3;
  g.stroke();
  g.fillStyle = steel;
  g.fill();
}

type G = CanvasRenderingContext2D;
type P = [number, number];

const D2R = Math.PI / 180;
const OUT = 'rgba(30,17,7,0.82)';
/** Light from the upper left in figure space (unit vector). */
const LX = -0.55, LY = -0.83;
const BOOT = '#3a2614';
const LEATHER = '#5b3a1e';
const STEEL = '#b9c1c6';
const STEEL_DARK = '#6d777d';
const HANDLE = '#7a5430';

export const SKINS = ['#f1c9a5', '#dcab80', '#b07a52'];
export const HAIRS = ['#3b2716', '#6b4423', '#a8783f', '#d6b26e', '#1e1a18'];
export const CLOTHS = ['#6b5a42', '#4f5a4a', '#5e4a3a', '#575866'];

// ---------- colour helpers ----------

function parse(c: string): [number, number, number] {
  if (c[0] !== '#') {
    const m = c.match(/[\d.]+/g) ?? ['0', '0', '0'];
    return [+m[0], +m[1], +m[2]];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c: string, k: number): string {
  const [r, g, b] = parse(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- drawing primitives ----------

/** End point of a limb segment: angle 0 points straight down, positive swings forward (+x). */
function seg(from: P, deg: number, len: number): P {
  return [from[0] + Math.sin(deg * D2R) * len, from[1] + Math.cos(deg * D2R) * len];
}

function stroke(g: G, a: P, b: P, w: number, color: string, ox = 0, oy = 0) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(a[0] + ox, a[1] + oy);
  g.lineTo(b[0] + ox, b[1] + oy);
  g.stroke();
}

/**
 * A tapered limb segment (w at a, w * taper at b) with rounded ends, shaded as
 * a cylinder lit from the upper left: lit edge, mid tone, then core shadow.
 */
function limb(g: G, a: P, b: P, w: number, color: string, taper = 0.82) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let px = -dy / l, py = dx / l;
  if (px * LX + py * LY < 0) (px = -px), (py = -py);
  const r0 = w / 2, r1 = (w * taper) / 2;
  const ang = Math.atan2(py, px);
  g.beginPath();
  g.moveTo(a[0] + px * r0, a[1] + py * r0);
  g.lineTo(b[0] + px * r1, b[1] + py * r1);
  g.arc(b[0], b[1], r1, ang, ang + Math.PI, (dx * py - dy * px) > 0);
  g.lineTo(a[0] - px * r0, a[1] - py * r0);
  g.arc(a[0], a[1], r0, ang + Math.PI, ang, (dx * py - dy * px) > 0);
  g.closePath();
  g.strokeStyle = OUT;
  g.lineWidth = 1.2;
  g.lineJoin = 'round';
  g.stroke();
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, rm = (r0 + r1) / 2;
  const grad = g.createLinearGradient(mx + px * rm, my + py * rm, mx - px * rm, my - py * rm);
  grad.addColorStop(0, shade(color, 1.3));
  grad.addColorStop(0.3, color);
  grad.addColorStop(0.75, shade(color, 0.7));
  grad.addColorStop(1, shade(color, 0.55));
  g.fillStyle = grad;
  g.fill();
}

/** Gradient lighting a rounded shape from the upper left. */
function roundLight(g: G, x: number, y: number, rx: number, ry: number, color: string): CanvasGradient {
  const r = Math.max(rx, ry);
  const grad = g.createRadialGradient(x + LX * rx * 0.45, y + LY * ry * 0.45, r * 0.05, x, y, r * 1.2);
  grad.addColorStop(0, shade(color, 1.28));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, shade(color, 0.58));
  return grad;
}

function blob(g: G, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0, outline = true) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (outline) {
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.stroke();
  }
  g.fillStyle = typeof fill === 'string' && fill[0] === '#' && rx > 1.5 ? roundLight(g, x, y, rx, ry, fill) : fill;
  g.fill();
}

function poly(g: G, pts: P[], fill: string | CanvasGradient, outline = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (outline) {
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.lineJoin = 'round';
    g.stroke();
  }
  if (typeof fill === 'string' && fill[0] === '#') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, shade(fill, 1.22));
    grad.addColorStop(0.45, fill);
    grad.addColorStop(1, shade(fill, 0.62));
    g.fillStyle = grad;
  } else g.fillStyle = fill;
  g.fill();
}

function groundShadow(g: G, rx: number, ry: number, dx = 4) {
  const grad = g.createRadialGradient(dx, 0, 0, dx, 0, rx);
  grad.addColorStop(0, 'rgba(8,12,4,0.42)');
  grad.addColorStop(1, 'rgba(8,12,4,0)');
  g.save();
  g.scale(1, ry / rx);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(dx, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ---------- villager ----------

interface Pose {
  /** Vertical body offset (negative = up). */
  bob: number;
  /** Torso lean in degrees (positive = forward). */
  lean: number;
  /** [thigh, shin] angles for near and far leg. */
  near: [number, number];
  far: [number, number];
  /** [upper arm, forearm] angles for near and far arm. */
  armN: [number, number];
  armF: [number, number];
}

function walkPose(frame: number): Pose {
  const p = (frame / 6) * Math.PI * 2;
  const s = Math.sin(p);
  // The trailing leg's knee folds as it lifts off; kept modest so the foot never kicks out flat.
  const bend = (v: number) => Math.max(0, -v) * 22 + 5;
  return {
    bob: -Math.abs(Math.cos(p)) * 2.5,
    lean: 4,
    near: [26 * s, 26 * s - bend(s)],
    far: [-26 * s, -26 * s - bend(-s)],
    armN: [-24 * s, -24 * s + 18],
    armF: [24 * s, 24 * s + 18],
  };
}

const IDLE: Pose = { bob: 0, lean: 0, near: [4, 2], far: [-4, -2], armN: [8, 22], armF: [-6, 14] };

/** Work cycles per tool: four key frames each. */
function workPose(tool: Tool, frame: number): Pose {
  const legs = { near: [14, 6] as [number, number], far: [-12, -6] as [number, number] };
  switch (tool) {
    case 'axe':
    case 'pick': {
      const k = [
        { lean: -6, n: [-165, -175], f: [-150, -165] },
        { lean: -2, n: [-110, -70], f: [-100, -60] },
        { lean: 14, n: [55, 80], f: [62, 85] },
        { lean: 8, n: [25, 45], f: [30, 50] },
      ][frame];
      const low = tool === 'pick' ? 12 : 0;
      return { bob: 0, lean: k.lean + low * 0.4, ...legs, armN: [k.n[0], k.n[1] + low] as [number, number], armF: [k.f[0], k.f[1] + low] as [number, number] };
    }
    case 'hoe': {
      const k = [[-90, -60], [-40, -10], [30, 60], [10, 40]][frame];
      return { bob: 2, lean: 18, ...legs, armN: [k[0], k[1]], armF: [k[0] - 10, k[1] - 6] };
    }
    case 'sword': {
      const k = [[-150, -120], [-90, -30], [60, 70], [30, 40]][frame];
      return { bob: 0, lean: k[0] > 0 ? 12 : -2, near: [22, 10], far: [-18, -10], armN: [k[0], k[1]], armF: [30, 70] };
    }
    case 'hammer': {
      const k = [[-70, -120], [-30, -50], [45, 70], [15, 30]][frame];
      return { bob: 0, lean: 8, ...legs, armN: [k[0], k[1]], armF: [10, 40] };
    }
    case 'basket': {
      const k = [[70, 105], [50, 70], [30, 30], [55, 90]][frame];
      return { bob: 4, lean: 26, near: [24, 4], far: [-10, -14], armN: [k[0], k[1]], armF: [20, 60] };
    }
    case 'knife': {
      const k = [[40, 95], [60, 125], [45, 100], [65, 130]][frame];
      return { bob: 12, lean: 34, near: [55, -20], far: [10, -40], armN: [k[0], k[1]], armF: [35, 80] };
    }
    case 'spear': {
      const k = [[-20, 40], [10, 70], [45, 95], [20, 60]][frame];
      return { bob: 0, lean: 10, ...legs, armN: [k[0], k[1]], armF: [k[0] - 15, k[1] - 10] };
    }
    case 'bow': {
      // Nock, draw, full draw, loose; the bow arm stays levelled at the target.
      const k = [[70, 100], [76, -40], [82, -88], [55, 30]][frame];
      return { bob: 0, lean: -2, near: [16, 6], far: [-14, -6], armN: [k[0], k[1]], armF: [86, 90] };
    }
    case 'javelin': {
      const k = [[-120, -150], [-150, -175], [70, 85], [35, 50]][frame];
      return { bob: 0, lean: k[0] > 0 ? 14 : -6, near: [22, 8], far: [-16, -8], armN: [k[0], k[1]], armF: [40, 70] };
    }
    case 'staff': {
      const k = [[-140, -150], [-160, -170], [-130, -140], [-150, -165]][frame];
      return { bob: 0, lean: -4, ...legs, armN: [k[0], k[1]], armF: [k[0] + 15, k[1] + 10] };
    }
    default:
      return IDLE;
  }
}

/** Draws a tool gripped at `hand`, oriented by the forearm angle. */
function drawTool(g: G, tool: Tool, hand: P, fore: number) {
  if (tool === 'none' || tool === 'basket') return;
  // Hafted tools are held roughly at right angles to the forearm.
  const dir = (fore + (tool === 'spear' ? 0 : 90)) * D2R;
  const ux = Math.sin(dir), uy = Math.cos(dir);
  if (tool === 'sword') {
    // Blade along the forearm's grip direction, with a crossguard.
    const d2 = (fore + 90) * D2R, sx = Math.sin(d2), sy = Math.cos(d2);
    const tipP: P = [hand[0] + sx * 24, hand[1] + sy * 24];
    poly(g, [[hand[0] + sx * 3 - sy * 1.8, hand[1] + sy * 3 + sx * 1.8], [tipP[0], tipP[1]], [hand[0] + sx * 3 + sy * 1.8, hand[1] + sy * 3 - sx * 1.8]], STEEL);
    limb(g, [hand[0] + sx * 3 - sy * 1.2, hand[1] + sy * 3 + sx * 1.2], [hand[0] + sx * 20, hand[1] + sy * 20], 0.8, '#eef3f5');
    limb(g, [hand[0] + sx * 2.5 - sy * 4.5, hand[1] + sy * 2.5 + sx * 4.5], [hand[0] + sx * 2.5 + sy * 4.5, hand[1] + sy * 2.5 - sx * 4.5], 2.2, '#c8962a');
    limb(g, [hand[0] - sx * 3, hand[1] - sy * 3], [hand[0] + sx * 1.5, hand[1] + sy * 1.5], 2.4, LEATHER);
    return;
  }
  const len = tool === 'spear' ? 46 : tool === 'knife' ? 9 : tool === 'hammer' ? 18 : tool === 'hoe' ? 30 : 26;
  const back = tool === 'spear' ? 18 : tool === 'knife' ? 1 : 4;
  const a: P = [hand[0] - ux * back, hand[1] - uy * back];
  const b: P = [hand[0] + ux * len, hand[1] + uy * len];
  if (tool === 'knife') {
    poly(g, [[hand[0], hand[1]], [b[0] - uy * 1.5, b[1] + ux * 1.5], [b[0] + ux * 3, b[1] + uy * 3], [b[0] + uy * 1.5, b[1] - ux * 1.5]], STEEL);
    return;
  }
  limb(g, a, b, 2.6, HANDLE);
  // Head at the far end, perpendicular to the haft.
  const px = -uy, py = ux;
  if (tool === 'axe') {
    poly(g, [[b[0] - ux * 2, b[1] - uy * 2], [b[0] + px * 9 - ux * 4, b[1] + py * 9 - uy * 4], [b[0] + px * 10 + ux * 5, b[1] + py * 10 + uy * 5], [b[0] + ux * 2, b[1] + uy * 2]], STEEL);
    limb(g, [b[0] + px * 9 - ux * 3, b[1] + py * 9 - uy * 3], [b[0] + px * 9.5 + ux * 4, b[1] + py * 9.5 + uy * 4], 1, '#eef3f5');
  } else if (tool === 'pick') {
    poly(g, [[b[0] - px * 12 - ux * 2, b[1] - py * 12 - uy * 2], [b[0] - ux * 2.5, b[1] - uy * 2.5], [b[0] + px * 12 - ux * 2, b[1] + py * 12 - uy * 2], [b[0] + ux * 2, b[1] + uy * 2]], STEEL_DARK);
  } else if (tool === 'hoe') {
    poly(g, [[b[0] - ux * 1, b[1] - uy * 1], [b[0] + px * 2 + ux * 7, b[1] + py * 2 + uy * 7], [b[0] - px * 3 + ux * 7, b[1] - py * 3 + uy * 7]], STEEL_DARK);
  } else if (tool === 'hammer') {
    poly(g, [[b[0] - px * 5 - ux * 3, b[1] - py * 5 - uy * 3], [b[0] + px * 5 - ux * 3, b[1] + py * 5 - uy * 3], [b[0] + px * 5 + ux * 3, b[1] + py * 5 + uy * 3], [b[0] - px * 5 + ux * 3, b[1] - py * 5 + uy * 3]], STEEL_DARK);
  } else if (tool === 'spear') {
    poly(g, [[b[0] + px * 2.5, b[1] + py * 2.5], [b[0] + ux * 9, b[1] + uy * 9], [b[0] - px * 2.5, b[1] - py * 2.5]], STEEL);
  }
}

function basket(g: G, x: number, y: number, full: string | null) {
  poly(g, [[x - 7, y - 4], [x + 7, y - 4], [x + 5.5, y + 5], [x - 5.5, y + 5]], '#a8834e');
  g.strokeStyle = 'rgba(70,45,15,0.7)';
  g.lineWidth = 0.8;
  for (let k = -4; k <= 4; k += 2.6) {
    g.beginPath();
    g.moveTo(x + k, y - 4);
    g.lineTo(x + k * 0.8, y + 5);
    g.stroke();
  }
  if (full) for (const [dx, dy] of [[-3, -5], [0, -6], [3, -5], [-1.5, -3.5], [1.5, -3.5]]) blob(g, x + dx, y + dy, 1.9, 1.9, full, 0, false);
}

/** What the figure is carrying, drawn on the shoulder, back or hip. */
function drawCarry(g: G, carry: ResourceKind, view: View, shoulder: P, hip: P, behind: boolean) {
  if (carry === 'wood') {
    // Two logs across the shoulder.
    const [x, y] = shoulder;
    for (const dy of [0, -4.5]) {
      if (view === 'side') {
        limb(g, [x - 16, y + dy - 2], [x + 10, y + dy + 1], 5.2, '#8a5d32');
        blob(g, x + 10, y + dy + 1, 2.2, 2.6, '#d9b27a', 0);
      } else {
        limb(g, [x - 11, y + dy], [x + 11, y + dy], 5.2, '#8a5d32');
        if (view === 'front') blob(g, x + 11, y + dy, 2.6, 2.6, '#d9b27a');
      }
    }
    return;
  }
  if (carry === 'food') {
    if (!behind) basket(g, hip[0] + (view === 'side' ? -2 : 9), hip[1] + 4, '#c0303e');
    return;
  }
  // Gold and stone: a heavy sack on the back.
  if (!behind && view !== 'back') return;
  const [x, y] = view === 'side' ? [shoulder[0] - 10, shoulder[1] + 8] : [shoulder[0], shoulder[1] + 9];
  blob(g, x, y, 7.5, 9, '#b39a6c');
  limb(g, [x - 1, y - 9], [x + 1, y - 12], 2.2, '#8a744c');
  const glint = carry === 'gold' ? '#f6cf3a' : '#c8c8c2';
  blob(g, x - 2, y - 5, 2.4, 1.8, glint, 0, true);
  blob(g, x + 2.5, y - 6.5, 2, 1.6, glint, 0, true);
}

/** Fine strands combed through a hair or straw shape (current path is used as the clip). */
function strands(g: G, x: number, y: number, r: number, color: string, view: View) {
  g.save();
  g.clip();
  for (let k = -5; k <= 5; k++) {
    const sx = x + k * r * 0.19;
    g.strokeStyle = k % 2 ? shade(color, 0.6) : shade(color, 1.35);
    g.globalAlpha = k % 2 ? 0.55 : 0.35;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x + (view === 'side' ? r * 0.5 : 0), y - r * 1.2);
    g.quadraticCurveTo(sx + k * 0.6, y - r * 0.6, sx + k * 0.9, y + r * 0.6);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

function head(g: G, view: View, x: number, y: number, look: Look, team: string) {
  const r = 9;
  const skin = look.skin;
  // Neck, in shadow under the jaw.
  limb(g, [x + (view === 'side' ? -1 : 0), y + 5], [x + (view === 'side' ? -1.5 : 0), y + 12], 6.5, shade(skin, 0.82));
  if (view === 'back') {
    blob(g, x, y, r, r, look.female ? '#e9e1cc' : look.hair);
    g.beginPath();
    g.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    strands(g, x, y, r, look.female ? '#e9e1cc' : look.hair, view);
    if (!look.female) blob(g, x, y + 4, r * 0.75, 4, shade(look.hair, 0.85), 0, false);
    return;
  }
  // Ears.
  if (view === 'side') blob(g, x - 2, y + 1, 2, 2.8, shade(skin, 0.9));
  else for (const sx of [-1, 1]) blob(g, x + sx * 8.6, y + 1, 1.7, 2.6, shade(skin, 0.88));
  blob(g, x, y, r, r * 1.04, skin);
  // Shadow along the jaw and under the hairline.
  g.save();
  g.beginPath();
  g.ellipse(x, y, r, r * 1.04, 0, 0, Math.PI * 2);
  g.clip();
  const jaw = g.createLinearGradient(0, y + 2, 0, y + r);
  jaw.addColorStop(0, 'rgba(70,30,15,0)');
  jaw.addColorStop(1, 'rgba(70,30,15,0.28)');
  g.fillStyle = jaw;
  g.fillRect(x - r, y, r * 2, r * 1.1);
  g.restore();
  const brow = shade(look.hair, 0.8);
  const lip = `rgb(${parse(shade(skin, 0.72)).map((v, i) => Math.round(i === 0 ? v * 1.12 : v * 0.88)).join(',')})`;
  if (view === 'side') {
    // Nose with a lit ridge, eye with its white, brow, lips and ear.
    poly(g, [[x + r - 1.2, y - 2], [x + r + 2.4, y + 2.2], [x + r - 0.8, y + 3.2]], shade(skin, 0.95), false);
    stroke(g, [x + r - 0.8, y - 1.6], [x + r + 1.8, y + 2], 0.5, shade(skin, 1.25));
    blob(g, x + 4.6, y - 0.6, 1.6, 1.0, '#f2ece2', 0, false);
    blob(g, x + 5.4, y - 0.6, 0.75, 0.85, '#2a1a10', 0, false);
    stroke(g, [x + 3, y - 2.8], [x + 6.6, y - 2.6], 0.9, brow);
    stroke(g, [x + 5.5, y + 5], [x + 7.6, y + 4.6], 0.9, lip);
    blob(g, x + 2.5, y + 3.2, 2.2, 1.6, 'rgba(200,90,70,0.16)', 0, false);
  } else {
    for (const sx of [-1, 1]) {
      blob(g, x + sx * 3.3, y - 0.3, 1.75, 1.05, '#f2ece2', 0, false);
      blob(g, x + sx * 3.3 + 0.2, y - 0.25, 0.85, 0.9, '#2a1a10', 0, false);
      blob(g, x + sx * 3.3 - 0.2, y - 0.6, 0.25, 0.25, 'rgba(255,255,255,0.8)', 0, false);
      stroke(g, [x + sx * 1.7, y - 2.6], [x + sx * 5, y - 2.9], 0.95, brow);
      blob(g, x + sx * 4.6, y + 2.8, 2.1, 1.4, 'rgba(200,90,70,0.16)', 0, false);
    }
    // Nose: a shadow down its far side, a lit bridge and nostrils.
    stroke(g, [x + 0.8, y - 0.5], [x + 1.4, y + 2.6], 0.8, shade(skin, 0.7));
    stroke(g, [x - 0.4, y - 0.8], [x - 0.3, y + 2], 0.5, shade(skin, 1.25));
    blob(g, x - 0.9, y + 3, 0.45, 0.35, shade(skin, 0.5), 0, false);
    blob(g, x + 1.1, y + 3, 0.45, 0.35, shade(skin, 0.5), 0, false);
    stroke(g, [x - 2, y + 5.2], [x + 2, y + 5.2], 1, lip);
    stroke(g, [x - 1.2, y + 6], [x + 1.2, y + 6], 0.5, shade(skin, 1.15));
  }
  if (look.female) {
    // Linen headscarf tied at the back, with a team-coloured band.
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.beginPath();
    if (view === 'side') {
      g.moveTo(x + 6, y - 5);
      g.quadraticCurveTo(x, y - 14, x - 9, y - 4);
      g.quadraticCurveTo(x - 12, y + 4, x - 7, y + 8);
      g.lineTo(x - 2, y + 2);
      g.quadraticCurveTo(x + 1, y - 4, x + 6, y - 5);
    } else {
      g.moveTo(x - 9.5, y + 2);
      g.quadraticCurveTo(x - 10, y - 12, x, y - 11);
      g.quadraticCurveTo(x + 10, y - 12, x + 9.5, y + 2);
      g.quadraticCurveTo(x + 6, y - 5, x, y - 5.5);
      g.quadraticCurveTo(x - 6, y - 5, x - 9.5, y + 2);
    }
    g.closePath();
    g.stroke();
    g.fillStyle = roundLight(g, x, y - 5, 10, 8, '#e9e1cc');
    g.fill();
    // Folds in the linen.
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(120,100,70,0.35)';
    g.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(x + k * 3, y - 11);
      g.quadraticCurveTo(x + k * 4, y - 6, x + k * 4.5 + (view === 'side' ? -3 : 0), y + 2);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = team;
    g.lineWidth = 1.6;
    g.beginPath();
    if (view === 'side') g.arc(x - 1, y - 2, 8, Math.PI * 1.1, Math.PI * 1.75);
    else g.arc(x, y + 1, 9, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  } else {
    // Short hair with combed strands; a beard on some.
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.beginPath();
    if (view === 'side') {
      g.moveTo(x + 7, y - 4);
      g.quadraticCurveTo(x + 2, y - 13, x - 8, y - 6);
      g.quadraticCurveTo(x - 11, y + 2, x - 5, y + 5);
      g.lineTo(x - 2, y - 3);
      g.quadraticCurveTo(x + 2, y - 6, x + 7, y - 4);
    } else {
      g.moveTo(x - 9.5, y);
      g.quadraticCurveTo(x - 9, y - 12, x, y - 11);
      g.quadraticCurveTo(x + 9, y - 12, x + 9.5, y);
      g.quadraticCurveTo(x + 5, y - 6, x, y - 6.5);
      g.quadraticCurveTo(x - 5, y - 6, x - 9.5, y);
    }
    g.closePath();
    g.stroke();
    g.fillStyle = roundLight(g, x, y - 6, 10, 7, look.hair);
    g.fill();
    strands(g, x, y - 4, 8, look.hair, view);
    if (look.hair === HAIRS[1] || look.hair === HAIRS[4]) {
      g.beginPath();
      if (view === 'side') g.ellipse(x + 3, y + 6, 5, 3.5, 0.3, 0, Math.PI * 2);
      else g.ellipse(x, y + 6.5, 5.5, 3.5, 0, 0, Math.PI * 2);
      g.fillStyle = roundLight(g, x, y + 6, 5.5, 3.5, look.hair);
      g.fill();
      strands(g, x, y + 7, 4, look.hair, view);
      if (view !== 'side') stroke(g, [x - 2, y + 5], [x + 2, y + 5], 0.9, lip);
    }
  }
}

/** The tunic or dress, lit from the front-left. */
function torso(g: G, view: View, sh: P, hip: P, look: Look, team: string) {
  const [sx, sy] = sh, [hx, hy] = hip;
  const half = view === 'side' ? 8.5 : 12.5;
  const hipHalf = view === 'side' ? 9.5 : 11.5;
  const hem = look.female ? 40 : 18;
  const grad = g.createLinearGradient(sx - half, 0, sx + half, 0);
  const lit = view === 'back' ? 0.9 : 1;
  grad.addColorStop(0, shade(team, 1.25 * lit));
  grad.addColorStop(0.5, shade(team, 0.95 * lit));
  grad.addColorStop(1, shade(team, 0.6 * lit));
  const flare = look.female ? 5 : 2;
  const waist = hipHalf - 1.5;
  const outline = () => {
    // Rounded shoulders, a nipped waist at the belt, and a skirt flaring to the hem.
    g.beginPath();
    g.moveTo(sx - half + 3, sy - 1.5);
    g.quadraticCurveTo(sx, sy - 3, sx + half - 3, sy - 1.5);
    g.quadraticCurveTo(sx + half + 1, sy, sx + half, sy + 5);
    g.quadraticCurveTo(hx + waist + 1, (sy + hy) / 2, hx + waist, hy - 3);
    g.quadraticCurveTo(hx + hipHalf + flare * 0.4, hy + hem * 0.4, hx + hipHalf + flare, hy + hem);
    g.quadraticCurveTo(hx, hy + hem + 1.5, hx - hipHalf - flare, hy + hem);
    g.quadraticCurveTo(hx - hipHalf - flare * 0.4, hy + hem * 0.4, hx - waist, hy - 3);
    g.quadraticCurveTo(hx - waist - 1, (sy + hy) / 2, sx - half, sy + 5);
    g.quadraticCurveTo(sx - half - 1, sy, sx - half + 3, sy - 1.5);
    g.closePath();
  };
  outline();
  g.strokeStyle = OUT;
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = grad;
  g.fill();
  const body = g.createLinearGradient(0, sy, 0, hy + hem);
  body.addColorStop(0, 'rgba(255,245,225,0.14)');
  body.addColorStop(0.5, 'rgba(0,0,0,0)');
  body.addColorStop(1, 'rgba(10,6,20,0.22)');
  g.fillStyle = body;
  g.fill();
  // Cloth folds falling from the shoulders and gathering at the belt, and side shadow.
  g.save();
  outline();
  g.clip();
  for (let k = -2; k <= 2; k++) {
    const fx = sx + k * half * 0.38, tx = hx + k * (hipHalf + flare) * 0.45;
    g.strokeStyle = 'rgba(10,6,20,0.22)';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(fx, sy + 2);
    g.quadraticCurveTo((fx + tx) / 2 + 1.5, (sy + hy) / 2, tx, hy - 4);
    g.moveTo(tx + 0.5, hy + 1);
    g.quadraticCurveTo(tx + k * 1.2, hy + hem * 0.6, tx + k * 2, hy + hem);
    g.stroke();
    g.strokeStyle = 'rgba(255,250,235,0.16)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(fx - 1.4, sy + 3);
    g.quadraticCurveTo((fx + tx) / 2, (sy + hy) / 2, tx - 1.4, hy - 4);
    g.stroke();
  }
  const ao = g.createLinearGradient(0, hy - 10, 0, hy - 3);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(1, 'rgba(10,6,20,0.3)');
  g.fillStyle = ao;
  g.fillRect(hx - 20, hy - 10, 40, 7);
  g.restore();
  // Hem trim and sleeves' cuff colour.
  g.fillStyle = look.cloth;
  g.fillRect(hx - hipHalf - flare + 1, hy + hem - 3, (hipHalf + flare) * 2 - 2, 2.5);
  if (look.female && view !== 'back') {
    // Apron.
    const ax = view === 'side' ? hx + 3 : hx;
    poly(g, [[ax - 6, hy - 6], [ax + 6, hy - 6], [ax + 8, hy + hem - 4], [ax - 8, hy + hem - 4]], '#ece4cf');
  }
  // Belt with buckle and a pouch.
  g.fillStyle = LEATHER;
  g.fillRect(hx - hipHalf - 0.5, hy - 4, hipHalf * 2 + 1, 4);
  g.fillStyle = '#d9b44a';
  g.fillRect(view === 'side' ? hx + 4 : hx - 1.5, hy - 4, 3, 4);
  if (view !== 'back') blob(g, view === 'side' ? hx - 6 : hx + 7, hy + 2, 3, 3.6, '#7a5230');
  // Collar.
  g.strokeStyle = shade(look.cloth, 1.2);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx - 5, sy + 1);
  g.lineTo(sx + 5, sy + 1);
  g.stroke();
}

function legs(g: G, pose: Pose, view: View, hip: P, look: Look, which: 'near' | 'far') {
  const trouser = shade(look.cloth, which === 'far' ? 0.75 : 1);
  if (view === 'side') {
    const [t, s] = which === 'near' ? pose.near : pose.far;
    const knee = seg(hip, t, 24);
    const foot = seg(knee, s, 24);
    limb(g, hip, knee, 9.5, trouser, 0.78);
    limb(g, knee, foot, 7.2, trouser, 0.75);
    blob(g, foot[0] + 3, foot[1] - 1, 5, 2.6, which === 'far' ? shade(BOOT, 0.8) : BOOT, 0);
    return;
  }
  // Front/back: legs side by side; the stepping leg rises and its foot comes forward.
  const side = which === 'near' ? 1 : -1;
  const lift = Math.max(0, Math.sin(((pose.near[0] * side) / 26) * (Math.PI / 2))) * 5;
  const x = hip[0] + side * 5.5;
  const knee: P = [x, hip[1] + 24 - lift];
  const foot: P = [x, -1 - lift * 0.6];
  limb(g, [x, hip[1]], knee, 9.5, trouser, 0.78);
  limb(g, knee, foot, 7.2, trouser, 0.75);
  blob(g, x, foot[1] - 0.5, 3.6, 2.6, BOOT, 0);
}

function arm(g: G, pose: Pose, view: View, sh: P, look: Look, team: string, which: 'near' | 'far'): { hand: P; fore: number } {
  const sleeve = shade(team, which === 'far' ? 0.6 : 0.9);
  if (view === 'side') {
    const [u, f] = which === 'near' ? pose.armN : pose.armF;
    const elbow = seg(sh, u, 17);
    const hand = seg(elbow, f, 16);
    limb(g, sh, elbow, 7.4, sleeve, 0.85);
    limb(g, elbow, hand, 5.6, look.skin, 0.8);
    blob(g, hand[0], hand[1], 2.9, 2.7, look.skin);
    return { hand, fore: f };
  }
  const side = which === 'near' ? 1 : -1;
  const swing = (which === 'near' ? pose.armN[0] : pose.armF[0]) * 0.12;
  const s0: P = [sh[0] + side * 12.5, sh[1] + 2];
  const elbow: P = [s0[0] + side * 2, s0[1] + 16 - Math.abs(swing) * 0.3];
  const hand: P = [elbow[0] + side * 1, elbow[1] + 15 + swing * (view === 'front' ? 0.3 : -0.3)];
  limb(g, s0, elbow, 7.4, sleeve, 0.85);
  limb(g, elbow, hand, 5.6, look.skin, 0.8);
  blob(g, hand[0], hand[1] + 1, 2.8, 3, look.skin);
  return { hand, fore: 0 };
}

export function drawVillager(g: G, f: FigureSpec): void {
  const pose = f.anim === 'walk' ? walkPose(f.frame) : f.anim === 'work' ? workPose(f.tool, f.frame) : IDLE;
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  groundShadow(g, 15, 5);

  if (f.view === 'back' && f.carry) drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, f.look, 'far');
  const farArm = f.view === 'side' ? arm(g, pose, f.view, sh, f.look, f.team, 'far') : null;
  if (f.view === 'side' && f.carry && f.carry !== 'food' && f.carry !== 'wood') drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, f.look, 'near');
  torso(g, f.view, sh, hip, f.look, f.team);
  if (f.view !== 'side') {
    arm(g, pose, f.view, sh, f.look, f.team, 'far');
  }
  head(g, f.view, headC[0], headC[1], f.look, f.team);
  if (f.carry === 'wood') drawCarry(g, f.carry, f.view, sh, hip, false);
  const near = arm(g, pose, f.view, sh, f.look, f.team, 'near');
  if (f.carry === 'food') drawCarry(g, f.carry, f.view, sh, hip, false);
  if (f.view !== 'back' && f.carry && f.carry !== 'food' && f.carry !== 'wood' && f.view === 'front') {
    // Front view: the sack's top shows over the shoulder.
    blob(g, sh[0] - 9, sh[1] - 1, 4.5, 3.5, '#b39a6c');
  }
  if (f.anim === 'work' && f.tool === 'basket' && farArm) basket(g, farArm.hand[0], farArm.hand[1] + 5, '#c0303e');
  if (f.tool !== 'none' && f.view === 'side') drawTool(g, f.tool, near.hand, near.fore);
}

// ---------- scout (horse and rider) ----------

/** Leg angles [upper, lower] for a gallop cycle; phase offset per leg. */
function gallop(frame: number, offset: number, hind: boolean): [number, number] {
  const p = ((frame / 6 + offset) % 1) * Math.PI * 2;
  const s = Math.sin(p);
  const upper = (hind ? -8 : 8) + s * 32;
  // Front knees fold backward, hocks forward, as the leg comes through.
  const lower = upper + (hind ? 1 : -1) * Math.max(0, Math.cos(p)) * 45;
  return [upper, lower];
}

export function drawScout(g: G, f: FigureSpec): void {
  drawHorseman(g, f, false);
}

export function drawKnight(g: G, f: FigureSpec): void {
  drawHorseman(g, f, true);
}

/** Heater shield with a team field, gold cross and a rim; (x, y) is its centre. */
function kiteShield(g: G, x: number, y: number, s: number, team: string) {
  g.beginPath();
  g.moveTo(x - 6 * s, y - 8 * s);
  g.quadraticCurveTo(x, y - 9.5 * s, x + 6 * s, y - 8 * s);
  g.quadraticCurveTo(x + 6.5 * s, y + 2 * s, x, y + 10 * s);
  g.quadraticCurveTo(x - 6.5 * s, y + 2 * s, x - 6 * s, y - 8 * s);
  g.closePath();
  g.strokeStyle = OUT;
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = roundLight(g, x, y - 2 * s, 7 * s, 9 * s, team);
  g.fill();
  g.strokeStyle = '#e0b84a';
  g.lineWidth = 1.6 * s;
  g.beginPath();
  g.moveTo(x, y - 8 * s);
  g.lineTo(x, y + 8 * s);
  g.moveTo(x - 5 * s, y - 3 * s);
  g.lineTo(x + 5 * s, y - 3 * s);
  g.stroke();
}

/** A bearskin over the rider's shoulders, the head on top. */
function bearPelt(g: G, x: number, y: number) {
  blob(g, x, y + 4, 11, 9, '#4a3020');
  for (let k = -3; k <= 3; k++) stroke(g, [x + k * 3, y], [x + k * 3.4, y + 12], 1, 'rgba(20,10,4,0.4)');
  blob(g, x - 2, y - 4, 6, 4.5, '#563824');
  for (const sx of [-5, 1]) blob(g, x + sx, y - 8, 1.8, 1.8, '#563824');
}

/** A round fur-trimmed cap with a coloured crown, over the face. */
function furHat(g: G, x: number, y: number, face: string, team: string) {
  blob(g, x, y, 7.5, 7.5, face);
  blob(g, x, y - 8, 7, 5, team);
  blob(g, x, y - 4.5, 9, 3.2, '#6a4a2c');
  blob(g, x, y - 13, 1.6, 1.6, '#e2bc4c', 0, false);
}

/** Flat-topped great helm with an eye slit and breaths, over a mail coif. */
function greatHelm(g: G, x: number, y: number, view: View) {
  const helm = g.createLinearGradient(x - 8, 0, x + 8, 0);
  helm.addColorStop(0, '#9aa4a9');
  helm.addColorStop(0.3, '#f2f6f8');
  helm.addColorStop(0.5, '#a7b0b5');
  helm.addColorStop(1, '#4b5459');
  poly(g, [[x - 8, y - 9], [x + 8, y - 9], [x + 8.5, y + 7], [x - 8.5, y + 7]], helm);
  if (view === 'back') return;
  const sx = view === 'side' ? x + 2 : x - 6;
  g.fillStyle = '#141414';
  g.fillRect(sx, y - 2.5, view === 'side' ? 7 : 12, 1.6);
  if (view === 'front') g.fillRect(x - 0.5, y - 2.5, 1, 7);
  for (let k = 0; k < 3; k++) blob(g, (view === 'side' ? x + 5 : x + 3) + (k % 2), y + 2 + k * 1.6, 0.4, 0.4, '#141414', 0, false);
}

function drawHorseman(g: G, f: FigureSpec, knight: boolean): void {
  const moving = f.anim === 'walk';
  const striking = f.anim === 'work';
  const bob = moving ? -Math.abs(Math.sin((f.frame / 6) * Math.PI * 2)) * 3 : 0;
  const ha = f.variant === 'horse_archer', bear = f.variant === 'iron_bear';
  const coat = bear ? '#3e322b' : ha ? '#c9a46c' : knight ? '#8d8882' : '#7b4f2b';
  const coatDark = bear ? '#2a211c' : ha ? '#9c7a48' : knight ? '#5f5a55' : '#5a3619';
  const mane = bear ? '#1a1410' : ha ? '#3a2614' : knight ? '#e8e2d6' : '#2a1a0e';
  groundShadow(g, f.view === 'side' ? 40 : 22, 8, 6);

  if (f.view === 'side') {
    const body: P = [0, -50 + bob];
    const legsAt: Array<{ x: number; off: number; hind: boolean; far: boolean }> = [
      { x: 20, off: 0.0, hind: false, far: true },
      { x: -20, off: 0.5, hind: true, far: true },
      { x: 24, off: 0.15, hind: false, far: false },
      { x: -16, off: 0.65, hind: true, far: false },
    ];
    const drawLeg = (l: (typeof legsAt)[number]) => {
      const [u, lo] = moving ? gallop(f.frame, l.off, l.hind) : [l.hind ? -4 : 4, 0];
      const top: P = [body[0] + l.x, body[1] + 2];
      const knee = seg(top, u, 20);
      const hoof = seg(knee, lo, 19);
      const c = l.far ? coatDark : coat;
      // Muscled forearm or gaskin, a slim cannon with a dark sock, fetlock and hoof.
      limb(g, top, knee, l.hind ? 12 : 10, c, 0.5);
      const fet = seg(knee, lo, 15);
      limb(g, knee, fet, 4.6, l.far ? '#3a2416' : '#4a2e1a', 0.9);
      limb(g, fet, hoof, 4.6, '#2e221a', 1.05);
      poly(g, [[hoof[0] - 3, hoof[1] - 1.2], [hoof[0] + 3.2, hoof[1] - 1.2], [hoof[0] + 3.8, hoof[1] + 1.4], [hoof[0] - 3.2, hoof[1] + 1.4]], '#1f1813');
    };
    legsAt.filter((l) => l.far).forEach(drawLeg);
    const [bx, by] = body;
    // Tail: a sweep of hair strands.
    const sway = moving ? (f.frame % 3) * 2 : 0;
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = k % 2 ? mane : shade(mane, 1.6);
      g.lineWidth = k % 2 ? 2.4 : 1;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx - 34, by - 8);
      g.bezierCurveTo(bx - 46 - k * 0.6, by - 4 + sway, bx - 44 - k, by + 10 + sway, bx - 40 - k * 1.4 + sway, by + 22 + k * 0.8);
      g.stroke();
    }
    // One silhouette: withers, back, croup, rump, belly, chest, neck and head.
    const shape = () => {
      g.beginPath();
      g.moveTo(bx + 16, by - 14);
      g.quadraticCurveTo(bx - 6, by - 10, bx - 26, by - 15);
      g.bezierCurveTo(bx - 36, by - 15, bx - 40, by - 4, bx - 34, by + 6);
      g.quadraticCurveTo(bx - 32, by + 11, bx - 22, by + 12);
      g.quadraticCurveTo(bx - 2, by + 18, bx + 16, by + 12);
      g.quadraticCurveTo(bx + 30, by + 10, bx + 32, by - 2);
      g.quadraticCurveTo(bx + 37, by - 10, bx + 40, by - 24);
      g.quadraticCurveTo(bx + 46, by - 24, bx + 54, by - 19);
      g.quadraticCurveTo(bx + 59, by - 21, bx + 56, by - 26);
      g.quadraticCurveTo(bx + 49, by - 36, bx + 40, by - 42);
      g.quadraticCurveTo(bx + 24, by - 36, bx + 16, by - 14);
      g.closePath();
    };
    shape();
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.stroke();
    const grad = g.createLinearGradient(0, by - 30, 0, by + 16);
    grad.addColorStop(0, shade(coat, 1.25));
    grad.addColorStop(0.55, coat);
    grad.addColorStop(1, shade(coat, 0.55));
    g.fillStyle = grad;
    g.fill();
    g.save();
    shape();
    g.clip();
    // Sheen on the shoulder, haunch and neck; shadow behind the elbow and along the belly.
    for (const [hx, hy, r, a] of [[bx + 22, by - 4, 13, 0.32], [bx - 24, by - 6, 14, 0.32], [bx + 34, by - 24, 8, 0.2]] as const) {
      const h = g.createRadialGradient(hx - 3, hy - 4, 0.5, hx, hy, r);
      h.addColorStop(0, `rgba(255,236,200,${a})`);
      h.addColorStop(1, 'rgba(255,236,200,0)');
      g.fillStyle = h;
      g.fillRect(hx - r, hy - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(30,14,4,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(bx + 14, by + 10);
    g.quadraticCurveTo(bx + 12, by, bx + 18, by - 8);
    g.moveTo(bx - 14, by + 12);
    g.quadraticCurveTo(bx - 16, by + 2, bx - 12, by - 8);
    g.stroke();
    // Dark muzzle.
    const muz = g.createRadialGradient(bx + 56, by - 22, 0.5, bx + 55, by - 22, 7);
    muz.addColorStop(0, 'rgba(40,24,16,0.85)');
    muz.addColorStop(1, 'rgba(40,24,16,0)');
    g.fillStyle = muz;
    g.fillRect(bx + 46, by - 30, 16, 14);
    g.restore();
    blob(g, bx + 55.5, by - 23.5, 0.9, 0.7, '#120a04', 0, false);
    // Eye with a catchlight, and ears.
    blob(g, bx + 44, by - 33, 1.6, 1.3, '#120a04', 0, false);
    blob(g, bx + 43.6, by - 33.4, 0.45, 0.45, 'rgba(255,255,255,0.8)', 0, false);
    poly(g, [[bx + 38, by - 41], [bx + 39, by - 50], [bx + 42.5, by - 41]], coat);
    poly(g, [[bx + 36, by - 40], [bx + 36, by - 48], [bx + 39.5, by - 41]], coatDark);
    // Mane in strands along the crest, and a forelock.
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      const mx = bx + 38 - t * 22, my = by - 41 + t * 26;
      g.strokeStyle = k % 2 ? mane : shade(mane, 1.5);
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(mx, my);
      g.quadraticCurveTo(mx - 4, my + 2, mx - 6, my + 6 + (k % 3));
      g.stroke();
    }
    g.strokeStyle = mane;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(bx + 40, by - 41);
    g.quadraticCurveTo(bx + 44, by - 39, bx + 45, by - 35);
    g.stroke();
    legsAt.filter((l) => !l.far).forEach(drawLeg);
    // Bridle and reins.
    g.strokeStyle = LEATHER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(bx + 54, by - 22);
    g.lineTo(bx + 41, by - 37);
    g.moveTo(bx + 50, by - 27);
    g.quadraticCurveTo(bx + 30, by - 22, bx + 10, by - 26);
    g.stroke();
    blob(g, bx + 52, by - 23, 1, 1, '#c8c8c8', 0, false);
    // Caparison in team colour with a gold hem; a knight's barding falls to the knees.
    const drop = bear ? 26 : knight ? 20 : ha ? 6 : 10;
    poly(g, [[body[0] - 20, body[1] - 12], [body[0] + 18, body[1] - 12], [body[0] + 22, body[1] + drop], [body[0] - 24, body[1] + drop]], f.team);
    g.save();
    g.beginPath();
    g.rect(body[0] - 24, body[1] - 12, 46, drop + 12);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) {
      g.beginPath();
      g.moveTo(body[0] + k * 6, body[1] - 10);
      g.quadraticCurveTo(body[0] + k * 6.5 + 1.5, body[1] + drop / 2, body[0] + k * 7, body[1] + drop);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#e2bc4c';
    g.fillRect(body[0] - 24, body[1] + drop - 2, 46, 2.5);
    if (bear) {
      // Steel scales over the barding.
      g.strokeStyle = 'rgba(210,218,222,0.55)';
      g.lineWidth = 1;
      for (let r = 0; r < 4; r++)
        for (let k = -3; k <= 3; k++) {
          g.beginPath();
          g.arc(body[0] + k * 6 + (r % 2) * 3, body[1] - 8 + r * 7, 3, 0, Math.PI);
          g.stroke();
        }
    }
    if (knight) {
      // Heraldic cross on the barding and a chanfron over the face.
      g.fillStyle = '#e2bc4c';
      g.fillRect(body[0] - 13, body[1] - 6, 3, 14);
      g.fillRect(body[0] - 18, body[1] - 1, 13, 3);
      poly(g, [[body[0] + 40, body[1] - 42], [body[0] + 49, body[1] - 34], [body[0] + 54, body[1] - 25], [body[0] + 47, body[1] - 27], [body[0] + 39, body[1] - 34]], STEEL);
    }
    // Rider.
    const seat: P = [body[0] - 1, body[1] - 14];
    limb(g, seat, [seat[0] + 8, seat[1] + 14], 8, knight ? '#7d868b' : '#6b5a42', 0.8);
    limb(g, [seat[0] + 8, seat[1] + 14], [seat[0] + 6, seat[1] + 26], 6, knight ? '#5b6368' : BOOT, 0.85);
    const sh: P = [seat[0] + 2, seat[1] - 26];
    const mail = g.createLinearGradient(seat[0] - 9, 0, seat[0] + 9, 0);
    mail.addColorStop(0, '#c9cfd2');
    mail.addColorStop(1, '#6f787d');
    poly(g, [[sh[0] - 8, sh[1]], [sh[0] + 8, sh[1]], [seat[0] + 9, seat[1] + 2], [seat[0] - 9, seat[1] + 2]], mail);
    poly(g, [[sh[0] - 5, sh[1] + 2], [sh[0] + 6, sh[1] + 2], [seat[0] + 7, seat[1] + (knight ? 8 : 3)], [seat[0] - 6, seat[1] + (knight ? 8 : 3)]], f.team);
    if (bear) bearPelt(g, sh[0] - 1, sh[1] + 2);
    else if (ha) quiver(g, [sh[0] - 6, sh[1] + 4], 'side');
    else if (knight) kiteShield(g, sh[0] - 8, sh[1] + 12, 1.05, f.team);
    else {
      blob(g, sh[0] - 9, sh[1] + 12, 6.5, 9, f.team);
      blob(g, sh[0] - 9, sh[1] + 12, 2, 2, '#e2bc4c', 0, false);
    }
    if (knight) greatHelm(g, sh[0] + 2, sh[1] - 9, 'side');
    else if (ha) furHat(g, sh[0] + 2, sh[1] - 9, f.look.skin, f.team);
    else {
      blob(g, sh[0] + 2, sh[1] - 9, 7.5, 7.5, f.look.skin);
      poly(g, [[sh[0] - 6, sh[1] - 10], [sh[0] + 2, sh[1] - 22], [sh[0] + 10, sh[1] - 10]], STEEL);
      limb(g, [sh[0] + 7, sh[1] - 11], [sh[0] + 8, sh[1] - 4], 1.5, STEEL_DARK);
      if (f.elite) plume(g, sh[0] + 2, sh[1] - 21, f.team, 'side');
    }
    // Arm and weapon: the lance is couched level and drives forward on the strike.
    const thrust = striking ? [0, 4, 10, 6][f.frame % 4] : 0;
    if (ha) {
      // Bow held out ahead, string drawn back to the cheek when shooting.
      const elbowF = seg(sh, 75, 11);
      const grip: P = [elbowF[0] + 10, elbowF[1] - 2];
      limb(g, sh, elbowF, 5, '#9a7a52');
      limb(g, elbowF, grip, 4.4, f.look.skin);
      bow(g, grip, striking && f.frame % 4 < 3 ? [sh[0] + 3, sh[1] - 2] : null);
      return;
    }
    const elbow = seg(sh, knight ? 60 : 40, 12);
    const hand: P = knight ? [elbow[0] + 6 + thrust, elbow[1] + 2] : seg(elbow, -60 + thrust * 4, 11);
    limb(g, sh, elbow, 5.5, '#9aa3a8');
    limb(g, elbow, hand, 4.8, knight ? '#7d868b' : f.look.skin);
    if (knight) {
      limb(g, [hand[0] - 18, hand[1] + 3], [hand[0] + 44, hand[1] - 5], 2.6, HANDLE, 0.7);
      poly(g, [[hand[0] + 43, hand[1] - 6.5], [hand[0] + 52, hand[1] - 6.2], [hand[0] + 43, hand[1] - 3.5]], STEEL);
      poly(g, [[hand[0] - 2, hand[1] - 3], [hand[0] + 3, hand[1] - 3.5], [hand[0] + 3, hand[1] + 3], [hand[0] - 2, hand[1] + 3.5]], STEEL_DARK);
    } else drawTool(g, 'spear', hand, -150 + thrust * 6);
    return;
  }

  // Front and back views: the horse seen head-on or from behind, rider above.
  const body: P = [0, -48 + bob];
  const legPhase = (k: number) => (moving ? Math.sin((f.frame / 6 + k * 0.25) * Math.PI * 2) * 4 : 0);
  const [bx, by] = body;
  // Far pair of legs (hind from the front, fore from behind), then the near pair.
  for (const [x, k, far] of [[-6, 1, true], [6, 3, true], [-10, 0, false], [10, 2, false]] as const) {
    const lift = Math.max(0, legPhase(k));
    const top: P = [bx + x, by + 4], knee: P = [bx + x * 1.05, by + 26 - lift], hoof: P = [bx + x * 1.05, -2 - lift];
    limb(g, top, knee, far ? 8 : 10, far ? coatDark : coat, 0.55);
    limb(g, knee, hoof, 4.6, far ? '#2e1d12' : '#4a2e1a', 0.95);
    poly(g, [[hoof[0] - 3, hoof[1] - 1], [hoof[0] + 3, hoof[1] - 1], [hoof[0] + 3.4, hoof[1] + 1.4], [hoof[0] - 3.4, hoof[1] + 1.4]], '#1f1813');
  }
  // Barrel seen end-on: a broad chest (front) or two rounded haunches (back).
  if (f.view === 'back') {
    for (const sx of [-1, 1]) blob(g, bx + sx * 8, by - 2, 11, 15, coat);
    g.strokeStyle = 'rgba(30,14,4,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(bx, by - 14);
    g.lineTo(bx, by + 10);
    g.stroke();
  } else blob(g, bx, by, 17, 16, coat);
  const drop = bear ? 26 : knight ? 20 : ha ? 8 : 12;
  poly(g, [[-15, by - 6], [15, by - 6], [17, by + drop], [-17, by + drop]], f.team);
  g.fillStyle = '#e2bc4c';
  g.fillRect(-17, by + drop - 2, 34, 2.5);
  if (f.view === 'front') {
    // Neck and a long face with a white blaze, eyes on the sides of the head.
    poly(g, [[-7, by - 14], [7, by - 14], [6, by - 2], [-6, by - 2]], shade(coat, 0.9));
    g.beginPath();
    g.moveTo(bx - 6, by - 22);
    g.quadraticCurveTo(bx - 7.5, by - 4, bx - 4.5, by + 12);
    g.quadraticCurveTo(bx, by + 16, bx + 4.5, by + 12);
    g.quadraticCurveTo(bx + 7.5, by - 4, bx + 6, by - 22);
    g.quadraticCurveTo(bx, by - 25, bx - 6, by - 22);
    g.closePath();
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = roundLight(g, bx, by - 6, 7, 18, coat);
    g.fill();
    poly(g, [[bx - 1.2, by - 20], [bx + 1.2, by - 20], [bx + 1.8, by + 6], [bx - 1.8, by + 6]], '#efe6d6', false);
    blob(g, bx, by + 11, 4.6, 3.6, '#3a2418');
    for (const sx of [-1, 1]) {
      blob(g, bx + sx * 1.8, by + 11.5, 0.8, 0.9, '#120a04', 0, false);
      blob(g, bx + sx * 5.6, by - 13, 1.2, 1.6, '#120a04', 0, false);
      poly(g, [[bx + sx * 3, by - 22], [bx + sx * 6.5, by - 31], [bx + sx * 6.8, by - 21]], coat);
    }
    for (let k = -2; k <= 2; k++) stroke(g, [bx + k * 0.8, by - 24], [bx + k * 1.6, by - 17], 1.4, k % 2 ? mane : shade(mane, 1.5));
  } else {
    // Tail falling in strands below the caparison.
    for (let k = -2; k <= 2; k++) {
      g.strokeStyle = k % 2 ? mane : shade(mane, 1.5);
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx, by - 8);
      g.quadraticCurveTo(bx + k * 2.5, by + 14, bx + k * 3 + 1, by + 30);
      g.stroke();
    }
  }
  const sh: P = [0, by - 38];
  const mail = g.createLinearGradient(-10, 0, 10, 0);
  mail.addColorStop(0, '#c9cfd2');
  mail.addColorStop(1, '#6f787d');
  poly(g, [[-10, sh[1]], [10, sh[1]], [9, body[1] - 12], [-9, body[1] - 12]], mail);
  poly(g, [[-5.5, sh[1] + 2], [5.5, sh[1] + 2], [6, body[1] - 10], [-6, body[1] - 10]], f.team);
  if (bear) bearPelt(g, 0, sh[1] + 2);
  else if (f.view === 'back') {
    if (ha) quiver(g, [0, sh[1] + 2], 'back');
    else if (knight) kiteShield(g, 0, sh[1] + 13, 1.1, f.team);
    else {
      blob(g, 0, sh[1] + 13, 8, 11, f.team);
      blob(g, 0, sh[1] + 13, 2.2, 2.2, '#e2bc4c', 0, false);
    }
  }
  if (knight) greatHelm(g, 0, sh[1] - 9, f.view);
  else if (ha) furHat(g, 0, sh[1] - 9, f.view === 'back' ? STEEL_DARK : f.look.skin, f.team);
  else {
    blob(g, 0, sh[1] - 9, 7.5, 7.5, f.view === 'back' ? STEEL_DARK : f.look.skin);
    poly(g, [[-8, sh[1] - 10], [0, sh[1] - 22], [8, sh[1] - 10]], STEEL);
    if (f.view === 'front') limb(g, [0, sh[1] - 11], [0, sh[1] - 4], 1.6, STEEL_DARK);
  }
  limb(g, [12, sh[1] + 4], [14, sh[1] + 18], 5, '#9aa3a8');
  if (ha) {
    bow(g, [15, sh[1] + 14], null);
    return;
  }
  const lift = striking ? [0, -4, -10, -6][f.frame % 4] : 0;
  limb(g, [14, sh[1] + 30 + lift], [14, sh[1] - (knight ? 44 : 34) + lift], 2.4, HANDLE, 0.8);
  poly(g, [[12, sh[1] - (knight ? 44 : 34) + lift], [14, sh[1] - (knight ? 54 : 44) + lift], [16, sh[1] - (knight ? 44 : 34) + lift]], STEEL);
  if (knight && f.view === 'front') kiteShield(g, -12, sh[1] + 16, 0.95, f.team);
}

// ---------- militia (swordsman) ----------

/** Quilted team-coloured gambeson, nasal helmet, round shield and an arming sword. */
export function drawMilitia(g: G, f: FigureSpec): void {
  const look: Look = { ...f.look, female: false };
  const clay = f.variant === 'claymore';
  const attacking = f.anim === 'work';
  const pose = f.anim === 'walk' ? walkPose(f.frame) : attacking ? workPose('sword', f.frame) : { ...IDLE, armN: [20, 60] as [number, number] };
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  groundShadow(g, 16, 5);
  const mailLegs: Look = { ...look, cloth: '#55595c' };

  const shield = (x: number, y: number, rx: number) => {
    const ry = rx * 1.05;
    // Painted planks: team field, plank seams, wear at the edge.
    blob(g, x, y, rx, ry, f.team);
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(20,10,0,0.3)';
    g.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(x + k * rx * 0.36, y - ry);
      g.lineTo(x + k * rx * 0.36, y + ry);
      g.stroke();
    }
    const wear = g.createRadialGradient(x, y, rx * 0.6, x, y, rx);
    wear.addColorStop(0, 'rgba(120,80,40,0)');
    wear.addColorStop(1, 'rgba(120,80,40,0.45)');
    g.fillStyle = wear;
    g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    g.restore();
    // Gilt cross bands, iron rim with rivets, and a domed boss with a highlight.
    g.strokeStyle = '#c9a03a';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(x, y - ry + 1.5);
    g.lineTo(x, y + ry - 1.5);
    g.moveTo(x - rx + 1.5, y);
    g.lineTo(x + rx - 1.5, y);
    g.stroke();
    g.strokeStyle = '#4a4c4e';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(x, y, rx - 0.6, ry - 0.6, 0, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      blob(g, x + Math.cos(a) * (rx - 0.7), y + Math.sin(a) * (ry - 0.7), 0.55, 0.55, '#d8dcde', 0, false);
    }
    blob(g, x, y, rx * 0.3, rx * 0.3, STEEL);
    blob(g, x - rx * 0.1, y - rx * 0.12, rx * 0.09, rx * 0.07, 'rgba(255,255,255,0.85)', 0, false);
  };

  if (f.view === 'back' && !clay) shield(sh[0], sh[1] + 16, 13);
  legs(g, pose, f.view, hip, clay ? { ...look, cloth: look.skin } : mailLegs, 'far');
  if (f.view === 'side') {
    // Shield on the far arm, held forward.
    const farArm = arm(g, pose, f.view, sh, look, f.team, 'far');
    if (!clay) shield(farArm.hand[0] + 2, farArm.hand[1] - 6, 12);
  }
  legs(g, pose, f.view, hip, clay ? { ...look, cloth: look.skin } : mailLegs, 'near');
  if (clay) kilt(g, hip, f.team, f.view);
  torso(g, f.view, sh, hip, look, shade(f.team, 0.85));
  // Quilting stitches.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    g.beginPath();
    g.moveTo(sh[0] - 8, sh[1] + k * 7);
    g.lineTo(hip[0] + 8, sh[1] + k * 7);
    g.stroke();
  }
  if (f.view !== 'side') arm(g, pose, f.view, sh, look, f.team, 'far');
  head(g, f.view, headC[0], headC[1], look, f.team);
  // Nasal helmet over the hair.
  const hx = headC[0], hy = headC[1];
  if (clay) {
    // A blue bonnet with a feather, and a two-handed sword.
    blob(g, hx - 1, hy - 9, 11, 4.5, '#2f3f6a');
    blob(g, hx, hy - 13, 2, 2, f.team, 0, false);
    stroke(g, [hx - 3, hy - 12], [hx - 10, hy - 22], 1.4, '#efe9dc');
    const near = arm(g, pose, f.view, sh, look, f.team, 'near');
    greatsword(g, near.hand, f.view === 'side' ? near.fore : 180);
    return;
  }
  // Polished conical helm: specular streak, darker band at the brow, rivets.
  const helm = g.createLinearGradient(hx - 10, 0, hx + 10, 0);
  helm.addColorStop(0, '#9aa4a9');
  helm.addColorStop(0.28, '#f4f8fa');
  helm.addColorStop(0.45, '#aab3b8');
  helm.addColorStop(1, '#4e575c');
  poly(g, [[hx - 10, hy - 1], [hx - 8, hy - 9], [hx, hy - 15], [hx + 8, hy - 9], [hx + 10, hy - 1]], helm);
  stroke(g, [hx - 10, hy - 1.6], [hx + 10, hy - 1.6], 2, '#5c6468');
  for (const k of [-6, -2, 2, 6]) blob(g, hx + k, hy - 1.6, 0.5, 0.5, '#e8ecee', 0, false);
  stroke(g, [hx - 3.5, hy - 10], [hx - 1, hy - 13.5], 0.8, 'rgba(255,255,255,0.75)');
  if (f.view !== 'back') limb(g, [f.view === 'side' ? hx + 7 : hx, hy - 2], [f.view === 'side' ? hx + 7.5 : hx, hy + 4], 1.6, STEEL_DARK);
  if (f.elite) plume(g, hx, hy - 14, f.team, f.view);
  const near = arm(g, pose, f.view, sh, look, f.team, 'near');
  if (f.view === 'front') shield(sh[0] - 13, sh[1] + 20, 11);
  if (f.view === 'side') drawTool(g, 'sword', near.hand, near.fore);
  else limb(g, [near.hand[0], near.hand[1] - 2], [near.hand[0] + 1, near.hand[1] + 20], 2.2, STEEL);
}

/** Short pleated tartan skirt from the hips. */
function kilt(g: G, hip: P, team: string, view: View) {
  const w0 = view === 'side' ? 9 : 11, w1 = view === 'side' ? 12 : 13;
  poly(g, [[hip[0] - w0, hip[1] - 4], [hip[0] + w0, hip[1] - 4], [hip[0] + w1, hip[1] + 16], [hip[0] - w1, hip[1] + 16]], shade(team, 0.75));
  g.save();
  g.beginPath();
  g.rect(hip[0] - w1, hip[1] - 4, w1 * 2, 20);
  g.clip();
  g.strokeStyle = 'rgba(30,50,30,0.55)';
  g.lineWidth = 2;
  for (let k = -3; k <= 3; k++) stroke(g, [hip[0] + k * 5, hip[1] - 4], [hip[0] + k * 5.6, hip[1] + 16], 1.6, 'rgba(25,45,30,0.5)');
  for (const dy of [2, 9]) stroke(g, [hip[0] - w1, hip[1] + dy], [hip[0] + w1, hip[1] + dy], 1.2, 'rgba(240,230,200,0.45)');
  g.restore();
}

/** A long two-handed blade with a wide crossguard. */
function greatsword(g: G, hand: P, fore: number) {
  const d2 = (fore + 90) * D2R, sx = Math.sin(d2), sy = Math.cos(d2);
  const tip: P = [hand[0] + sx * 40, hand[1] + sy * 40];
  poly(g, [[hand[0] + sx * 4 - sy * 2.4, hand[1] + sy * 4 + sx * 2.4], tip, [hand[0] + sx * 4 + sy * 2.4, hand[1] + sy * 4 - sx * 2.4]], STEEL);
  limb(g, [hand[0] + sx * 4, hand[1] + sy * 4], [hand[0] + sx * 34, hand[1] + sy * 34], 0.8, '#eef3f5');
  limb(g, [hand[0] + sx * 3.5 - sy * 7, hand[1] + sy * 3.5 + sx * 7], [hand[0] + sx * 3.5 + sy * 7, hand[1] + sy * 3.5 - sx * 7], 2.4, '#8a8f92');
  limb(g, [hand[0] - sx * 8, hand[1] - sy * 8], [hand[0] + sx * 2, hand[1] + sy * 2], 2.6, LEATHER);
}

// ---------- foot soldiers ----------

/** A bow in the far hand: limbs bent toward the target, string to the drawing hand. */
function bow(g: G, grip: P, draw: P | null) {
  const top: P = [grip[0] - 2, grip[1] - 17], bot: P = [grip[0] - 2, grip[1] + 17];
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(top[0], top[1]);
  g.quadraticCurveTo(grip[0] + 9, grip[1], bot[0], bot[1]);
  g.stroke();
  const wood = g.createLinearGradient(grip[0] - 3, 0, grip[0] + 6, 0);
  wood.addColorStop(0, '#a77a45');
  wood.addColorStop(1, '#5a3a1c');
  g.strokeStyle = wood;
  g.lineWidth = 2.2;
  g.stroke();
  // String, drawn back to the hand when pulling.
  const nock = draw && Math.hypot(draw[0] - grip[0], draw[1] - grip[1]) < 26 ? draw : [grip[0] - 2.5, grip[1]];
  g.strokeStyle = 'rgba(240,235,220,0.9)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(top[0], top[1]);
  g.lineTo(nock[0], nock[1]);
  g.lineTo(bot[0], bot[1]);
  g.stroke();
  if (draw && nock === draw) {
    // Arrow on the string.
    limb(g, [nock[0], nock[1]], [grip[0] + 7, grip[1]], 1.1, '#c9a46a', 1);
    poly(g, [[grip[0] + 7, grip[1] - 1.4], [grip[0] + 11, grip[1]], [grip[0] + 7, grip[1] + 1.4]], STEEL, false);
    poly(g, [[nock[0], nock[1]], [nock[0] - 3, nock[1] - 2], [nock[0] - 1.5, nock[1]], [nock[0] - 3, nock[1] + 2]], '#e8e2d2', false);
  }
}

/** Leather quiver with fletchings showing, slung across the back. */
function quiver(g: G, sh: P, view: View) {
  const x = view === 'side' ? sh[0] - 9 : sh[0] + (view === 'back' ? 0 : 8), y = sh[1] + 4;
  for (let k = 0; k < 4; k++) poly(g, [[x - 3 + k * 2, y - 12], [x - 2 + k * 2, y - 16], [x - 1 + k * 2, y - 12]], k % 2 ? '#e8e2d2' : '#b8352a', false);
  g.save();
  g.translate(x, y);
  g.rotate(view === 'side' ? -0.35 : 0.2);
  poly(g, [[-4, -12], [4, -12], [3.5, 12], [-3.5, 12]], '#6b4422');
  g.fillStyle = '#c9a46a';
  g.fillRect(-4, -12, 8, 1.6);
  g.fillRect(-3.8, 6, 7.6, 1.4);
  g.restore();
}

/** Wicker shield: woven oval with a rim, held on the far arm. */
function wickerShield(g: G, x: number, y: number) {
  blob(g, x, y, 8, 13, '#a88a52');
  g.save();
  g.beginPath();
  g.ellipse(x, y, 8, 13, 0, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = 'rgba(70,50,20,0.55)';
  g.lineWidth = 0.7;
  for (let k = -12; k <= 12; k += 2.4) {
    g.beginPath();
    g.moveTo(x - 8, y + k);
    g.quadraticCurveTo(x, y + k + 1.5, x + 8, y + k);
    g.stroke();
  }
  for (let k = -6; k <= 6; k += 3) {
    g.strokeStyle = 'rgba(255,240,200,0.25)';
    g.beginPath();
    g.moveTo(x + k, y - 13);
    g.lineTo(x + k, y + 13);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#5a3d1c';
  g.lineWidth = 1.6;
  g.beginPath();
  g.ellipse(x, y, 7.4, 12.4, 0, 0, Math.PI * 2);
  g.stroke();
}

type Kit = 'spearman' | 'archer' | 'skirmisher' | 'monk' | 'petard' | 'arbalest' | 'king';

/** Shared body for infantry and monks; the kit decides clothing, headgear and gear. */
function drawFoot(g: G, f: FigureSpec, kit0: Kit): void {
  // The Arbalest Guard is a crossbowman with a pavise; the King a robed figure like a monk.
  const pavise = kit0 === 'arbalest', king = kit0 === 'king';
  if (pavise) f = { ...f, elite: true };
  const kit: Kit = pavise ? 'archer' : king ? 'monk' : kit0;
  const look: Look = { ...f.look, female: false };
  const tool: Tool = kit === 'spearman' ? 'spear' : kit === 'archer' ? 'bow' : kit === 'skirmisher' || kit === 'petard' ? 'javelin' : 'staff';
  const acting = f.anim === 'work';
  const idleArms: Pose =
    kit === 'archer' ? { ...IDLE, armF: [12, 40] } : kit === 'spearman' ? { ...IDLE, armN: [30, 70] } : kit === 'monk' ? { ...IDLE, armN: [20, 60] } : IDLE;
  const pose = f.anim === 'walk' ? walkPose(f.frame) : acting ? workPose(tool, f.frame) : idleArms;
  if (kit === 'monk' && f.anim === 'walk') (pose.armN = [20, 60]), (pose.armF = [-10, 10]);
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  groundShadow(g, 15, 5);
  const cloth: Look = {
    ...look,
    cloth: kit === 'spearman' ? '#5a4632' : kit === 'archer' ? '#4d5a36' : kit === 'skirmisher' ? '#6b5a42' : '#3e3024',
    female: kit === 'monk',
  };
  const coat = king ? f.team : kit === 'monk' ? '#6e5236' : kit === 'archer' ? shade(f.team, 0.8) : f.team;

  if (pavise && f.view === 'side') pavisShield(g, sh[0] - 9, sh[1] + 14, f.team);
  if (f.view === 'back') {
    if (kit === 'archer') quiver(g, sh, 'back');
    if (kit === 'skirmisher') wickerShield(g, sh[0], sh[1] + 16);
  }
  if (kit !== 'monk') legs(g, pose, f.view, hip, cloth, 'far');
  let far: { hand: P; fore: number } | null = null;
  if (f.view === 'side') {
    if (kit === 'archer') quiver(g, sh, 'side');
    far = arm(g, pose, f.view, sh, look, coat, 'far');
    if (kit === 'skirmisher') wickerShield(g, far.hand[0] + 3, far.hand[1] - 6);
  }
  if (kit !== 'monk') legs(g, pose, f.view, hip, cloth, 'near');
  else {
    // A monk's habit falls to the ground over the feet.
    for (const side of [-1, 1]) blob(g, hip[0] + side * 5, -1.5, 4, 2.4, '#2e2016');
  }
  if (king) {
    // A long royal robe to the ground, trimmed with ermine.
    poly(g, [[hip[0] - 10, hip[1] - 4], [hip[0] + 10, hip[1] - 4], [hip[0] + 14, -2], [hip[0] - 14, -2]], shade(f.team, 0.9));
    ermine(g, hip[0] - 14, -6, 28, 4);
  }
  torso(g, f.view, sh, hip, cloth, coat);
  if (king) {
    ermine(g, sh[0] - 11, sh[1] - 2, 22, 5);
    if (f.view === 'back') poly(g, [[sh[0] - 11, sh[1]], [sh[0] + 11, sh[1]], [hip[0] + 15, -1], [hip[0] - 15, -1]], shade(f.team, 0.75));
  } else if (kit === 'monk') {
    // Team-coloured stole and a knotted rope belt.
    if (f.view !== 'back') {
      for (const side of [-1, 1]) limb(g, [sh[0] + side * 3.5, sh[1] + 1], [hip[0] + side * 4.5, hip[1] + 26], 3.2, f.team, 1);
    }
    g.fillStyle = '#d8c9a0';
    g.fillRect(hip[0] - 10, hip[1] - 4, 20, 2);
  }
  if (kit === 'spearman' || kit === 'skirmisher' || kit === 'petard') {
    // Quilting on the gambeson.
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 0.9;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(sh[0] - 8, sh[1] + k * 7);
      g.lineTo(hip[0] + 8, sh[1] + k * 7);
      g.stroke();
    }
  }
  if (f.view !== 'side') {
    far = arm(g, pose, f.view, sh, look, coat, 'far');
  }
  head(g, f.view, headC[0], headC[1], kit === 'monk' ? { ...look, hair: look.hair } : look, f.team);
  const [hx, hy] = headC;
  // Headgear.
  if (kit === 'spearman' && f.elite) kettleHat(g, hx, hy);
  else if (kit === 'spearman') {
    const cap = g.createLinearGradient(hx - 10, 0, hx + 10, 0);
    cap.addColorStop(0, '#9a7448');
    cap.addColorStop(1, '#4a3018');
    g.beginPath();
    g.moveTo(hx - 10, hy - 1);
    g.quadraticCurveTo(hx - 10, hy - 14, hx, hy - 14);
    g.quadraticCurveTo(hx + 10, hy - 14, hx + 10, hy - 1);
    g.closePath();
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = cap;
    g.fill();
    stroke(g, [hx - 10, hy - 1.5], [hx + 10, hy - 1.5], 1.6, '#3a2412');
  } else if (kit === 'archer') {
    // Hood with a liripipe falling behind.
    const hood = shade(cloth.cloth, 1.1);
    g.beginPath();
    if (f.view === 'side') {
      g.moveTo(hx + 7, hy + 4);
      g.quadraticCurveTo(hx + 9, hy - 13, hx - 2, hy - 13);
      g.quadraticCurveTo(hx - 13, hy - 10, hx - 16, hy + 2);
      g.lineTo(hx - 10, hy + 1);
      g.quadraticCurveTo(hx - 9, hy + 8, hx - 4, hy + 9);
      g.quadraticCurveTo(hx + 1, hy - 7, hx + 7, hy + 4);
    } else {
      g.moveTo(hx - 10, hy + 7);
      g.quadraticCurveTo(hx - 12, hy - 14, hx, hy - 13);
      g.quadraticCurveTo(hx + 12, hy - 14, hx + 10, hy + 7);
      if (f.view === 'front') {
        g.quadraticCurveTo(hx + 8, hy - 7, hx, hy - 7);
        g.quadraticCurveTo(hx - 8, hy - 7, hx - 10, hy + 7);
      }
    }
    g.closePath();
    g.strokeStyle = OUT;
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = roundLight(g, hx, hy - 5, 11, 10, hood);
    g.fill();
  } else if (kit === 'skirmisher' || kit === 'petard') {
    stroke(g, [hx - 9.5, hy - 4], [hx + 9.5, hy - 4], 2.2, f.team);
  } else if (king) crown(g, hx, hy - 9);
  else if (f.view !== 'front') {
    // Monk's cowl lying on the shoulders.
    blob(g, sh[0] - (f.view === 'side' ? 4 : 0), sh[1] + 1, 9, 4, '#5a4128');
  }
  if (kit === 'monk' && !king && f.view === 'front') blob(g, sh[0], sh[1] + 1, 10, 3.5, '#5a4128');
  if (kit === 'archer' && f.elite) {
    // Crossbowman's steel skullcap over the hood.
    const cap = g.createLinearGradient(hx - 9, 0, hx + 9, 0);
    cap.addColorStop(0, '#9aa4a9');
    cap.addColorStop(0.3, '#eef3f5');
    cap.addColorStop(1, '#4e575c');
    g.beginPath();
    g.moveTo(hx - 9, hy - 5);
    g.quadraticCurveTo(hx - 9, hy - 15, hx, hy - 15);
    g.quadraticCurveTo(hx + 9, hy - 15, hx + 9, hy - 5);
    g.closePath();
    g.strokeStyle = OUT;
    g.lineWidth = 1.3;
    g.stroke();
    g.fillStyle = cap;
    g.fill();
  }
  const near = arm(g, pose, f.view, sh, look, coat, 'near');
  // Weapons.
  if (kit === 'archer' && far) bow(g, f.view === 'side' ? far.hand : [far.hand[0], far.hand[1] - 4], acting && f.view === 'side' ? near.hand : null);
  if (kit === 'archer' && f.view === 'front') quiver(g, sh, 'front');
  if (kit === 'spearman') {
    if (f.view === 'side') {
      const angle = acting ? near.fore : 160;
      const dir = (angle + (acting ? 0 : 0)) * D2R;
      const ux = Math.sin(dir), uy = Math.cos(dir);
      const a: P = [near.hand[0] - ux * 26, near.hand[1] - uy * 26], b: P = [near.hand[0] + ux * 40, near.hand[1] + uy * 40];
      limb(g, a, b, 2.6, HANDLE, 0.85);
      const px = -uy, py = ux;
      poly(g, [[b[0] + px * 2.4, b[1] + py * 2.4], [b[0] + ux * 9, b[1] + uy * 9], [b[0] - px * 2.4, b[1] - py * 2.4]], STEEL);
    } else {
      limb(g, [near.hand[0], near.hand[1] + 26], [near.hand[0], near.hand[1] - 58], 2.6, HANDLE, 0.85);
      poly(g, [[near.hand[0] - 2.4, near.hand[1] - 58], [near.hand[0], near.hand[1] - 67], [near.hand[0] + 2.4, near.hand[1] - 58]], STEEL);
    }
  }
  if (kit === 'petard') {
    // A keg of powder hugged to the chest, fuse smoking.
    const kx = f.view === 'side' ? near.hand[0] + 2 : near.hand[0] - 6, ky = near.hand[1] - 4;
    blob(g, kx, ky, 7, 8, '#7a5230');
    g.strokeStyle = '#2b2622';
    g.lineWidth = 1.4;
    for (const dy of [-5, 5]) {
      g.beginPath();
      g.ellipse(kx, ky + dy, 7, 1.5, 0, 0, Math.PI);
      g.stroke();
    }
    stroke(g, [kx, ky - 8], [kx + 2, ky - 13], 1, '#d8c9a0');
    blob(g, kx + 2, ky - 14, 1.6, 1.6, '#ffb030', 0, false);
  }
  if (kit === 'skirmisher') {
    if (f.view === 'side') {
      const dir = (near.fore + 90) * D2R;
      const ux = Math.sin(dir), uy = Math.cos(dir);
      const released = acting && f.frame >= 3;
      if (!released) {
        limb(g, [near.hand[0] - ux * 10, near.hand[1] - uy * 10], [near.hand[0] + ux * 18, near.hand[1] + uy * 18], 1.8, HANDLE, 0.9);
        const t: P = [near.hand[0] + ux * 18, near.hand[1] + uy * 18];
        poly(g, [[t[0] - uy * 1.6, t[1] + ux * 1.6], [t[0] + ux * 5, t[1] + uy * 5], [t[0] + uy * 1.6, t[1] - ux * 1.6]], STEEL);
      }
    } else if (f.view === 'front') wickerShield(g, sh[0] - 13, sh[1] + 18);
  }
  if (pavise && f.view === 'back') pavisShield(g, sh[0], sh[1] + 16, f.team);
  if (king) {
    // A gilt sceptre topped with an orb.
    const top: P = [near.hand[0] + (f.view === 'side' ? 3 : 0), near.hand[1] - 22];
    limb(g, [near.hand[0], near.hand[1] + 6], top, 2.2, '#d9b041', 1);
    blob(g, top[0], top[1] - 2, 3, 3, '#f0cf5a');
    return;
  }
  if (kit === 'monk') {
    const top: P = [near.hand[0] + (f.view === 'side' ? 3 : 0), near.hand[1] - 30];
    limb(g, [near.hand[0] + (f.view === 'side' ? -2 : 0), near.hand[1] + 26], top, 2.4, '#6b4a28', 1);
    if (acting) {
      // A glow of blessing above the raised hands.
      const glow = g.createRadialGradient(sh[0], sh[1] - 34, 1, sh[0], sh[1] - 34, 16);
      glow.addColorStop(0, 'rgba(255,240,170,0.7)');
      glow.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(sh[0], sh[1] - 34, 16, 0, Math.PI * 2);
      g.fill();
    }
  }
}

export const drawSpearman = (g: G, f: FigureSpec) => drawFoot(g, f, 'spearman');
export const drawArcher = (g: G, f: FigureSpec) => drawFoot(g, f, 'archer');
export const drawSkirmisher = (g: G, f: FigureSpec) => drawFoot(g, f, 'skirmisher');
export const drawMonk = (g: G, f: FigureSpec) => drawFoot(g, f, 'monk');
export const drawArbalest = (g: G, f: FigureSpec) => drawFoot(g, f, 'arbalest');
export const drawKing = (g: G, f: FigureSpec) => drawFoot(g, f, 'king');
export const drawClaymore = (g: G, f: FigureSpec) => drawMilitia(g, { ...f, variant: 'claymore' });
export const drawHorseArcher = (g: G, f: FigureSpec) => drawHorseman(g, { ...f, variant: 'horse_archer' }, false);
export const drawIronBear = (g: G, f: FigureSpec) => drawHorseman(g, { ...f, variant: 'iron_bear' }, true);

/** A tall rectangular shield slung on the back. */
function pavisShield(g: G, x: number, y: number, team: string) {
  poly(g, [[x - 8, y - 16], [x + 8, y - 16], [x + 7, y + 16], [x - 7, y + 16]], team);
  stroke(g, [x, y - 15], [x, y + 15], 3, shade(team, 0.7));
  blob(g, x, y - 4, 3, 3, '#e2bc4c');
}

/** White fur with black tails. */
function ermine(g: G, x: number, y: number, w: number, h: number) {
  poly(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], '#f4f1ea');
  for (let k = 2; k < w - 1; k += 4) blob(g, x + k, y + h / 2, 0.7, 1.2, '#111', 0, false);
}

/** A gold crown with points and gems. */
export function crown(g: G, x: number, y: number, s = 1) {
  const pts: P[] = [[x - 8 * s, y + 3 * s], [x - 8 * s, y - 4 * s], [x - 5 * s, y], [x - 2.5 * s, y - 6 * s], [x, y - 1 * s], [x + 2.5 * s, y - 6 * s], [x + 5 * s, y], [x + 8 * s, y - 4 * s], [x + 8 * s, y + 3 * s]];
  const gold = g.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0);
  gold.addColorStop(0, '#b58a1c');
  gold.addColorStop(0.4, '#ffe58a');
  gold.addColorStop(1, '#9a7212');
  poly(g, pts, gold);
  blob(g, x, y + 1 * s, 1.3 * s, 1.3 * s, '#c0262c', 0, false);
  for (const k of [-5, 5]) blob(g, x + k * s, y + 1.2 * s, 1 * s, 1 * s, '#2a64c8', 0, false);
}

// Shared with the siege engine figures.
export { blob, limb, poly, roundLight, stroke, OUT, HANDLE, STEEL, STEEL_DARK, drawFoot };

export const drawPetard = (g: G, f: FigureSpec) => drawFoot(g, f, 'petard');
