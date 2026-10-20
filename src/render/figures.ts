// Articulated unit figures. Each figure is posed from a small skeleton (hips,
// shoulders, two-segment limbs) and drawn with outlined, shaded vector parts in
// "figure space": feet at y = 0, top of a standing villager's head at y = -100,
// +x is the direction the figure faces in side view.
import type { ResourceKind } from '../sim/constants';

export type View = 'front' | 'side' | 'back';
export type Anim = 'idle' | 'walk' | 'work';
export type Tool = 'none' | 'axe' | 'pick' | 'hammer' | 'basket' | 'knife' | 'spear' | 'hoe' | 'sword' | 'bow' | 'javelin' | 'staff' | 'rifle' | 'launcher' | 'tablet';

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
  /** Upgraded (Assault Breacher, Missile Team, Marksman, Strike Buggy...): better kit. */
  elite?: boolean;
  /** Missile launchers: stowed for travel. */
  packed?: boolean;
  /** Faction unique units drawn on a shared body. */
  variant?: 'claymore' | 'horse_archer' | 'iron_bear' | 'arbalest' | 'king';
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

export const SKINS = ['#f1c9a5', '#dcab80', '#b07a52', '#8a5a3a', '#5e3b26'];
export const HAIRS = ['#3b2716', '#6b4423', '#a8783f', '#d6b26e', '#1e1a18'];
export const CLOTHS = ['#3d4450', '#4a4f3c', '#2f3a4a', '#55504a'];

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
    case 'axe': {
      // Chainsaw held low and forward, juddering into the cut.
      const j = [0, 4, 8, 3][frame];
      return { bob: 1, lean: 14 + j * 0.3, ...legs, armN: [48 + j, 78 + j], armF: [62 + j, 70 + j] };
    }
    case 'pick': {
      const k = [
        { lean: -6, n: [-165, -175], f: [-150, -165] },
        { lean: -2, n: [-110, -70], f: [-100, -60] },
        { lean: 14, n: [55, 80], f: [62, 85] },
        { lean: 8, n: [25, 45], f: [30, 50] },
      ][frame];
      const low = 12;
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

/** Hi-vis yellow used on tool housings and safety kit. */
const SAFETY = '#f2b81c';

/** Draws a tool gripped at `hand`, oriented by the forearm angle. */
function drawTool(g: G, tool: Tool, hand: P, fore: number) {
  if (tool === 'none' || tool === 'basket') return;
  // Hafted tools are held roughly at right angles to the forearm.
  const dir = (fore + (tool === 'spear' ? 0 : 90)) * D2R;
  const ux = Math.sin(dir), uy = Math.cos(dir);
  const px = -uy, py = ux;
  if (tool === 'axe') {
    // Chainsaw: an orange body at the hand, the bar and chain running forward.
    const d = (fore + 20) * D2R, cx = Math.sin(d), cy = Math.cos(d);
    const qx = -cy, qy = cx;
    const body: P[] = [
      [hand[0] - cx * 6 - qx * 5, hand[1] - cy * 6 - qy * 5],
      [hand[0] + cx * 8 - qx * 5, hand[1] + cy * 8 - qy * 5],
      [hand[0] + cx * 8 + qx * 4, hand[1] + cy * 8 + qy * 4],
      [hand[0] - cx * 6 + qx * 4, hand[1] - cy * 6 + qy * 4],
    ];
    const tip: P = [hand[0] + cx * 30, hand[1] + cy * 30];
    poly(g, [[hand[0] + cx * 7 - qx * 2, hand[1] + cy * 7 - qy * 2], [tip[0] - qx * 1.6, tip[1] - qy * 1.6], [tip[0] + qx * 1.6, tip[1] + qy * 1.6], [hand[0] + cx * 7 + qx * 2.5, hand[1] + cy * 7 + qy * 2.5]], '#b9c1c6');
    stroke(g, [hand[0] + cx * 8 - qx * 2.6, hand[1] + cy * 8 - qy * 2.6], [tip[0] - qx * 2.2, tip[1] - qy * 2.2], 0.8, '#30343a');
    poly(g, body, '#e8661c');
    limb(g, [hand[0] - cx * 4 - qx * 6, hand[1] - cy * 4 - qy * 6], [hand[0] + cx * 5 - qx * 6, hand[1] + cy * 5 - qy * 6], 1.4, '#22262b');
    return;
  }
  if (tool === 'sword') {
    // Machete.
    const d2 = (fore + 90) * D2R, sx = Math.sin(d2), sy = Math.cos(d2);
    const tipP: P = [hand[0] + sx * 22, hand[1] + sy * 22];
    poly(g, [[hand[0] + sx * 3 - sy * 2, hand[1] + sy * 3 + sx * 2], [tipP[0] - sy * 1.2, tipP[1] + sx * 1.2], [tipP[0] + sy * 1.6, tipP[1] - sx * 1.6], [hand[0] + sx * 3 + sy * 1.4, hand[1] + sy * 3 - sx * 1.4]], '#8f979c');
    limb(g, [hand[0] - sx * 4, hand[1] - sy * 4], [hand[0] + sx * 2.5, hand[1] + sy * 2.5], 2.6, '#22262b');
    return;
  }
  const len = tool === 'spear' ? 40 : tool === 'knife' ? 9 : tool === 'hammer' ? 17 : tool === 'hoe' ? 30 : 26;
  const back = tool === 'spear' ? 14 : tool === 'knife' ? 1 : 4;
  const a: P = [hand[0] - ux * back, hand[1] - uy * back];
  const b: P = [hand[0] + ux * len, hand[1] + uy * len];
  if (tool === 'knife') {
    poly(g, [[hand[0], hand[1]], [b[0] - uy * 1.5, b[1] + ux * 1.5], [b[0] + ux * 3, b[1] + uy * 3], [b[0] + uy * 1.5, b[1] - ux * 1.5]], STEEL);
    return;
  }
  if (tool === 'spear') {
    // Fishing rod: a whippy graphite rod with a reel, its line dropping into the water.
    limb(g, a, b, 1.6, '#2a2e33', 0.5);
    blob(g, hand[0] + ux * 3 + px * 3, hand[1] + uy * 3 + py * 3, 2.4, 2.4, '#9aa3a8');
    g.strokeStyle = 'rgba(240,240,240,0.7)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(b[0], b[1]);
    g.lineTo(b[0] + 2, 0);
    g.stroke();
    return;
  }
  // Fibreglass handles in safety yellow with a black grip.
  limb(g, a, b, 2.6, tool === 'hoe' ? '#7a5430' : SAFETY);
  limb(g, a, [a[0] + ux * 7, a[1] + uy * 7], 2.9, '#22262b');
  if (tool === 'pick') {
    poly(g, [[b[0] - px * 12 - ux * 2, b[1] - py * 12 - uy * 2], [b[0] - ux * 2.5, b[1] - uy * 2.5], [b[0] + px * 12 - ux * 2, b[1] + py * 12 - uy * 2], [b[0] + ux * 2, b[1] + uy * 2]], '#4a5056');
  } else if (tool === 'hoe') {
    poly(g, [[b[0] - ux * 1, b[1] - uy * 1], [b[0] + px * 2 + ux * 7, b[1] + py * 2 + uy * 7], [b[0] - px * 3 + ux * 7, b[1] - py * 3 + uy * 7]], STEEL_DARK);
  } else if (tool === 'hammer') {
    poly(g, [[b[0] - px * 5 - ux * 3, b[1] - py * 5 - uy * 3], [b[0] + px * 5 - ux * 3, b[1] + py * 5 - uy * 3], [b[0] + px * 5 + ux * 3, b[1] + py * 5 + uy * 3], [b[0] - px * 5 + ux * 3, b[1] - py * 5 + uy * 3]], '#3a4046');
  }
}

/** A blue plastic harvest crate, filled when `full`. */
function basket(g: G, x: number, y: number, full: string | null) {
  if (full) for (const [dx, dy] of [[-3, -5], [0, -6], [3, -5], [-1.5, -3.5], [1.5, -3.5]]) blob(g, x + dx, y + dy, 1.9, 1.9, full, 0, false);
  poly(g, [[x - 7, y - 4], [x + 7, y - 4], [x + 6.5, y + 5], [x - 6.5, y + 5]], '#2f78c8');
  g.fillStyle = 'rgba(10,20,40,0.45)';
  for (let k = -4; k <= 4; k += 4) g.fillRect(x + k - 1, y - 1.5, 2, 4);
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
  blob(g, x, y, 7.5, 9, '#e2e0d8');
  limb(g, [x - 1, y - 9], [x + 1, y - 12], 2.2, '#2f78c8');
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

/** A hard hat with a peak and a ridge; yellow or white by look. */
function hardHat(g: G, view: View, x: number, y: number, color: string) {
  const hat = roundLight(g, x - 2, y - 9, 11, 7, color);
  g.beginPath();
  if (view === 'side') {
    g.moveTo(x - 9.5, y - 4);
    g.quadraticCurveTo(x - 10, y - 15, x, y - 15);
    g.quadraticCurveTo(x + 9, y - 15, x + 9.5, y - 5);
    g.lineTo(x + 14, y - 4);
    g.lineTo(x + 14, y - 2.6);
    g.lineTo(x - 10, y - 2.6);
  } else {
    g.moveTo(x - 11, y - 3);
    g.quadraticCurveTo(x - 10.5, y - 16, x, y - 16);
    g.quadraticCurveTo(x + 10.5, y - 16, x + 11, y - 3);
    g.lineTo(x + 12, y - 1.6);
    g.lineTo(x - 12, y - 1.6);
  }
  g.closePath();
  g.strokeStyle = OUT;
  g.lineWidth = 1.3;
  g.stroke();
  g.fillStyle = hat;
  g.fill();
  stroke(g, [x - (view === 'side' ? 3 : 0), y - 15.5], [x - (view === 'side' ? 3 : 0), y - 4], 1.6, shade(color, 1.15));
}

/** A team-coloured hi-vis vest with silver reflective bands over the work shirt. */
function vest(g: G, view: View, sh: P, hip: P, team: string) {
  const half = view === 'side' ? 8 : 11.5;
  const pts: P[] = [[sh[0] - half + 1, sh[1] + 1], [sh[0] + half - 1, sh[1] + 1], [hip[0] + half, hip[1] + 3], [hip[0] - half, hip[1] + 3]];
  poly(g, pts, shade(team, 1.15));
  for (const t of [0.55, 0.8]) {
    const y0 = sh[1] + (hip[1] + 3 - sh[1]) * t;
    g.fillStyle = 'rgba(232,236,240,0.92)';
    g.fillRect(sh[0] - half - 0.5 + t * (hip[0] - sh[0]), y0, half * 2 + 1, 2.2);
  }
  if (view === 'front') stroke(g, [sh[0], sh[1] + 2], [hip[0], hip[1] + 3], 0.8, 'rgba(0,0,0,0.35)');
}

export function drawVillager(g: G, f: FigureSpec): void {
  const pose = f.anim === 'walk' ? walkPose(f.frame) : f.anim === 'work' ? workPose(f.tool, f.frame) : IDLE;
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  // Everyone in work trousers and a short shirt; the female look keeps a ponytail.
  const look: Look = { ...f.look, female: false, cloth: '#38404c' };
  const shirt = f.look.cloth;
  groundShadow(g, 15, 5);

  if (f.view === 'back' && f.carry) drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, look, 'far');
  const farArm = f.view === 'side' ? arm(g, pose, f.view, sh, look, shirt, 'far') : null;
  if (f.view === 'side' && f.carry && f.carry !== 'food' && f.carry !== 'wood') drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, look, 'near');
  torso(g, f.view, sh, hip, look, shirt);
  vest(g, f.view, sh, hip, f.team);
  if (f.view !== 'side') {
    arm(g, pose, f.view, sh, look, shirt, 'far');
  }
  if (f.look.female && f.view !== 'front') {
    // Ponytail out from under the hat.
    const bx = headC[0] - (f.view === 'side' ? 8 : 0);
    limb(g, [bx, headC[1] - 2], [bx - (f.view === 'side' ? 4 : 0), headC[1] + 10], 4.4, f.look.hair, 0.6);
  }
  head(g, f.view, headC[0], headC[1], look, f.team);
  hardHat(g, f.view, headC[0], headC[1], f.look.female || f.look.hair === HAIRS[2] ? '#f4f4f0' : SAFETY);
  if (f.carry === 'wood') drawCarry(g, f.carry, f.view, sh, hip, false);
  const near = arm(g, pose, f.view, sh, look, shirt, 'near');
  if (f.carry === 'food') drawCarry(g, f.carry, f.view, sh, hip, false);
  if (f.view !== 'back' && f.carry && f.carry !== 'food' && f.carry !== 'wood' && f.view === 'front') {
    // Front view: the bag's top shows over the shoulder.
    blob(g, sh[0] - 9, sh[1] - 1, 4.5, 3.5, '#e2e0d8');
  }
  if (f.anim === 'work' && f.tool === 'basket' && farArm) basket(g, farArm.hand[0], farArm.hand[1] + 5, '#c0303e');
  if (f.tool !== 'none' && f.view === 'side') drawTool(g, f.tool, near.hand, near.fore);
}

// Shared with the modern troop, vehicle and engine figures.
export { blob, limb, poly, roundLight, stroke, seg, legs, arm, head, torso, walkPose, workPose, groundShadow, drawTool, OUT, HANDLE, STEEL, STEEL_DARK, BOOT, LEATHER, D2R, IDLE };
export type { G, P, Pose };
