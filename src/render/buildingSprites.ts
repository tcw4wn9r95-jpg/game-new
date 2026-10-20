// Isometric buildings for the 21st century, modelled with the iso3d toolkit
// and rendered once per zoom level, player colour and variant. The base is
// restyled as it advances: corrugated prefabs and containers, then precast
// concrete, then concrete and glass, then glass towers with solar roofs and
// lit trims.
import type { BuildingType } from '../sim/entities';
import { Rng } from '../sim/rng';
import { type G, type WallStyle, P, ZK, box, boxShadow, boxTop, gableRoof, line3, mat, onGround, poly3, post, prism, setScale, shadeColor, softShadow } from './iso3d';
import { type Material, grade } from './materials';
import { PLAYER_COLORS } from './palette';
import { type Sprite, SpriteCache, cropSprite } from './sprites';

/** n: footprint in tiles; variant: building-specific state, e.g. a farm's crop stage (0 bare .. 3 ripe). */
type Painter = (g: G, n: number, team: string, rng: Rng, variant: number) => void;

/** Units of structure drawn above the footprint's north corner. */
const RISE = 240;
const PAD = 26;

// Finishes by age, set by style() before each sprite is painted.
let CLAD: WallStyle = { base: '#a8a48f', mat: 'metal' };
let PANEL: WallStyle = { base: '#b4b1a8', mat: 'concrete' };
let GLASS: WallStyle = { base: '#4f7590', mat: 'glass' };
const METAL: WallStyle = { base: '#8d949a', mat: 'metal' };
const DARK_METAL: WallStyle = { base: '#59606a', mat: 'metal' };
let ROOF = '#6d7175';
/** Concrete and glass from the Network Age; solar roofs and lit trims in the last. */
let GLAZED = false;
let HIGHTECH = false;
/** Flag cut for the player being painted (their faction's). */
type BannerCut = 'swallowtail' | 'pennant' | 'square' | 'tongued';
let BANNER: BannerCut = 'square';
const BANNERS: BannerCut[] = [];

/** Each player's flag cut, from their faction (set at the start of a match). */
export function setBanners(cuts: Array<string | undefined>): void {
  BANNERS.length = 0;
  for (const c of cuts) BANNERS.push((c as BannerCut) ?? 'square');
}

function style(age: number): void {
  GLAZED = age >= 2;
  HIGHTECH = age >= 3;
  if (age === 0) {
    CLAD = { base: '#a8a48f', mat: 'metal' };
    PANEL = { base: '#aeaaa0', mat: 'concrete' };
    ROOF = '#6d7175';
  } else if (age === 1) {
    CLAD = { base: '#b9b5aa', mat: 'concrete' };
    PANEL = { base: '#b9b5aa', mat: 'concrete' };
    ROOF = '#5d6268';
  } else if (age === 2) {
    CLAD = { base: '#c9c7c0', mat: 'concrete' };
    PANEL = { base: '#c9c7c0', mat: 'concrete' };
    ROOF = '#4f555c';
  } else {
    CLAD = { base: '#e3e4e2', mat: 'concrete' };
    PANEL = { base: '#dcdedd', mat: 'concrete' };
    ROOF = '#3f454c';
  }
  GLASS = { base: age >= 3 ? '#4a86b0' : '#4f7590', mat: 'glass' };
}

// ---------- small parts ----------

/** Lifts what `draw` paints by z units. */
function at(g: G, z: number, draw: () => void): void {
  g.save();
  g.translate(0, -z * ZK);
  draw();
  g.restore();
}

/** A block with a flat top: the workhorse of modern architecture. */
function slab(g: G, x0: number, y0: number, x1: number, y1: number, h: number, wall: WallStyle, detail: Parameters<typeof box>[7] = {}, top: Material = 'membrane', topColor = ROOF, seed = 1): void {
  box(g, x0, y0, x1, y1, h, wall, detail, seed);
  boxTop(g, x0, y0, x1, y1, h, top, topColor);
  // A parapet line around the roof.
  line3(g, [x0, y1, h], [x1, y1, h], 'rgba(255,255,255,0.35)', 0.6);
  line3(g, [x1, y0, h], [x1, y1, h], 'rgba(255,255,255,0.25)', 0.6);
}

/** A strip of dark glazing in wall space from u0 to u1, v (bottom) to v + h, with mullions. */
function band(g: G, u0: number, u1: number, v: number, h: number, warm = false): void {
  const grad = g.createLinearGradient(0, v, 0, v + h);
  grad.addColorStop(0, '#2c4a62');
  grad.addColorStop(1, '#16222e');
  g.fillStyle = grad;
  g.fillRect(u0, v, u1 - u0, h);
  if (warm) {
    g.fillStyle = 'rgba(255,214,140,0.35)';
    for (let u = u0 + 2; u < u1 - 3; u += 11) g.fillRect(u, v + 0.6, 4, h - 1.2);
  }
  g.fillStyle = 'rgba(200,230,255,0.22)';
  g.fillRect(u0, v + h * 0.55, u1 - u0, h * 0.18);
  g.fillStyle = '#a3abb1';
  for (let u = u0; u <= u1 + 0.01; u += 5.5) g.fillRect(Math.min(u, u1 - 0.5), v, 0.5, h);
  g.fillRect(u0 - 0.4, v - 0.6, u1 - u0 + 0.8, 0.6);
}

/** Single windows along a wall. */
function windows(g: G, len: number, v: number, h = 5, step = 9): void {
  for (let u = step * 0.7; u < len - step * 0.4; u += step) band(g, u - 2, u + 2, v, h);
}

/** A sectional roll-up door with slats and a dark sill. */
function rollDoor(g: G, u: number, w: number, h: number, open = false): void {
  g.fillStyle = '#4a4f55';
  g.fillRect(u - w / 2 - 1, 0, w + 2, h + 1.2);
  if (open) {
    g.fillStyle = '#121519';
    g.fillRect(u - w / 2, 0, w, h);
    return;
  }
  g.fillStyle = mat(g, 'metal', '#aab0b5', 61);
  g.fillRect(u - w / 2, 0, w, h);
  g.fillStyle = 'rgba(30,34,38,0.45)';
  for (let v = 1.6; v < h; v += 2.2) g.fillRect(u - w / 2, v, w, 0.35);
  g.fillStyle = '#e8b51c';
  g.fillRect(u - w / 2, 0, w, 0.8);
}

/** A glazed entrance door with a canopy. */
function glassDoor(g: G, u: number, w = 6, h = 10): void {
  g.fillStyle = '#5c646b';
  g.fillRect(u - w / 2 - 0.8, 0, w + 1.6, h + 0.8);
  band(g, u - w / 2, u + w / 2, 0, h);
  g.fillStyle = '#3b4248';
  g.fillRect(u - w / 2 - 2, h + 0.8, w + 4, 1.2);
}

/** A team-coloured sign panel with a white chevron emblem. */
function sign(g: G, u: number, v: number, w: number, h: number, team: string): void {
  g.fillStyle = shadeColor(team, 0.85);
  g.fillRect(u - w / 2, v, w, h);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(u - w * 0.28, v + h * 0.72);
  g.lineTo(u, v + h * 0.3);
  g.lineTo(u + w * 0.28, v + h * 0.72);
  g.lineTo(u + w * 0.28, v + h * 0.5);
  g.lineTo(u, v + h * 0.12);
  g.lineTo(u - w * 0.28, v + h * 0.5);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(u - w / 2, v + h - 0.6, w, 0.6);
}

/** Yellow-and-black hazard stripes along a wall. */
function hazard(g: G, u0: number, u1: number, v: number, h: number): void {
  g.save();
  g.beginPath();
  g.rect(u0, v, u1 - u0, h);
  g.clip();
  g.fillStyle = '#e8b51c';
  g.fillRect(u0, v, u1 - u0, h);
  g.fillStyle = '#1d1f22';
  for (let u = u0 - h; u < u1 + h; u += h * 1.6) {
    g.beginPath();
    g.moveTo(u, v);
    g.lineTo(u + h * 0.8, v);
    g.lineTo(u + h * 1.6, v + h);
    g.lineTo(u + h * 0.8, v + h);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** A team-lit LED trim around a roof edge (last age). */
function trim(g: G, x0: number, y0: number, x1: number, y1: number, z: number, team: string): void {
  if (!HIGHTECH) return;
  for (const [a, b] of [[[x0, y1], [x1, y1]], [[x1, y0], [x1, y1]]] as const) {
    line3(g, [a[0], a[1], z - 1.2], [b[0], b[1], z - 1.2], shadeColor(team, 1.35), 1.2);
    line3(g, [a[0], a[1], z - 1.2], [b[0], b[1], z - 1.2], 'rgba(255,255,255,0.45)', 0.4);
  }
}

/** A rooftop air-conditioning unit with a fan grille. */
function hvac(g: G, x: number, y: number, z: number, s = 0.3): void {
  at(g, z, () => {
    slab(g, x, y, x + s, y + s * 0.7, 6, METAL, {}, 'metal', '#9aa1a6', 5);
    const [cx, cy] = P(x + s / 2, y + s * 0.35, 6);
    g.fillStyle = '#2b3036';
    g.beginPath();
    g.ellipse(cx, cy, s * 12, s * 6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8d949a';
    g.lineWidth = 0.4;
    g.stroke();
  });
}

/** Rows of tilted solar panels on a roof from (x0, y0) to (x1, y1) at height z. */
function solar(g: G, x0: number, y0: number, x1: number, y1: number, z: number): void {
  for (let y = y0; y < y1 - 0.15; y += 0.32)
    for (let x = x0; x < x1 - 0.2; x += 0.42) {
      const pts: [number, number, number][] = [[x, y, z + 1], [x + 0.36, y, z + 1], [x + 0.36, y + 0.22, z + 5], [x, y + 0.22, z + 5]];
      poly3(g, pts, '#22385a', 'rgba(170,190,210,0.7)', 0.35);
      line3(g, [x + 0.18, y, z + 1], [x + 0.18, y + 0.22, z + 5], 'rgba(170,190,210,0.5)', 0.3);
    }
}

/** A steel lattice mast with a beacon, at (x, y) from height z. */
function mast(g: G, x: number, y: number, z: number, h: number, team: string, dishes = true): void {
  const [bx, by] = P(x, y, z), [tx, ty] = P(x, y, z + h);
  g.strokeStyle = '#4b5258';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(bx - 3, by);
  g.lineTo(tx - 0.6, ty);
  g.moveTo(bx + 3, by);
  g.lineTo(tx + 0.6, ty);
  g.stroke();
  g.lineWidth = 0.4;
  const steps = Math.max(3, Math.round(h / 8));
  for (let k = 0; k < steps; k++) {
    const f0 = k / steps, f1 = (k + 1) / steps;
    const w0 = 3 - 2.4 * f0, w1 = 3 - 2.4 * f1;
    const y0 = by + (ty - by) * f0, y1 = by + (ty - by) * f1;
    g.beginPath();
    g.moveTo(bx - w0, y0);
    g.lineTo(bx + w1, y1);
    g.moveTo(bx + w0, y0);
    g.lineTo(bx - w1, y1);
    g.stroke();
  }
  if (dishes) {
    dish(g, tx - 2, ty + h * 0.35 * ZK, 3.2, -1);
    dish(g, tx + 2, ty + h * 0.55 * ZK, 2.6, 1);
  }
  flagAt(g, tx, ty, team, 0.8);
  g.fillStyle = '#ff3a2a';
  g.beginPath();
  g.arc(tx, ty - 1, 1, 0, Math.PI * 2);
  g.fill();
}

/** A small microwave or satellite dish in screen space, facing left (-1) or right (+1). */
function dish(g: G, x: number, y: number, r: number, side: number): void {
  g.fillStyle = '#e8eaea';
  g.beginPath();
  g.ellipse(x + side * r * 0.5, y, r * 0.45, r, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(40,40,40,0.45)';
  g.lineWidth = 0.4;
  g.stroke();
}

/** A white radar dome on a short drum. */
function radome(g: G, x: number, y: number, z: number, r: number): void {
  const [cx, cy] = P(x, y, z);
  const R = r * 45;
  g.fillStyle = '#c9cccd';
  g.fillRect(cx - R * 0.7, cy - 6, R * 1.4, 6);
  const grad = g.createRadialGradient(cx - R * 0.35, cy - R * 0.9, R * 0.1, cx, cy - R * 0.5, R * 1.1);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, '#e2e5e6');
  grad.addColorStop(1, '#9aa1a4');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy - 6, R, Math.PI, 0);
  g.ellipse(cx, cy - 6, R, R * 0.35, 0, 0, Math.PI);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(80,90,95,0.35)';
  g.lineWidth = 0.4;
  for (const k of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.ellipse(cx, cy - 6, R * Math.abs(Math.cos(k)) * 0.98, R, 0, Math.PI, 0);
    g.stroke();
  }
}

/** A vertical cylinder (silo or tank) with a domed top, at (x, y) with radius r tiles and height h. */
function silo(g: G, x: number, y: number, r: number, h: number, color: string, dome = true): void {
  const [cx, cy] = P(x, y, 0), [, ty] = P(x, y, h);
  const rx = r * 45, ry = r * 22.5;
  g.fillStyle = 'rgba(8,12,4,0.35)';
  g.beginPath();
  g.ellipse(cx + rx * 0.4, cy + ry * 0.3, rx * 1.15, ry * 1.1, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  grad.addColorStop(0, shadeColor(color, 1.2));
  grad.addColorStop(0.35, shadeColor(color, 1.05));
  grad.addColorStop(1, shadeColor(color, 0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx - rx, ty);
  g.lineTo(cx - rx, cy);
  g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(cx + rx, ty);
  g.closePath();
  g.fill();
  // Ribs.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 0.4;
  for (let v = cy - 6; v > ty; v -= 6) {
    g.beginPath();
    g.ellipse(cx, v, rx, ry, 0, 0, Math.PI);
    g.stroke();
  }
  g.fillStyle = shadeColor(color, 1.15);
  g.beginPath();
  g.ellipse(cx, ty, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  if (dome) {
    const dg = g.createRadialGradient(cx - rx * 0.4, ty - ry * 1.4, 1, cx, ty, rx * 1.1);
    dg.addColorStop(0, shadeColor(color, 1.3));
    dg.addColorStop(1, shadeColor(color, 0.75));
    g.fillStyle = dg;
    g.beginPath();
    g.ellipse(cx, ty, rx, ry, 0, Math.PI, 0);
    g.quadraticCurveTo(cx, ty - ry * 3.2, cx - rx, ty);
    g.fill();
  }
}

/** A shipping container lying along x (or y), w tiles long. */
function container(g: G, x: number, y: number, color: string, alongX = true, len = 0.95, z = 0): void {
  const [x1, y1] = alongX ? [x + len, y + 0.4] : [x + 0.4, y + len];
  at(g, z, () => {
    softShadow(g, [[x, y, 0], [x1 + 0.1, y, 0], [x1 + 0.1, y1 + 0.05, 0], [x, y1 + 0.05, 0]], 2, 0.4);
    box(g, x, y, x1, y1, 13, { base: color, mat: 'metal' }, {}, 63);
    boxTop(g, x, y, x1, y1, 13, 'metal', shadeColor(color, 1.05));
  });
}

/** A neat stack of logs with end grain facing the viewer. */
function logs(g: G, x: number, y: number, rows = 3, cols = 4): void {
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols - (r % 2); k++) {
      const cx = x + k * 0.12 + (r % 2) * 0.06;
      const [ax, ay] = P(cx, y - 0.55, 1.6 + r * 2.8), [bx, by] = P(cx, y, 1.6 + r * 2.8);
      g.strokeStyle = '#6b4626';
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.fillStyle = '#d9b27a';
      g.beginPath();
      g.ellipse(bx, by, 1.3, 1.3, 0, 0, Math.PI * 2);
      g.fill();
    }
}

/** A heap of rock or ore. */
function heap(g: G, x: number, y: number, color: string, rng: Rng, size = 1): void {
  const [cx, cy] = P(x, y, 0);
  g.fillStyle = 'rgba(8,12,4,0.38)';
  g.beginPath();
  g.ellipse(cx + 2, cy, 10 * size, 4 * size, 0, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 16; k++) {
    const a = rng.next() * Math.PI * 2, d = rng.next() * 0.24 * size * (1 - k / 20);
    const [px, py] = P(x + Math.cos(a) * d, y + Math.sin(a) * d, 0);
    const r = (1.4 + rng.next() * 1.4) * size;
    const yy = py - 1 - k * 0.38 * size;
    const grad = g.createRadialGradient(px - r * 0.4, yy - r * 0.5, 0.2, px, yy, r * 1.2);
    grad.addColorStop(0, shadeColor(color, 1.35));
    grad.addColorStop(0.5, shadeColor(color, 0.85 + rng.next() * 0.2));
    grad.addColorStop(1, shadeColor(color, 0.4));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(px - r, yy);
    g.lineTo(px - r * 0.4, yy - r * 0.9);
    g.lineTo(px + r * 0.6, yy - r * 0.8);
    g.lineTo(px + r, yy + r * 0.1);
    g.lineTo(px + r * 0.2, yy + r * 0.7);
    g.lineTo(px - r * 0.7, yy + r * 0.6);
    g.closePath();
    g.fill();
  }
}

/** A row of stacked sandbags from a to b at the given courses. */
function sandbagRun(g: G, a: [number, number], b: [number, number], courses = 3, color = '#b7a37a'): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 0.13));
  for (let c = 0; c < courses; c++)
    for (let k = 0; k <= n; k++) {
      const f = (k + (c % 2) * 0.5) / n;
      if (f > 1) continue;
      const [x, y] = P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 2.2 + c * 4.2);
      const grad = g.createRadialGradient(x - 1.5, y - 1.5, 0.3, x, y, 4.5);
      grad.addColorStop(0, shadeColor(color, 1.25));
      grad.addColorStop(1, shadeColor(color, 0.6));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, 4, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(60,45,20,0.45)';
      g.lineWidth = 0.35;
      g.stroke();
    }
}

/** A floodlight on a pole. */
function floodlight(g: G, x: number, y: number, h: number): void {
  post(g, x, y, h, 1.2, '#59606a');
  const [lx, ly] = P(x, y, h);
  g.fillStyle = '#2b3036';
  g.fillRect(lx - 2.6, ly - 2, 5.2, 2.4);
  g.fillStyle = '#fff6c8';
  g.fillRect(lx - 2, ly - 0.6, 4, 0.9);
}

/** A helipad: a dark circle with a yellow ring and an H. */
function helipad(g: G, cx: number, cy: number, r: number): void {
  onGround(g, 0, 0, () => {
    const X = cx * 32, Y = cy * 32, R = r * 32;
    g.fillStyle = '#3a3f44';
    g.beginPath();
    g.arc(X, Y, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e8c22a';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(X, Y, R * 0.82, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f2f2f2';
    g.fillRect(X - R * 0.32, Y - R * 0.4, R * 0.14, R * 0.8);
    g.fillRect(X + R * 0.18, Y - R * 0.4, R * 0.14, R * 0.8);
    g.fillRect(X - R * 0.2, Y - R * 0.07, R * 0.4, R * 0.14);
  });
}

/** A rectangular team flag at a screen point (the top of a pole). */
function flagAt(g: G, x: number, y: number, team: string, s = 1): void {
  const top = y + 1 * s, bot = y + 8 * s, len = 12 * s;
  g.beginPath();
  g.moveTo(x + 0.4, top);
  g.bezierCurveTo(x + len * 0.35, top - 1.6 * s, x + len * 0.65, top + 1.6 * s, x + len, top + 1 * s);
  if (BANNER === 'pennant') g.lineTo(x + len * 1.15, (top + bot) / 2);
  else if (BANNER === 'swallowtail') g.lineTo(x + len * 0.75, (top + bot) / 2 + 1);
  else if (BANNER === 'tongued') g.lineTo(x + len * 0.82, (top + bot) / 2 + 1);
  g.lineTo(x + len, bot + 1 * s);
  g.bezierCurveTo(x + len * 0.6, bot + 1.6 * s, x + len * 0.35, bot - 1.6 * s, x + 0.4, bot);
  g.closePath();
  const cloth = g.createLinearGradient(x, 0, x + len, 0);
  cloth.addColorStop(0, shadeColor(team, 0.8));
  cloth.addColorStop(0.3, shadeColor(team, 1.2));
  cloth.addColorStop(0.6, shadeColor(team, 0.75));
  cloth.addColorStop(1, shadeColor(team, 1.05));
  g.fillStyle = cloth;
  g.fill();
  // A white stripe across the flag.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(x + 1, (top + bot) / 2 - 0.4 * s, len * 0.8, 1 * s);
}

/** A steel flagpole with the owner's flag. */
function flag(g: G, x: number, y: number, z: number, team: string, s = 1): void {
  const [bx, by] = P(x, y, z);
  const pole = g.createLinearGradient(bx - 0.8, 0, bx + 0.8, 0);
  pole.addColorStop(0, '#e2e6e8');
  pole.addColorStop(1, '#6b7378');
  g.fillStyle = pole;
  g.fillRect(bx - 0.6, by - 26 * s, 1.2, 26 * s);
  g.fillStyle = '#d8dcde';
  g.beginPath();
  g.arc(bx, by - 26.5 * s, 1.1, 0, Math.PI * 2);
  g.fill();
  flagAt(g, bx, by - 25 * s, team, s * 1.15);
}

/**
 * Paving around a building, with a soft, irregular edge. Painted first, onto
 * the empty sprite, so its alpha can be feathered with destination-in.
 */
function apron(g: G, n: number, color: string, spread = 0.2, m: Material = 'membrane'): void {
  onGround(g, 0, 0, () => {
    const w = n * 32, pad = spread * 32;
    g.fillStyle = mat(g, m, color, 2);
    g.fillRect(-pad, -pad, w + pad * 2, w + pad * 2);
    g.globalCompositeOperation = 'destination-in';
    const r = w / 2 + pad;
    const fade = g.createRadialGradient(w / 2, w / 2, r * 0.6, w / 2, w / 2, r * 1.05);
    fade.addColorStop(0, 'rgba(0,0,0,0.95)');
    fade.addColorStop(0.65, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(-w, -w, w * 3, w * 3);
    g.globalCompositeOperation = 'source-over';
  });
}

/** Painted lines on paving: parking bays or a lane, in ground space (tiles). */
function lines(g: G, pts: Array<[number, number, number, number]>, color = 'rgba(240,240,230,0.7)'): void {
  onGround(g, 0, 0, () => {
    g.strokeStyle = color;
    g.lineWidth = 0.8;
    for (const [x0, y0, x1, y1] of pts) {
      g.beginPath();
      g.moveTo(x0 * 32, y0 * 32);
      g.lineTo(x1 * 32, y1 * 32);
      g.stroke();
    }
  });
}

/** A chain-link fence along a ground line, on steel posts. */
function fence(g: G, a: [number, number], b: [number, number], h = 9): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 0.45));
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  poly3(g, [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h], [a[0], a[1], h]], 'rgba(170,180,186,0.22)', null);
  for (const [x, y] of pts) post(g, x, y, h, 0.8, '#7b838a');
  line3(g, [a[0], a[1], h], [b[0], b[1], h], '#8d959b', 0.5);
}

// ---------- fortifications ----------

/** Neighbour directions for wall joins; bit k of a wall sprite's variant is DIR8[k]. */
export const DIR8: Array<[number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/** Wall variant bits: 0-7 neighbours, 8-9 damage (0-2), 10 open gate, 11 locked, 12-13 tower level. */
export const wallVariant = (mask: number, damage: number, open = false, locked = false, level = 0) => mask | (damage << 8) | (open ? 1 << 10 : 0) | (locked ? 1 << 11 : 0) | (level << 12);

/** Joined directions of a wall variant, back (far from the viewer) to front. */
function joins(variant: number): Array<[number, number]> {
  return DIR8.filter((_, k) => variant & (1 << k)).sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
}

/** A run of wall from the tile centre half-way toward a neighbour, as a ground quad. */
function halfRun(d: [number, number], t: number): Array<[number, number]> {
  const len = Math.hypot(d[0], d[1]);
  const ux = d[0] / len, uy = d[1] / len;
  const px = -uy * (t / 2), py = ux * (t / 2);
  const ex = 0.5 + d[0] * 0.5, ey = 0.5 + d[1] * 0.5;
  return [[0.5 + px, 0.5 + py], [ex + px, ey + py], [ex - px, ey - py], [0.5 - px, 0.5 - py]];
}

/** Hairline cracks and spalled chips over a damaged wall (screen space around the tile centre). */
function cracks(g: G, level: number, height: number, rng: Rng): void {
  if (!level) return;
  const [cx, cy] = P(0.5, 0.5, 0);
  g.strokeStyle = 'rgba(20,14,8,0.75)';
  g.lineWidth = 0.7;
  for (let n = 0; n < level * 3; n++) {
    let x = cx + (rng.next() - 0.5) * 30, y = cy - height * (0.3 + rng.next() * 0.6);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rng.next() - 0.5) * 5;
      y += 2 + rng.next() * 3;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  if (level > 1)
    for (let n = 0; n < 5; n++) {
      const x = cx + (rng.next() - 0.5) * 26, y = cy - height * (0.2 + rng.next() * 0.7);
      g.fillStyle = 'rgba(30,22,14,0.65)';
      g.beginPath();
      g.ellipse(x, y, 1.5 + rng.next() * 2, 1 + rng.next(), 0, 0, Math.PI * 2);
      g.fill();
    }
}

/** Coils of razor wire along the top of a wall run. */
function razorWire(g: G, a: [number, number], b: [number, number], z: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 0.09));
  g.strokeStyle = 'rgba(210,216,220,0.85)';
  g.lineWidth = 0.4;
  for (let k = 0; k < n; k++) {
    const f = k / n;
    const [x, y] = P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, z + 2.4);
    g.beginPath();
    g.ellipse(x, y, 2.2, 2.4, 0.3, 0, Math.PI * 2);
    g.stroke();
  }
}

/** Precast concrete T-walls: tall slabs on a footing, with razor wire once fortified. */
function concreteWall(g: G, variant: number, rng: Rng, height = 28): void {
  const st: WallStyle = { base: HIGHTECH ? '#c3c1ba' : '#aaa79e', mat: 'concrete' };
  softShadow(g, [[0.15, 0.15, 0], [0.85, 0.15, 0], [0.85, 0.85, 0], [0.15, 0.85, 0]], 3, 0.35);
  const runs = joins(variant & 255);
  const back = runs.filter((d) => d[0] + d[1] < 0), side = runs.filter((d) => d[0] + d[1] === 0), front = runs.filter((d) => d[0] + d[1] > 0);
  const run = (d: [number, number]) => {
    prism(g, halfRun(d, 0.42), 0, 4, st, 'concrete', '#9a978e', 5);
    prism(g, halfRun(d, 0.2), 4, height - 4, st, 'concrete', '#9a978e', 7);
    if (HIGHTECH) razorWire(g, [0.5, 0.5], [0.5 + d[0] * 0.5, 0.5 + d[1] * 0.5], height);
  };
  for (const d of back) run(d);
  for (const d of side) run(d);
  // A post where runs meet, with a team reflector.
  prism(g, [[0.36, 0.36], [0.64, 0.36], [0.64, 0.64], [0.36, 0.64]], 0, height + 2, st, 'concrete', '#9a978e', 11);
  for (const d of front) run(d);
  cracks(g, (variant >> 8) & 3, height, rng);
}

/** Sandbag wall: three courses of bags along every joined direction. */
function sandbags(g: G, variant: number, rng: Rng): void {
  softShadow(g, [[0.2, 0.2, 0], [0.8, 0.2, 0], [0.8, 0.8, 0], [0.2, 0.8, 0]], 2.5, 0.3);
  const runs = joins(variant & 255);
  const c: [number, number] = [0.5, 0.5];
  for (const d of runs.filter((d) => d[0] + d[1] <= 0)) sandbagRun(g, c, [0.5 + d[0] * 0.5, 0.5 + d[1] * 0.5], 3);
  sandbagRun(g, [0.44, 0.5], [0.56, 0.5], 4);
  for (const d of runs.filter((d) => d[0] + d[1] > 0)) sandbagRun(g, c, [0.5 + d[0] * 0.5, 0.5 + d[1] * 0.5], 3);
  cracks(g, (variant >> 8) & 3, 12, rng);
}

/** Which way a gate's passage runs: across its wall line. */
function passageAlongY(variant: number): boolean {
  const m = variant & 255;
  return !!(m & 1 || m & 16) || !(m & 4 || m & 64);
}

/** Blast gate: a steel slider between concrete pylons under a gantry with a camera and a sign. */
function blastGate(g: G, variant: number, team: string, rng: Rng): void {
  const st: WallStyle = { base: HIGHTECH ? '#c3c1ba' : '#aaa79e', mat: 'concrete' };
  const open = !!(variant & (1 << 10)), locked = !!(variant & (1 << 11));
  boxShadow(g, 0.05, 0.05, 0.95, 0.95, 36);
  for (const d of joins(variant & 255)) prism(g, halfRun(d, 0.2), 0, 28, st, 'concrete', '#9a978e', 7);
  const alongY = passageAlongY(variant);
  const [a, b]: Array<[number, number]> = alongY ? [[0.1, 0.5], [0.9, 0.5]] : [[0.5, 0.1], [0.5, 0.9]];
  const pylon = ([x, y]: [number, number]) => slab(g, x - 0.1, y - 0.1, x + 0.1, y + 0.1, 34, st, {}, 'concrete', '#9a978e', 31);
  pylon(a);
  if (!open) {
    const pts: [number, number, number][] = [[a[0], a[1], 0.5], [b[0], b[1], 0.5], [b[0], b[1], 26], [a[0], a[1], 26]];
    poly3(g, pts, mat(g, 'metal', '#6b737b', 23));
    // Hazard band and a lock light.
    const q = (f: number, z: number): [number, number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, z];
    poly3(g, [q(0, 3), q(1, 3), q(1, 6), q(0, 6)], '#e8b51c', null);
    for (let k = 0; k < 6; k++) poly3(g, [q(k / 6, 3), q(k / 6 + 0.06, 3), q(k / 6 + 0.1, 6), q(k / 6 + 0.04, 6)], '#1d1f22', null);
    if (locked) {
      const [lx, ly] = P(...q(0.5, 16));
      g.fillStyle = '#ff3a2a';
      g.beginPath();
      g.arc(lx, ly, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  pylon(b);
  // Gantry beam with the owner's sign and a camera.
  line3(g, [a[0], a[1], 34], [b[0], b[1], 34], '#4b5258', 3);
  const [sx, sy] = P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 34);
  g.fillStyle = shadeColor(team, 0.9);
  g.fillRect(sx - 6, sy - 3, 12, 5);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(sx - 4, sy - 1, 8, 1);
  const [cx, cy] = P(a[0], a[1], 36);
  g.fillStyle = '#2b3036';
  g.fillRect(cx - 1, cy - 2, 4, 2);
  cracks(g, (variant >> 8) & 3, 30, rng);
}

/** Checkpoint: jersey barriers, a guard booth and a red-and-white boom (raised when open). */
function checkpoint(g: G, variant: number, team: string, rng: Rng): void {
  const open = !!(variant & (1 << 10)), locked = !!(variant & (1 << 11));
  sandbags(g, variant & 255, rng);
  const alongY = passageAlongY(variant);
  const [a, b]: Array<[number, number]> = alongY ? [[0.12, 0.5], [0.88, 0.5]] : [[0.5, 0.12], [0.5, 0.88]];
  // Guard booth at the near end.
  slab(g, a[0] - 0.12, a[1] - 0.12, a[0] + 0.12, a[1] + 0.12, 22, { base: '#e2e2dc', mat: 'metal' }, {
    left: (len) => band(g, 1, len - 1, 10, 7),
    right: (len) => band(g, 1, len - 1, 10, 7),
  }, 'metal', shadeColor(team, 0.9), 33);
  // Boom from the booth, striped red and white.
  const tip: [number, number, number] = open ? [a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15, 40] : [b[0], b[1], 10];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const f0 = k / n, f1 = (k + 1) / n;
    const p0: [number, number, number] = [a[0] + (tip[0] - a[0]) * f0, a[1] + (tip[1] - a[1]) * f0, 10 + (tip[2] - 10) * f0];
    const p1: [number, number, number] = [a[0] + (tip[0] - a[0]) * f1, a[1] + (tip[1] - a[1]) * f1, 10 + (tip[2] - 10) * f1];
    line3(g, p0, p1, k % 2 ? '#f2f2f2' : '#d63a2a', 1.6);
  }
  if (!open) post(g, b[0], b[1], 10, 1.4, '#9aa1a6');
  if (locked) {
    const [lx, ly] = P(a[0], a[1], 24);
    g.fillStyle = '#ff3a2a';
    g.beginPath();
    g.arc(lx, ly, 1.4, 0, Math.PI * 2);
    g.fill();
  }
}

/** Sentry tower, upgraded to a gun tower and then a missile turret. */
function tower(g: G, variant: number, team: string, rng: Rng): void {
  const level = (variant >> 12) & 3;
  const st: WallStyle = { base: HIGHTECH ? '#c3c1ba' : '#a7a49b', mat: 'concrete' };
  const h = [44, 56, 68][level];
  boxShadow(g, 0.12, 0.12, 0.88, 0.88, h + 18);
  if (level === 0) {
    // Steel legs, cross-braced, carrying a clad cabin with a machine gun.
    for (const [x, y] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]] as const) post(g, x, y, h - 12, 2, '#5b636b');
    line3(g, [0.22, 0.78, 4], [0.78, 0.78, h - 14], '#5b636b', 0.8);
    line3(g, [0.78, 0.22, 4], [0.78, 0.78, h - 14], '#5b636b', 0.8);
    sandbagRun(g, [0.15, 0.85], [0.85, 0.85], 2);
    at(g, h - 12, () => {
      slab(g, 0.1, 0.1, 0.9, 0.9, 14, CLAD, {
        left: (len) => band(g, 2, len - 2, 6, 5),
        right: (len) => band(g, 2, len - 2, 6, 5),
      }, 'metal', ROOF, 41);
    });
    line3(g, [0.9, 0.6, h - 4], [1.2, 0.75, h - 3], '#1d1f22', 1.4);
    flag(g, 0.2, 0.2, h + 2, team, 0.6);
    floodlight(g, 0.85, 0.15, h + 6);
  } else {
    // Concrete shaft with firing slits and a turret on top.
    slab(g, 0.14, 0.14, 0.86, 0.86, h, st, {
      left: (len, hh) => {
        rollDoor(g, len / 2, 7, 10);
        g.fillStyle = '#121519';
        for (const v of [hh * 0.5, hh * 0.75]) g.fillRect(len / 2 - 4, v, 8, 1.6);
      },
      right: (len, hh) => {
        g.fillStyle = '#121519';
        for (const v of [hh * 0.5, hh * 0.75]) g.fillRect(len / 2 - 4, v, 8, 1.6);
      },
    }, 'concrete', '#8e8b83', 41 + level);
    trim(g, 0.14, 0.14, 0.86, 0.86, h, team);
    at(g, h, () => {
      if (level === 1) {
        // Twin autocannon turret.
        slab(g, 0.28, 0.28, 0.72, 0.72, 9, DARK_METAL, {}, 'metal', '#6b737b', 45);
        line3(g, [0.72, 0.42, 5], [1.15, 0.5, 6], '#1d1f22', 1.6);
        line3(g, [0.72, 0.56, 5], [1.15, 0.64, 6], '#1d1f22', 1.6);
      } else {
        // Missile pod launcher with a radar panel.
        slab(g, 0.24, 0.24, 0.76, 0.76, 7, DARK_METAL, {}, 'metal', '#6b737b', 47);
        at(g, 7, () => {
          slab(g, 0.3, 0.32, 0.7, 0.68, 12, { base: shadeColor(team, 0.7), mat: 'metal' }, {
            left: (len) => {
              g.fillStyle = '#1d1f22';
              for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
                g.beginPath();
                g.arc(len * (0.25 + c * 0.25), 3.5 + r * 5, 1.5, 0, Math.PI * 2);
                g.fill();
              }
            },
          }, 'metal', '#6b737b', 49);
        });
        const [rx, ry] = P(0.3, 0.3, 26);
        g.fillStyle = '#d8dcde';
        g.fillRect(rx - 4, ry - 6, 8, 6);
      }
      flag(g, 0.2, 0.8, 4, team, 0.6);
    });
  }
  cracks(g, (variant >> 8) & 3, h, rng);
}

// ---------- naval ----------

/**
 * Naval dock: a concrete quay with bollards, a warehouse, a container stack
 * and a crane over the water. `side` (0 +x, 1 +y, 2 -x, 3 -y) is the water.
 */
function dock(g: G, n: number, team: string, side: number): void {
  apron(g, n, '#8d8f8c', 0.15);
  const m = n / 2;
  const quay = PANEL;
  // A concrete pier out over the water.
  const pier = (): void => {
    const [x0, y0, x1, y1] = side === 0 ? [n - 0.2, m - 0.4, n + 1.3, m + 0.4] : side === 1 ? [m - 0.4, n - 0.2, m + 0.4, n + 1.3] : side === 2 ? [-1.3, m - 0.4, 0.2, m + 0.4] : [m - 0.4, -1.3, m + 0.4, 0.2];
    for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0]] as const) post(g, x, y, 7, 3, '#7d7a72');
    slab(g, x0, y0, x1, y1, 6, quay, {}, 'concrete', '#9b9890', 71);
    for (const f of [0.25, 0.75]) {
      const [bx, by] = side % 2 === 0 ? [x0 + (x1 - x0) * f, y1 - 0.08] : [x1 - 0.08, y0 + (y1 - y0) * f];
      const [px, py] = P(bx, by, 6);
      g.fillStyle = '#2b3036';
      g.fillRect(px - 1.2, py - 3, 2.4, 3);
    }
  };
  if (side >= 2) pier();
  boxShadow(g, 0.1, 0.1, n - 0.1, n - 0.1, 10);
  slab(g, 0.1, 0.1, n - 0.1, n - 0.1, 5, quay, {}, 'concrete', '#a3a098', 73);
  at(g, 5, () => {
    // Warehouse on the landward half, its door toward the water.
    const land = (side + 2) % 4;
    const bx0 = land === 2 ? 0.2 : land === 0 ? n - 1.6 : 0.3, by0 = land === 3 ? 0.2 : land === 1 ? n - 1.6 : 0.3;
    const bx1 = land === 2 ? 1.6 : land === 0 ? n - 0.2 : n - 0.3, by1 = land === 3 ? 1.6 : land === 1 ? n - 0.2 : n - 0.3;
    box(g, bx0, by0, bx1, by1, 26, GLAZED ? PANEL : CLAD, {
      left: (len) => {
        rollDoor(g, len * 0.4, 12, 14);
        sign(g, len * 0.8, 17, 7, 6, team);
      },
      right: (len) => band(g, 3, len - 3, 18, 4),
    }, 75);
    gableRoof(g, bx0, by0, bx1, by1, 26, 10, { color: ROOF, kind: 'metal' }, side % 2 === 0 ? 'x' : 'y', 0.08, 77);
    // Containers and a dockside crane.
    const fx = side === 0 ? n - 1.1 : side === 2 ? 0.2 : 0.25, fy = side === 1 ? n - 0.65 : side === 3 ? 0.2 : n - 0.6;
    container(g, fx, fy, shadeColor(team, 0.75), true);
    container(g, fx, fy, '#b8562c', true, 0.95, 13);
    const cx = side === 0 ? n - 0.4 : side === 2 ? 0.4 : m + 0.6, cy = side === 1 ? n - 0.4 : side === 3 ? 0.4 : m + 0.6;
    post(g, cx, cy, 44, 3, '#d0661c');
    const ox = side === 0 ? 1.2 : side === 2 ? -1.2 : 0, oy = side === 1 ? 1.2 : side === 3 ? -1.2 : 0;
    line3(g, [cx - ox * 0.3, cy - oy * 0.3, 44], [cx + ox, cy + oy, 46], '#d0661c', 2.2);
    line3(g, [cx, cy, 30], [cx + ox * 0.55, cy + oy * 0.55, 44], '#b8561a', 1);
    line3(g, [cx + ox, cy + oy, 46], [cx + ox, cy + oy, 22], 'rgba(40,40,40,0.8)', 0.5);
    const [hx, hy] = P(cx + ox, cy + oy, 21);
    g.fillStyle = '#e8c22a';
    g.fillRect(hx - 2, hy - 2, 4, 3);
  });
  if (side < 2) pier();
  const [jx, jy] = side === 0 ? [n + 1.15, m - 0.3] : side === 1 ? [m - 0.3, n + 1.15] : side === 2 ? [-1.15, m - 0.3] : [m - 0.3, -1.15];
  flag(g, jx, jy, 6, team, 0.7);
}

/** Fish farm: a ring of floating walkways around a net pen, fish showing while it is stocked. */
function fishFarm(g: G, n: number, rng: Rng, stage: number): void {
  const R = n * 0.4, c = n / 2;
  onGround(g, 0, 0, () => {
    const W = n * 32;
    const grad = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W * 0.45);
    grad.addColorStop(0, 'rgba(10,40,60,0.45)');
    grad.addColorStop(1, 'rgba(10,40,60,0.1)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(W / 2, W / 2, R * 32, 0, Math.PI * 2);
    g.fill();
  });
  const fish = [0, 3, 7, 12][stage] ?? 0;
  for (let k = 0; k < fish; k++) {
    const a = rng.next() * Math.PI * 2, r = rng.next() * R * 0.75;
    const [x, y] = P(c + Math.cos(a) * r, c + Math.sin(a) * r, 0);
    g.fillStyle = 'rgba(210,225,230,0.85)';
    g.beginPath();
    g.ellipse(x, y, 2.2, 0.8, rng.next() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // The float ring: back half, then front half over the net.
  const ring = (front: boolean) => {
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const x = c + Math.cos(a) * R, y = c + Math.sin(a) * R;
      if ((x + y > n) !== front) continue;
      const [px, py] = P(x, y, 1.5);
      g.fillStyle = '#2a2f34';
      g.beginPath();
      g.ellipse(px, py, 3, 1.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(px - 2, py - 1.2, 3, 0.5);
    }
  };
  ring(false);
  // Hand-rail posts and the net hanging inside.
  g.strokeStyle = 'rgba(220,220,210,0.45)';
  g.lineWidth = 0.4;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const [x0, y0] = P(c + Math.cos(a) * R * 0.95, c + Math.sin(a) * R * 0.95, 8);
    const [x1, y1] = P(c + Math.cos(a) * R * 0.95, c + Math.sin(a) * R * 0.95, 1);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  ring(true);
  // A yellow feed buoy in the middle.
  const [bx, by] = P(c, c, 2);
  g.fillStyle = '#e8c22a';
  g.beginPath();
  g.ellipse(bx, by, 4, 2.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(bx - 0.6, by - 8, 1.2, 8);
  g.fillStyle = '#ff3a2a';
  g.beginPath();
  g.arc(bx, by - 8.5, 1.2, 0, Math.PI * 2);
  g.fill();
}

/** Launch complex: a pad, a red service tower, the rocket in the owner's colours, and fuel spheres. */
function launchComplex(g: G, n: number, team: string): void {
  apron(g, n, '#9a9a94', 0.3, 'concrete');
  boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 120);
  // The pad: a stepped concrete mound with the flame trench.
  slab(g, 0.4, 0.4, n - 0.4, n - 0.4, 8, PANEL, {}, 'concrete', '#a4a29b', 90);
  at(g, 8, () => {
    slab(g, 1.2, 1.2, n - 1.2, n - 1.2, 8, PANEL, {
      left: (len) => {
        g.fillStyle = '#16191c';
        g.fillRect(len / 2 - 10, 0, 20, 6);
      },
    }, 'concrete', '#a4a29b', 91);
  });
  // Fuel spheres and tanks in the corner.
  silo(g, 0.8, n - 0.9, 0.32, 18, '#e8e9e6');
  silo(g, n - 0.9, 0.8, 0.32, 18, '#e8e9e6');
  // Service tower: a red lattice with access arms.
  const tx = 1.55, ty = 1.55, z0 = 16, th = 150;
  for (const [x, y] of [[tx - 0.25, ty - 0.25], [tx + 0.25, ty - 0.25], [tx - 0.25, ty + 0.25], [tx + 0.25, ty + 0.25]] as const) line3(g, [x, y, z0], [x, y, z0 + th], '#b8341f', 1.6);
  for (let z = z0; z < z0 + th; z += 12) {
    line3(g, [tx - 0.25, ty + 0.25, z], [tx + 0.25, ty + 0.25, z + 12], '#c84a2a', 0.6);
    line3(g, [tx + 0.25, ty - 0.25, z], [tx + 0.25, ty + 0.25, z + 12], '#c84a2a', 0.6);
    line3(g, [tx - 0.25, ty + 0.25, z], [tx + 0.25, ty + 0.25, z], '#c84a2a', 0.6);
  }
  for (const z of [70, 120]) line3(g, [tx + 0.25, ty + 0.25, z0 + z], [n / 2 - 0.15, n / 2 - 0.15, z0 + z], '#9a9a94', 1.6);
  // The rocket: white body, team bands, a black interstage and a nose cone.
  const [cx, cy] = P(n / 2, n / 2, z0);
  const R = 9, H = 140;
  const body = g.createLinearGradient(cx - R, 0, cx + R, 0);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.45, '#eef0f0');
  body.addColorStop(1, '#a7adb0');
  // Boosters either side.
  for (const sx of [-1, 1]) {
    const bx = cx + sx * (R + 3.5);
    const bg = g.createLinearGradient(bx - 3.5, 0, bx + 3.5, 0);
    bg.addColorStop(0, '#f4f4f2');
    bg.addColorStop(1, '#9aa1a4');
    g.fillStyle = bg;
    g.fillRect(bx - 3.5, cy - 70 * ZK, 7, 70 * ZK);
    g.beginPath();
    g.moveTo(bx - 3.5, cy - 70 * ZK);
    g.quadraticCurveTo(bx, cy - 82 * ZK, bx + 3.5, cy - 70 * ZK);
    g.fill();
  }
  g.fillStyle = body;
  g.fillRect(cx - R, cy - H * ZK, R * 2, H * ZK);
  g.fillStyle = shadeColor(team, 1.0);
  g.fillRect(cx - R, cy - 30 * ZK, R * 2, 7 * ZK);
  g.fillRect(cx - R, cy - 100 * ZK, R * 2, 4 * ZK);
  g.fillStyle = '#1d1f22';
  g.fillRect(cx - R, cy - 108 * ZK, R * 2, 5 * ZK);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(cx - R, cy - H * ZK);
  g.bezierCurveTo(cx - R, cy - (H + 18) * ZK, cx - 2, cy - (H + 26) * ZK, cx, cy - (H + 28) * ZK);
  g.bezierCurveTo(cx + 2, cy - (H + 26) * ZK, cx + R, cy - (H + 18) * ZK, cx + R, cy - H * ZK);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(cx - R + 2, cy - 64 * ZK, 1.2, 30 * ZK);
  // Engine bells under the pad lip.
  g.fillStyle = '#3a3f44';
  for (const dx of [-5, 0, 5]) g.fillRect(cx + dx - 1.8, cy - 2, 3.6, 4);
  flag(g, n - 0.55, n - 0.55, 8, team, 1.1);
  floodlight(g, 0.5, n / 2, 40);
  floodlight(g, n / 2, 0.5, 40);
}

// ---------- the buildings ----------

const PAINTERS: Record<BuildingType, Painter> = {
  wonder: (g, n, team) => launchComplex(g, n, team),
  dock: (g, n, team, _rng, variant) => dock(g, n, team, variant & 3),
  fish_trap: (g, n, _team, rng, variant) => fishFarm(g, n, rng, variant),
  town_center: (g, n, team) => {
    apron(g, n, '#7d7f7c', 0.35);
    lines(g, [[0.4, n - 0.15, 1.4, n - 0.15], [n - 0.15, 0.6, n - 0.15, 1.6]]);
    helipad(g, n - 0.85, n - 0.85, 0.6);
    boxShadow(g, 0.3, 0.3, n - 1.4, n - 0.4, 90);
    // Two-storey command block.
    slab(g, 0.3, 0.3, n - 1.4, n - 0.4, 30, CLAD, {
      left: (len) => {
        glassDoor(g, len * 0.5, 9, 11);
        band(g, 3, len * 0.5 - 7, 6, 6, true);
        band(g, len * 0.5 + 7, len - 3, 6, 6, true);
        band(g, 3, len - 3, 19, 6, true);
        sign(g, len * 0.5, 13.5, 10, 4, team);
      },
      right: (len) => {
        band(g, 3, len - 3, 6, 6);
        band(g, 3, len - 3, 19, 6, true);
      },
    }, 'membrane', ROOF, 31);
    trim(g, 0.3, 0.3, n - 1.4, n - 0.4, 30, team);
    // East wing, lower.
    slab(g, n - 1.4, 0.5, n - 0.3, 2.0, 18, GLAZED ? GLASS : CLAD, {
      left: (len) => rollDoor(g, len / 2, len - 6, 12),
      right: (len) => band(g, 2, len - 2, 8, 5),
    }, 'membrane', ROOF, 33);
    // Control tower rising through the roof, glass cab on top.
    const t0 = 0.8, t1 = 1.6;
    at(g, 30, () => {
      slab(g, t0, t0, t1, t1, 34, PANEL, { left: (len, hh) => band(g, len / 2 - 2, len / 2 + 2, 4, hh - 8), right: (len, hh) => band(g, len / 2 - 2, len / 2 + 2, 4, hh - 8) }, 'concrete', '#9a978e', 35);
      at(g, 34, () => {
        slab(g, t0 - 0.12, t0 - 0.12, t1 + 0.12, t1 + 0.12, 12, GLASS, {}, 'metal', '#3f454c', 37);
        trim(g, t0 - 0.12, t0 - 0.12, t1 + 0.12, t1 + 0.12, 12, team);
        mast(g, (t0 + t1) / 2, (t0 + t1) / 2, 12, 34, team);
      });
      hvac(g, 2.0, 0.6, 0);
      hvac(g, 2.0, 1.3, 0);
      if (HIGHTECH) solar(g, 0.5, 2.0, n - 1.6, n - 0.5, 0);
      else dish(g, ...P(1.2, 2.8, 6), 5, 1);
    });
    flag(g, 0.4, n - 0.25, 0, team, 1.1);
    flag(g, 1.0, n - 0.25, 0, team, 1.1);
  },
  house: (g, n, team) => {
    apron(g, n, '#8a8b86', 0.15, 'concrete');
    if (!GLAZED) {
      // A container home: corrugated box, door, window, AC unit and a water tank.
      boxShadow(g, 0.25, 0.4, n - 0.25, n - 0.5, 30);
      slab(g, 0.25, 0.4, n - 0.25, n - 0.5, 20, { base: CLAD.mat === 'metal' ? '#a6a08a' : '#b3afa4', mat: CLAD.mat === 'metal' ? 'metal' : 'concrete' }, {
        left: (len) => {
          glassDoor(g, len * 0.3, 5, 10);
          band(g, len * 0.55, len * 0.85, 7, 5, true);
          sign(g, len * 0.3, 13, 5, 2.5, team);
        },
        right: (len) => band(g, len * 0.3, len * 0.7, 7, 5),
      }, 'metal', ROOF, 61);
      hvac(g, n - 0.75, 0.6, 20, 0.28);
      silo(g, 0.55, 0.7, 0.14, 0, '#2b3036', false);
      at(g, 20, () => silo(g, 0.55, 0.75, 0.13, 8, '#3a4048'));
      return;
    }
    // A modern townhouse: two stacked, offset volumes with a glass corner and a solar roof.
    boxShadow(g, 0.2, 0.2, n - 0.2, n - 0.2, 46);
    slab(g, 0.2, 0.3, n - 0.2, n - 0.2, 18, CLAD, {
      left: (len) => {
        glassDoor(g, len * 0.25, 5, 10);
        band(g, len * 0.45, len - 2, 3, 12, true);
      },
      right: (len) => band(g, 3, len - 6, 6, 8),
    }, 'membrane', ROOF, 63);
    at(g, 18, () => {
      slab(g, 0.2, 0.2, n - 0.6, n - 0.35, 16, { base: shadeColor(team, 0.55), mat: 'metal' }, {
        left: (len) => band(g, 3, len - 3, 4, 8, true),
        right: (len) => band(g, 3, len - 3, 4, 8),
      }, 'membrane', ROOF, 65);
      if (HIGHTECH) solar(g, 0.3, 0.3, n - 0.7, n - 0.45, 16);
      else hvac(g, 0.5, 0.5, 16, 0.28);
    });
  },
  lumber_camp: (g, n, team, rng) => {
    apron(g, n, '#7a6e5a', 0.2, 'earth');
    // An open-sided saw shed with a metal roof, log stacks and sawn timber.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.55, 36);
    for (const [x, y] of [[0.2, 0.2], [n - 0.2, 0.2], [0.2, n * 0.55], [n - 0.2, n * 0.55]] as const) post(g, x, y, 24, 2.2, '#5b636b');
    slab(g, 0.25, 0.25, n - 0.25, 0.55, 22, CLAD, {}, 'metal', ROOF, 51);
    // The band saw table under the shed.
    slab(g, 0.6, 0.65, n - 0.6, 0.9, 7, METAL, {}, 'metal', '#a9b0b5', 53);
    const [sx, sy] = P(n / 2, 0.78, 12);
    g.fillStyle = '#d0661c';
    g.fillRect(sx - 3, sy - 8, 6, 8);
    gableRoof(g, 0.1, 0.1, n - 0.1, n * 0.6, 24, 6, { color: ROOF, kind: 'metal', trim: team }, 'x', 0.06, 55);
    logs(g, 0.25, n - 0.25, 3, 5);
    // Sawn planks on a pallet.
    slab(g, n - 0.85, n - 0.75, n - 0.2, n - 0.3, 6, { base: '#c79c62', mat: 'planks' }, {}, 'planks', '#d9b27a', 57);
    heap(g, n - 0.5, n * 0.68, '#a07040', rng, 0.5);
  },
  mining_camp: (g, n, team, rng) => {
    apron(g, n, '#7d766a', 0.2, 'earth');
    // A clad shed, a hopper on legs with a conveyor, ore heaps and drums.
    boxShadow(g, 0.2, 0.2, 1.1, n - 0.3, 30);
    slab(g, 0.2, 0.2, 1.1, n - 0.3, 22, CLAD, {
      left: (len) => rollDoor(g, len / 2, len - 6, 13),
      right: (len) => {
        rollDoor(g, len * 0.35, 9, 13);
        sign(g, len * 0.8, 15, 5, 4, team);
      },
    }, 'metal', ROOF, 51);
    for (const [x, y] of [[1.35, 0.3], [1.75, 0.3], [1.35, 0.7], [1.75, 0.7]] as const) post(g, x, y, 22, 1.4, '#5b636b');
    at(g, 22, () => slab(g, 1.3, 0.25, 1.8, 0.75, 10, { base: '#d0a21c', mat: 'metal' }, {}, 'metal', '#bf931a', 53));
    line3(g, [1.55, 0.75, 26], [1.55, n - 0.35, 3], '#2b3036', 2.2);
    heap(g, 1.5, n - 0.45, '#8e8a84', rng, 0.8);
    heap(g, 0.6, n - 0.1, '#c9a43a', rng, 0.45);
  },
  mill: (g, n, team) => {
    apron(g, n, '#8a8b86', 0.2, 'concrete');
    // Food depot: two grain silos and a refrigerated store.
    boxShadow(g, 0.15, 1.05, n - 0.15, n - 0.15, 26);
    slab(g, 0.15, 1.05, n - 0.15, n - 0.15, 18, GLAZED ? PANEL : CLAD, {
      left: (len) => {
        rollDoor(g, len * 0.35, 10, 12);
        sign(g, len * 0.8, 10, 6, 5, team);
      },
      right: (len) => band(g, 2, len - 2, 11, 3),
    }, 'membrane', ROOF, 41);
    hvac(g, 0.5, 1.3, 18, 0.28);
    silo(g, 0.55, 0.55, 0.36, 46, '#d6d8d6');
    silo(g, 1.45, 0.55, 0.36, 46, '#d6d8d6');
    const [lx, ly] = P(1.0, 0.25, 50);
    g.fillStyle = shadeColor(team, 0.9);
    g.fillRect(lx - 14, ly - 1, 28, 2);
  },
  barracks: (g, n, team) => {
    apron(g, n, '#7b7d79', 0.25);
    lines(g, [[0.3, n - 0.3, n - 0.3, n - 0.3]], 'rgba(240,220,90,0.7)');
    boxShadow(g, 0.2, 0.2, n - 0.2, n - 1.0, 54);
    slab(g, 0.2, 0.2, n - 0.2, n - 1.0, 36, CLAD, {
      left: (len) => {
        glassDoor(g, len * 0.5, 8, 11);
        windows(g, len, 5, 6, 12);
        band(g, 3, len - 3, 22, 6, true);
        sign(g, len * 0.5, 15, 10, 4, team);
      },
      right: (len) => {
        windows(g, len, 5, 6, 9);
        band(g, 3, len - 3, 22, 6);
      },
    }, 'membrane', ROOF, 41);
    trim(g, 0.2, 0.2, n - 0.2, n - 1.0, 36, team);
    hvac(g, 0.5, 0.5, 36);
    hvac(g, 1.6, 0.5, 36);
    if (HIGHTECH) solar(g, 0.4, 1.0, n - 0.4, n - 1.2, 36);
    sandbagRun(g, [0.3, n - 0.55], [1.2, n - 0.55], 2);
    flag(g, n - 0.35, n - 0.4, 0, team, 1);
    floodlight(g, 0.25, n - 0.25, 34);
  },
  farm: (g, n, _team, rng, stage) => {
    // Irrigated field: ridged rows and a pivot boom; the crop thins as it is harvested.
    onGround(g, 0, 0, () => {
      const W = n * 32;
      g.fillStyle = mat(g, 'earth', '#6e5232', 81);
      g.fillRect(0, 0, W, W);
      for (let v = 2; v < W - 1; v += 3.2) {
        const ridge = g.createLinearGradient(0, v, 0, v + 3.2);
        ridge.addColorStop(0, 'rgba(230,190,140,0.28)');
        ridge.addColorStop(0.45, 'rgba(0,0,0,0)');
        ridge.addColorStop(1, 'rgba(30,18,6,0.45)');
        g.fillStyle = ridge;
        g.fillRect(1, v, W - 2, 3.2);
      }
      g.strokeStyle = 'rgba(90,110,40,0.55)';
      g.lineWidth = 1.6;
      g.strokeRect(0.8, 0.8, W - 1.6, W - 1.6);
    });
    stage = Math.max(0, Math.min(3, stage));
    const ripe = ['#6f8a34', '#a9a03c', '#cfae45', '#e2c155'][stage];
    const tip = ['#8fae48', '#d9c35c', '#f0d478', '#fbe08e'][stage];
    const fill = [0.12, 0.45, 0.75, 1][stage];
    for (let y = 0.12; y < n - 0.08; y += 0.1)
      for (let x = 0.08; x < n - 0.06; x += 0.085) {
        if (rng.next() > fill) continue;
        const [sx, sy] = P(x + (rng.next() - 0.5) * 0.03, y, 0);
        const h = 3 + stage * 2.2 + rng.next() * 2.2;
        const lean = (rng.next() - 0.35) * 1.8;
        g.strokeStyle = shadeColor(ripe, 0.75 + rng.next() * 0.4);
        g.lineWidth = 0.55;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + lean * 0.3, sy - h * 0.6, sx + lean, sy - h);
        g.stroke();
        if (stage > 0) {
          g.fillStyle = shadeColor(tip, 0.85 + rng.next() * 0.3);
          g.beginPath();
          g.ellipse(sx + lean, sy - h - 1, 0.65, 1.5, lean * 0.15, 0, Math.PI * 2);
          g.fill();
        }
      }
    // Pivot irrigation: a pipe truss on wheeled towers across the field.
    const z = 16;
    for (const f of [0.15, 0.5, 0.85]) {
      const x = n * f, y = n / 2;
      line3(g, [x - 0.12, y, 0], [x, y, z], '#9aa1a6', 0.9);
      line3(g, [x + 0.12, y, 0], [x, y, z], '#9aa1a6', 0.9);
      const [wx, wy] = P(x, y, 1.5);
      g.fillStyle = '#1d1f22';
      g.beginPath();
      g.ellipse(wx, wy, 2.4, 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    line3(g, [0.1, n / 2, z], [n - 0.1, n / 2, z], '#c0c6ca', 1.4);
    for (let f = 0.1; f < 0.95; f += 0.1) line3(g, [n * f, n / 2, z], [n * f, n / 2, z - 5], 'rgba(170,200,220,0.6)', 0.4);
  },
  archery_range: (g, n, team) => {
    apron(g, n, '#7f7a6a', 0.2, 'earth');
    // Firing range: a covered firing line at the back, lanes and target boards, a berm.
    lines(g, [[0.8, 1.2, 0.8, n - 0.2], [1.5, 1.2, 1.5, n - 0.2], [2.2, 1.2, 2.2, n - 0.2]], 'rgba(240,240,230,0.5)');
    boxShadow(g, 0.2, 0.2, n - 0.2, 1.0, 34);
    for (const [x, y] of [[0.2, 1.0], [n - 0.2, 1.0], [n / 2, 1.0]] as const) post(g, x, y, 20, 1.8, '#5b636b');
    slab(g, 0.2, 0.2, n - 0.2, 0.55, 22, CLAD, {
      left: (len) => {
        rollDoor(g, len * 0.2, 7, 11);
        sign(g, len * 0.6, 13, 8, 5, team);
      },
    }, 'metal', ROOF, 51);
    gableRoof(g, 0.15, 0.15, n - 0.15, 1.05, 22, 4, { color: ROOF, kind: 'metal', trim: team }, 'x', 0.05, 53);
    // Target boards with rings on posts, and a sandbag berm behind them.
    sandbagRun(g, [0.3, n - 0.12], [n - 0.3, n - 0.12], 2, '#a99a72');
    for (const x of [0.8, 1.5, 2.2]) {
      post(g, x, n - 0.4, 12, 1, '#7b838a');
      const [tx, ty] = P(x, n - 0.4, 12);
      g.fillStyle = '#f2f0ea';
      g.fillRect(tx - 4, ty - 2, 8, 8);
      g.strokeStyle = '#1d1f22';
      g.lineWidth = 0.6;
      for (const r of [3, 1.8, 0.7]) {
        g.beginPath();
        g.arc(tx, ty + 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
  },
  stable: (g, n, team) => {
    apron(g, n, '#72746f', 0.25);
    lines(g, [[0.4, n - 0.2, n - 0.4, n - 0.2]], 'rgba(240,220,90,0.7)');
    // Motor pool: a big garage with three bays, a fuel tank and a parked buggy.
    boxShadow(g, 0.2, 0.2, n - 0.2, n - 0.8, 40);
    box(g, 0.2, 0.2, n - 0.2, n - 0.8, 28, CLAD, {
      left: (len) => {
        for (const f of [0.2, 0.5, 0.8]) rollDoor(g, len * f, len * 0.24, 17, f === 0.5);
        sign(g, len * 0.5, 21, 9, 4.5, team);
      },
      right: (len) => band(g, 3, len - 3, 20, 4),
    }, 41);
    gableRoof(g, 0.15, 0.15, n - 0.15, n - 0.75, 28, 9, { color: ROOF, kind: 'metal' }, 'x', 0.06, 43);
    silo(g, n - 0.4, n - 0.35, 0.18, 10, '#c9c7c0', false);
    floodlight(g, 0.25, n - 0.4, 30);
  },
  monastery: (g, n, team) => {
    apron(g, n, '#7f817e', 0.25);
    // Intel HQ: a dark glass block behind a security fence, a radar dome and an antenna array.
    boxShadow(g, 0.3, 0.3, n - 0.6, n - 0.6, 56);
    slab(g, 0.3, 0.3, n - 0.6, n - 0.6, 40, { base: '#36576e', mat: 'glass' }, {
      left: (len) => {
        glassDoor(g, len * 0.5, 8, 10);
        sign(g, len * 0.5, 30, 9, 5, team);
      },
    }, 'membrane', '#3f454c', 41);
    trim(g, 0.3, 0.3, n - 0.6, n - 0.6, 40, team);
    at(g, 40, () => {
      radome(g, 1.0, 1.0, 0, 0.34);
      mast(g, 1.8, 0.7, 0, 30, team);
      hvac(g, 1.6, 1.5, 0, 0.28);
    });
    fence(g, [0.1, n - 0.15], [n - 0.15, n - 0.15], 8);
    fence(g, [n - 0.15, 0.1], [n - 0.15, n - 0.15], 8);
  },
  blacksmith: (g, n, team) => {
    apron(g, n, '#7b7d79', 0.25);
    // Armory: an earth-bermed concrete bunker with a blast door and ammo crates.
    boxShadow(g, 0.25, 0.25, n - 0.25, n - 0.6, 30);
    slab(g, 0.25, 0.25, n - 0.25, n - 0.6, 24, { base: '#8f9086', mat: 'concrete' }, {
      left: (len) => {
        g.fillStyle = '#4b5258';
        g.fillRect(len / 2 - 9, 0, 18, 15);
        g.fillStyle = mat(g, 'metal', '#6f7880', 62);
        g.fillRect(len / 2 - 8, 0, 16, 14);
        hazard(g, len / 2 - 9, len / 2 + 9, 15, 2);
        sign(g, len * 0.85, 12, 6, 5, team);
      },
      right: (len) => hazard(g, 0, len, 20, 1.5),
    }, 'earth', '#6f7a3e', 41);
    for (const [x, y] of [[0.5, 0.5], [1.4, 0.6]] as const) hvac(g, x, y, 24, 0.3);
    for (let k = 0; k < 3; k++) slab(g, 0.3 + k * 0.32, n - 0.45, 0.58 + k * 0.32, n - 0.2, 6, { base: '#5d6344', mat: 'metal' }, {}, 'metal', '#6b7150', 70 + k);
    at(g, 6, () => slab(g, 0.46, n - 0.45, 0.74, n - 0.2, 6, { base: '#5d6344', mat: 'metal' }, {}, 'metal', '#6b7150', 74));
    floodlight(g, n - 0.25, n - 0.3, 30);
  },
  market: (g, n, team) => {
    apron(g, n, '#9a9a94', 0.25, 'concrete');
    // Exchange: a glass pavilion under a cantilevered roof, with a live ticker.
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 34);
    slab(g, 0.4, 0.4, n - 0.5, n - 0.5, 24, GLASS, {
      left: (len) => {
        glassDoor(g, len / 2, 8, 11);
        g.fillStyle = '#0b1218';
        g.fillRect(4, 15, len - 8, 4);
        g.fillStyle = '#4ae06a';
        for (let u = 6; u < len - 8; u += 5) g.fillRect(u, 16.2, 3, 1.6);
        g.fillStyle = '#ff5a4a';
        for (let u = 8.5; u < len - 8; u += 15) g.fillRect(u, 16.2, 2, 1.6);
      },
    }, 'membrane', ROOF, 41);
    at(g, 24, () => slab(g, 0.2, 0.2, n - 0.2, n - 0.2, 4, { base: '#e2e3e1', mat: 'concrete' }, {}, 'membrane', '#d5d6d3', 43));
    trim(g, 0.2, 0.2, n - 0.2, n - 0.2, 28, team);
    for (const [x, y] of [[0.3, n - 0.3], [n - 0.3, n - 0.3], [n - 0.3, 0.3]] as const) post(g, x, y, 24, 1.4, '#c9cdd0');
    container(g, 0.25, n - 0.15, shadeColor(team, 0.8), true, 0.8);
    flag(g, n - 0.25, n - 0.15, 0, team, 1);
  },
  university: (g, n, team) => {
    apron(g, n, '#9a9a94', 0.25, 'concrete');
    // Research lab: a white block with a glass atrium, a telescope dome and a wind turbine.
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 46);
    slab(g, 0.3, 0.3, n - 0.3, n - 0.3, 26, { base: '#e6e7e4', mat: 'concrete' }, {
      left: (len) => {
        glassDoor(g, len * 0.3, 8, 10);
        band(g, len * 0.45, len - 3, 4, 18, true);
        sign(g, len * 0.3, 16, 8, 4, team);
      },
      right: (len) => {
        band(g, 3, len - 3, 6, 5);
        band(g, 3, len - 3, 16, 5);
      },
    }, 'membrane', ROOF, 41);
    trim(g, 0.3, 0.3, n - 0.3, n - 0.3, 26, team);
    at(g, 26, () => {
      radome(g, 0.9, 0.9, 0, 0.3);
      if (HIGHTECH || GLAZED) solar(g, 1.4, 0.5, n - 0.5, n - 0.5, 0);
      else hvac(g, 1.6, 1.2, 0);
    });
    // Wind turbine at the back corner.
    const [tx, ty] = P(n - 0.25, 0.25, 0), [hx, hy] = P(n - 0.25, 0.25, 90);
    g.fillStyle = '#eef0f0';
    g.beginPath();
    g.moveTo(tx - 1.6, ty);
    g.lineTo(hx - 0.6, hy);
    g.lineTo(hx + 0.6, hy);
    g.lineTo(tx + 1.6, ty);
    g.closePath();
    g.fill();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      g.strokeStyle = '#f4f6f6';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(hx + Math.cos(a) * 26, hy + Math.sin(a) * 26);
      g.stroke();
    }
    g.fillStyle = '#d8dcde';
    g.fillRect(hx - 2, hy - 2, 5, 3.5);
  },
  palisade_wall: (g, _n, _team, rng, v) => sandbags(g, v, rng),
  palisade_gate: (g, _n, team, rng, v) => checkpoint(g, v, team, rng),
  stone_wall: (g, _n, _team, rng, v) => concreteWall(g, v, rng),
  gate: (g, _n, team, rng, v) => blastGate(g, v, team, rng),
  watch_tower: (g, _n, team, rng, v) => tower(g, v, team, rng),
  castle: (g, n, team) => {
    // Fortress: sloped concrete bastion walls, corner bunkers, a command bunker and a radar dome.
    apron(g, n, '#7b7c76', 0.35, 'concrete');
    boxShadow(g, 0.1, 0.1, n - 0.1, n - 0.1, 70);
    const wall: WallStyle = { base: HIGHTECH ? '#c0beb6' : '#9f9c93', mat: 'concrete' };
    slab(g, 0.15, 0.15, n - 0.15, n - 0.15, 10, wall, {}, 'concrete', '#8e8b83', 30);
    at(g, 10, () => {
      slab(g, 0.3, 0.3, n - 0.3, n - 0.3, 22, wall, {
        left: (len) => {
          g.fillStyle = '#4b5258';
          g.fillRect(len / 2 - 10, -10, 20, 20);
          g.fillStyle = mat(g, 'metal', '#6f7880', 62);
          g.fillRect(len / 2 - 9, -10, 18, 19);
          hazard(g, len / 2 - 10, len / 2 + 10, 9, 2);
          g.fillStyle = '#121519';
          for (const u of [len * 0.15, len * 0.3, len * 0.7, len * 0.85]) g.fillRect(u - 3, 14, 6, 1.6);
          sign(g, len / 2, 13, 12, 5, team);
        },
        right: (len) => {
          g.fillStyle = '#121519';
          for (const u of [len * 0.2, len * 0.4, len * 0.6, len * 0.8]) g.fillRect(u - 3, 14, 6, 1.6);
        },
      }, 'concrete', '#8a877f', 31);
      // Corner bunkers with gun slits.
      for (const [x, y] of [[0.15, 0.15], [n - 0.85, 0.15], [0.15, n - 0.85], [n - 0.85, n - 0.85]] as const)
        slab(g, x, y, x + 0.7, y + 0.7, 30, wall, {
          left: (len) => {
            g.fillStyle = '#121519';
            g.fillRect(len / 2 - 5, 20, 10, 2);
          },
          right: (len) => {
            g.fillStyle = '#121519';
            g.fillRect(len / 2 - 5, 20, 10, 2);
          },
        }, 'concrete', '#8a877f', 33);
      at(g, 22, () => {
        // Command bunker, helipad and radar on the roof.
        slab(g, 1.2, 1.0, 2.6, 2.2, 18, wall, {
          left: (len) => band(g, 3, len - 3, 8, 5, true),
          right: (len) => band(g, 3, len - 3, 8, 5),
        }, 'membrane', ROOF, 35);
        trim(g, 1.2, 1.0, 2.6, 2.2, 18, team);
        at(g, 18, () => {
          radome(g, 1.6, 1.4, 0, 0.32);
          mast(g, 2.3, 1.2, 0, 34, team);
        });
        helipad(g, 2.95, 2.95, 0.4);
      });
      if (HIGHTECH) for (const [a, b] of [[[0.3, n - 0.3], [n - 0.3, n - 0.3]], [[n - 0.3, 0.3], [n - 0.3, n - 0.3]]] as const) razorWire(g, a as [number, number], b as [number, number], 22);
      flag(g, 0.5, 0.5, 30, team, 1.1);
      flag(g, n - 0.5, n - 0.5, 30, team, 1.1);
    });
  },
  siege_workshop: (g, n, team) => {
    apron(g, n, '#72746f', 0.25);
    // Vehicle factory: a tall hall with a sawtooth roof, a big door, stacks and a gantry crane outside.
    boxShadow(g, 0.2, 0.2, n - 0.2, n - 0.7, 70);
    box(g, 0.2, 0.2, n - 0.2, n - 0.7, 36, CLAD, {
      left: (len) => {
        rollDoor(g, len * 0.45, len * 0.5, 24);
        sign(g, len * 0.85, 26, 7, 6, team);
        hazard(g, len * 0.2, len * 0.7, 24, 1.5);
      },
      right: (len) => band(g, 3, len - 3, 28, 4),
    }, 41);
    // Sawtooth roof: north lights along x.
    for (let k = 0; k < 4; k++) {
      const y0 = 0.2 + ((n - 0.9) * k) / 4, y1 = 0.2 + ((n - 0.9) * (k + 1)) / 4;
      poly3(g, [[0.2, y0, 36], [n - 0.2, y0, 36], [n - 0.2, y0, 44], [0.2, y0, 44]], '#3f5a70');
      poly3(g, [[0.2, y0, 44], [n - 0.2, y0, 44], [n - 0.2, y1, 36], [0.2, y1, 36]], mat(g, 'metal', ROOF, 45));
    }
    for (const x of [0.5, 0.85]) silo(g, x, 0.4, 0.09, 66, '#8d949a', false);
    // Gantry crane over the yard.
    const y = n - 0.35;
    post(g, 0.25, y, 30, 2, '#e8b51c');
    post(g, n - 0.25, y, 30, 2, '#e8b51c');
    line3(g, [0.25, y, 30], [n - 0.25, y, 30], '#e8b51c', 2.6);
    const [hx, hy] = P(n * 0.6, y, 29);
    g.strokeStyle = '#2b3036';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(hx, hy + 12);
    g.stroke();
    g.fillStyle = '#2b3036';
    g.fillRect(hx - 2, hy + 12, 4, 3);
  },
};

export class BuildingSprites {
  /** Memory allowed for one zoom level's building sprites. */
  private readonly cache = new SpriteCache(56 * 1024 * 1024);

  /** `tw`: device px across one tile diamond. */
  constructor(readonly tw: number) {}

  get(type: BuildingType, size: number, player: number, variant = 0, age = 0): Sprite {
    return this.cache.get(`${type}|${player}|${variant}|${age}`, () => cropSprite(this.render(type, size, player, variant, age)));
  }

  /** Releases every cached sprite. */
  dispose(): void {
    this.cache.clear();
  }

  private render(type: BuildingType, n: number, player: number, variant: number, age: number): Sprite {
    const k = this.tw / 64;
    const halfW = n * 32 + PAD;
    const c = document.createElement('canvas');
    c.width = Math.ceil(halfW * 2 * k);
    c.height = Math.ceil((RISE + n * 32 + PAD) * k);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.scale(k, k);
    g.translate(halfW, RISE);
    setScale(k);
    style(age);
    BANNER = BANNERS[player] ?? 'square';
    PAINTERS[type](g, n, PLAYER_COLORS[player % PLAYER_COLORS.length], new Rng(n * 31 + type.length), variant);
    grade(c, 0.04, n * 97 + variant);
    // Anchor = footprint's north corner.
    return { c, ax: halfW * k, ay: RISE * k };
  }
}
