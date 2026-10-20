// Isometric buildings, modelled with the iso3d toolkit and rendered once per zoom
// level, player colour and variant. Age I style: timber, plaster, thatch and canvas.
import type { BuildingType } from '../sim/entities';
import { Rng } from '../sim/rng';
import { type G, P, ZK, box, boxShadow, boxTop, crenels, doorAt, gableRoof, hipRoof, line3, log, mat, onGround, poly3, post, prism, setScale, shadeColor, softShadow, windowAt } from './iso3d';
import { grade } from './materials';
import { PLAYER_COLORS } from './palette';
import { type Sprite, SpriteCache, cropSprite } from './sprites';

/** n: footprint in tiles; variant: building-specific state, e.g. a farm's crop stage (0 bare .. 3 ripe). */
type Painter = (g: G, n: number, team: string, rng: Rng, variant: number) => void;

/** Units of structure drawn above the footprint's north corner. */
const RISE = 240;
const PAD = 26;

// Materials by age: the town is restyled as it advances, thatch and wattle giving
// way to timber and shingle, then a stone ground storey under clay tile, then
// dressed stone under slate. Set by style() before each sprite is painted.
type Wall = { base: string; frame?: string | null; plinth?: number; mat?: 'plaster' | 'stone' | 'planks' };
type Roof = { color: string; kind: 'thatch' | 'shingle' | 'canvas'; trim?: string };
let PLASTER: Wall = { base: '#d3c39f', frame: '#4a3019', plinth: 3 };
let STONE: Wall = { base: '#9a958b', mat: 'stone' };
let THATCH: Roof = { color: '#bf9f55', kind: 'thatch' };
let SHINGLE: Roof = { color: '#8a6a48', kind: 'shingle' };
/** Gilded finials and trims in the last age. */
let ORNATE = false;
/** Banner and flag cut for the player being painted (their faction's). */
type BannerCut = 'swallowtail' | 'pennant' | 'square' | 'tongued';
let BANNER: BannerCut = 'swallowtail';
const BANNERS: BannerCut[] = [];

/** Each player's banner cut, from their faction (set at the start of a match). */
export function setBanners(cuts: Array<string | undefined>): void {
  BANNERS.length = 0;
  for (const c of cuts) BANNERS.push((c as BannerCut) ?? 'swallowtail');
}

function style(age: number): void {
  ORNATE = age >= 3;
  STONE = { base: age >= 3 ? '#b8b1a2' : '#9a958b', mat: 'stone' };
  if (age === 0) {
    PLASTER = { base: '#d3c39f', frame: '#4a3019', plinth: 3 };
    THATCH = { color: '#bf9f55', kind: 'thatch' };
    SHINGLE = { color: '#8a6a48', kind: 'shingle' };
  } else if (age === 1) {
    PLASTER = { base: '#dccfae', frame: '#3a2412', plinth: 6 };
    THATCH = { color: '#7e5d3e', kind: 'shingle' };
    SHINGLE = { color: '#6f5236', kind: 'shingle' };
  } else if (age === 2) {
    PLASTER = { base: '#d6cbb0', frame: '#3a2412', plinth: 14 };
    THATCH = { color: '#a5523a', kind: 'shingle' };
    SHINGLE = { color: '#93482f', kind: 'shingle' };
  } else {
    PLASTER = { base: '#c4bcab', mat: 'stone', frame: null, plinth: 4 };
    THATCH = { color: '#56606e', kind: 'shingle' };
    SHINGLE = { color: '#4c5562', kind: 'shingle' };
  }
}

function flag(g: G, x: number, y: number, z: number, team: string, s = 1): void {
  const [bx, by] = P(x, y, z);
  // Turned pole with a gilt finial.
  const pole = g.createLinearGradient(bx - 0.8, 0, bx + 0.8, 0);
  pole.addColorStop(0, '#8a6a44');
  pole.addColorStop(1, '#2e1d0e');
  g.fillStyle = pole;
  g.fillRect(bx - 0.7, by - 24 * s, 1.4, 24 * s);
  g.fillStyle = '#e0b54a';
  g.beginPath();
  g.arc(bx, by - 24.5 * s, ORNATE ? 2 : 1.2, 0, Math.PI * 2);
  g.fill();
  if (ORNATE) {
    // A gilded crown finial in the Dominion Age.
    g.beginPath();
    g.moveTo(bx - 2.2, by - 26 * s);
    g.lineTo(bx - 2.2, by - 29 * s);
    g.lineTo(bx - 1, by - 27.5 * s);
    g.lineTo(bx, by - 30 * s);
    g.lineTo(bx + 1, by - 27.5 * s);
    g.lineTo(bx + 2.2, by - 29 * s);
    g.lineTo(bx + 2.2, by - 26 * s);
    g.closePath();
    g.fill();
  }
  // Pennant rippling in the wind, lit on the bellies of its folds.
  const top = by - 22.5 * s, bot = by - 14.5 * s, len = 15 * s;
  g.beginPath();
  g.moveTo(bx + 0.6, top);
  const mid = (top + bot) / 2 + 1.2 * s;
  if (BANNER === 'pennant') {
    g.bezierCurveTo(bx + len * 0.35, top - 2.2 * s, bx + len * 0.65, top + 1.8 * s, bx + len * 1.25, mid);
  } else {
    g.bezierCurveTo(bx + len * 0.35, top - 2.2 * s, bx + len * 0.65, top + 1.8 * s, bx + len, top + 1.5 * s);
    if (BANNER === 'swallowtail') g.lineTo(bx + len * 0.72, mid);
    else if (BANNER === 'tongued') {
      const h = bot + 1.5 * s - (top + 1.5 * s);
      for (const f of [1 / 3, 2 / 3]) {
        g.lineTo(bx + len * 0.8, top + 1.5 * s + h * f - h / 6);
        g.lineTo(bx + len, top + 1.5 * s + h * f);
      }
    }
  }
  if (BANNER !== 'pennant') g.lineTo(bx + len * 0.97, bot + 1.5 * s);
  g.bezierCurveTo(bx + len * 0.6, bot + 2 * s, bx + len * 0.35, bot - 2 * s, bx + 0.6, bot);
  g.closePath();
  const cloth = g.createLinearGradient(bx, 0, bx + len, 0);
  cloth.addColorStop(0, shadeColor(team, 0.75));
  cloth.addColorStop(0.3, shadeColor(team, 1.2));
  cloth.addColorStop(0.55, shadeColor(team, 0.7));
  cloth.addColorStop(0.8, shadeColor(team, 1.1));
  cloth.addColorStop(1, shadeColor(team, 0.8));
  g.fillStyle = cloth;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.4;
  g.stroke();
}

/** A heraldic banner hung on a wall (u along the wall, v up) with a gold charge and fringe. */
function banner(g: G, u: number, v: number, team: string): void {
  g.fillStyle = '#3a2614';
  g.fillRect(u - 3.8, v - 0.6, 7.6, 0.9);
  const cloth = g.createLinearGradient(u - 3, 0, u + 3, 0);
  cloth.addColorStop(0, shadeColor(team, 1.15));
  cloth.addColorStop(0.5, shadeColor(team, 0.85));
  cloth.addColorStop(0.75, shadeColor(team, 1.05));
  cloth.addColorStop(1, shadeColor(team, 0.7));
  g.fillStyle = cloth;
  g.beginPath();
  g.moveTo(u - 3, v);
  g.lineTo(u + 3, v);
  if (BANNER === 'pennant') g.lineTo(u, v - 13);
  else if (BANNER === 'square') (g.lineTo(u + 3, v - 10), g.lineTo(u - 3, v - 10));
  else if (BANNER === 'tongued') {
    g.lineTo(u + 3, v - 11);
    for (const x of [1.5, 0, -1.5]) (g.lineTo(u + x, v - 9), g.lineTo(u + x - 1.5, v - 11));
  } else {
    g.lineTo(u + 3, v - 11);
    g.lineTo(u, v - 8);
    g.lineTo(u - 3, v - 11);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(20,10,0,0.45)';
  g.lineWidth = 0.4;
  g.stroke();
  // Gold chevron and border.
  g.strokeStyle = '#e2bc4c';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(u - 2, v - 3);
  g.lineTo(u, v - 5.5);
  g.lineTo(u + 2, v - 3);
  g.stroke();
  g.fillStyle = '#e2bc4c';
  g.fillRect(u - 3, v - 1.4, 6, 0.8);
}

/**
 * Trodden earth around a building, with a soft, irregular edge. Painted first,
 * onto the empty sprite, so its alpha can be feathered with destination-in.
 */
function groundPatch(g: G, n: number, color: string, spread = 0.2): void {
  const c = /rgba?\((\d+),(\d+),(\d+)/.exec(color.replace(/\s/g, ''));
  const hex = c ? '#' + [c[1], c[2], c[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') : color;
  onGround(g, 0, 0, () => {
    const m = n * 32, pad = spread * 32;
    g.fillStyle = mat(g, 'earth', hex, 2);
    g.fillRect(-pad, -pad, m + pad * 2, m + pad * 2);
    g.globalCompositeOperation = 'destination-in';
    const r = m / 2 + pad;
    const fade = g.createRadialGradient(m / 2, m / 2, r * 0.55, m / 2, m / 2, r * 1.05);
    fade.addColorStop(0, 'rgba(0,0,0,0.95)');
    fade.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(-m, -m, m * 3, m * 3);
    g.globalCompositeOperation = 'source-over';
  });
}

function crate(g: G, x: number, y: number, s = 0.35): void {
  softShadow(g, [[x, y, 0], [x + s + 0.12, y - 0.08, 0], [x + s + 0.12, y + s, 0], [x, y + s, 0]], 2, 0.45);
  box(g, x, y, x + s, y + s, s * 30, { base: '#9a7040', mat: 'planks' }, {}, 17);
  boxTop(g, x, y, x + s, y + s, s * 30, 'planks', '#a57a48');
}

/** An oak barrel with iron hoops. */
function barrel(g: G, x: number, y: number, r = 3.4, h = 9): void {
  const [bx, by] = P(x, y, 0);
  g.save();
  g.fillStyle = 'rgba(8,12,4,0.4)';
  g.beginPath();
  g.ellipse(bx + 2.5, by, r * 1.3, r * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(bx - r, by);
  g.bezierCurveTo(bx - r * 1.2, by - h * 0.35, bx - r * 1.2, by - h * 0.65, bx - r, by - h);
  g.lineTo(bx + r, by - h);
  g.bezierCurveTo(bx + r * 1.2, by - h * 0.65, bx + r * 1.2, by - h * 0.35, bx + r, by);
  g.ellipse(bx, by, r, r * 0.45, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = mat(g, 'woodV', '#7a5230', 19);
  g.fill();
  const shade = g.createLinearGradient(bx - r, 0, bx + r, 0);
  shade.addColorStop(0, 'rgba(255,230,190,0.25)');
  shade.addColorStop(0.4, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(10,6,2,0.6)');
  g.fillStyle = shade;
  g.fill();
  g.strokeStyle = '#2d2925';
  g.lineWidth = 0.8;
  for (const f of [0.18, 0.82]) {
    g.beginPath();
    g.ellipse(bx, by - h * f, r * 1.12, r * 0.45, 0, 0, Math.PI);
    g.stroke();
  }
  g.fillStyle = mat(g, 'woodH', '#8a6038', 20);
  g.beginPath();
  g.ellipse(bx, by - h, r, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(20,10,0,0.55)';
  g.lineWidth = 0.5;
  g.stroke();
  g.restore();
}

/** A tied grain sack slumped on the ground. */
function sack(g: G, x: number, y: number, s = 1): void {
  const [bx, by] = P(x, y, 0);
  g.fillStyle = 'rgba(8,12,4,0.35)';
  g.beginPath();
  g.ellipse(bx + 2, by, 4.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(bx - 3.8 * s, by);
  g.bezierCurveTo(bx - 5 * s, by - 5 * s, bx - 2 * s, by - 8 * s, bx - 0.8 * s, by - 8.5 * s);
  g.lineTo(bx + 0.8 * s, by - 8.5 * s);
  g.bezierCurveTo(bx + 2 * s, by - 8 * s, bx + 5 * s, by - 5 * s, bx + 3.8 * s, by);
  g.closePath();
  g.fillStyle = mat(g, 'canvas', '#bba57a', 21);
  g.fill();
  const sh = g.createRadialGradient(bx - 1.5 * s, by - 5 * s, 0.5, bx, by - 3 * s, 6 * s);
  sh.addColorStop(0, 'rgba(255,245,220,0.3)');
  sh.addColorStop(1, 'rgba(20,12,4,0.5)');
  g.fillStyle = sh;
  g.fill();
  g.strokeStyle = '#6b5232';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(bx - 1.2 * s, by - 7.6 * s);
  g.lineTo(bx + 1.2 * s, by - 7.6 * s);
  g.stroke();
}

/** A neat stack of split firewood, end grain facing the viewer. */
function woodpile(g: G, x: number, y: number, rows = 3, cols = 4): void {
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols - (r % 2); k++) log(g, [x + k * 0.11 + (r % 2) * 0.055, y - 0.45], [x + k * 0.11 + (r % 2) * 0.055, y], 1.5 + r * 2.6, 1.3);
}

function oreHeap(g: G, x: number, y: number, color: string, rng: Rng): void {
  const [cx, cy] = P(x, y, 0);
  g.fillStyle = 'rgba(8,12,4,0.38)';
  g.beginPath();
  g.ellipse(cx + 2, cy, 9, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 14; k++) {
    const a = rng.next() * Math.PI * 2, d = rng.next() * 0.22 * (1 - k / 18);
    const [px, py] = P(x + Math.cos(a) * d, y + Math.sin(a) * d, 0);
    const r = 1.4 + rng.next() * 1.4;
    const yy = py - 1 - k * 0.35;
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

/** A hay bale, banded with twine. */
function hayBale(g: G, x: number, y: number): void {
  box(g, x, y, x + 0.42, y + 0.26, 7, { base: '#c9ad62', mat: 'plaster' }, {}, 23);
  boxTop(g, x, y, x + 0.42, y + 0.26, 7, 'thatch', '#d6bd70');
  line3(g, [x + 0.14, y + 0.26, 0], [x + 0.14, y + 0.26, 7], 'rgba(90,60,25,0.8)', 0.5);
  line3(g, [x + 0.3, y + 0.26, 0], [x + 0.3, y + 0.26, 7], 'rgba(90,60,25,0.8)', 0.5);
}

/** Open canvas shelter on log posts with a team-coloured valance (camps). */
function shelter(g: G, x0: number, y0: number, x1: number, y1: number, h: number, team: string): void {
  boxShadow(g, x0, y0, x1, y1, h + 14);
  // Shaded interior floor so the open sides read as shade.
  softShadow(g, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 4, 0.45);
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) post(g, x, y, h, 2.6);
  post(g, (x0 + x1) / 2, y1, h, 2.2);
  // Ropes guying the corners.
  for (const [x, y, dx, dy] of [[x0, y1, -0.25, 0.25], [x1, y1, 0.3, 0.25]] as const) line3(g, [x, y, h], [x + dx, y + dy, 0], 'rgba(200,180,140,0.7)', 0.4);
  hipRoof(g, x0, y0, x1, y1, h, 14, { color: '#d8c79e', kind: 'canvas', trim: team }, 0.1);
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

/** Hairline cracks and knocked-out chips over a damaged wall (screen space around the tile centre). */
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

function stoneWall(g: G, variant: number, rng: Rng, height = 24): void {
  const st = { base: ORNATE ? '#b8b1a2' : '#a19b8f', mat: 'stone' as const };
  softShadow(g, [[0.15, 0.15, 0], [0.85, 0.15, 0], [0.85, 0.85, 0], [0.15, 0.85, 0]], 3, 0.35);
  const runs = joins(variant & 255);
  const back = runs.filter((d) => d[0] + d[1] < 0), side = runs.filter((d) => d[0] + d[1] === 0), front = runs.filter((d) => d[0] + d[1] > 0);
  const run = (d: [number, number]) => {
    prism(g, halfRun(d, 0.36), 0, height, st, 'stone', '#8e897e', 7);
    // Merlons along the run's walk.
    const len = Math.hypot(d[0], d[1]);
    for (let k = 0.15; k < 0.5 * len; k += 0.22) {
      const f = k / len;
      const x = 0.5 + d[0] * f, y = 0.5 + d[1] * f;
      prism(g, [[x - 0.07, y - 0.07], [x + 0.07, y - 0.07], [x + 0.07, y + 0.07], [x - 0.07, y + 0.07]], height, 5, st, 'stone', '#8e897e', 9);
    }
  };
  for (const d of back) run(d);
  for (const d of side) run(d);
  // Pillar where runs meet.
  prism(g, [[0.28, 0.28], [0.72, 0.28], [0.72, 0.72], [0.28, 0.72]], 0, height + 4, st, 'stone', '#8e897e', 11);
  crenels(g, 0.28, 0.28, 0.72, 0.72, height + 4, st, 0.11, 13);
  for (const d of front) run(d);
  cracks(g, (variant >> 8) & 3, height, rng);
}

/** A sharpened stake (log) standing at (x, y). */
function stake(g: G, x: number, y: number, h: number, w = 2.6): void {
  const [bx, by] = P(x, y, 0);
  h *= ZK;
  g.fillStyle = mat(g, 'woodV', '#6b4626', 21);
  g.fillRect(bx - w / 2, by - h, w, h);
  const sh = g.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0);
  sh.addColorStop(0, 'rgba(255,225,180,0.3)');
  sh.addColorStop(0.4, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(10,6,2,0.55)');
  g.fillStyle = sh;
  g.fillRect(bx - w / 2, by - h, w, h);
  g.fillStyle = '#c99a5e';
  g.beginPath();
  g.moveTo(bx - w / 2, by - h);
  g.lineTo(bx, by - h - w * 1.3);
  g.lineTo(bx + w / 2, by - h);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(20,12,4,0.55)';
  g.lineWidth = 0.4;
  g.stroke();
}

function palisade(g: G, variant: number, rng: Rng): void {
  softShadow(g, [[0.2, 0.2, 0], [0.8, 0.2, 0], [0.8, 0.8, 0], [0.2, 0.8, 0]], 2.5, 0.3);
  // Stakes along every joined direction, drawn back to front.
  const pts: Array<[number, number, number]> = [[0.5, 0.5, 20]];
  for (const d of joins(variant & 255)) {
    const len = Math.hypot(d[0], d[1]);
    for (let k = 0.12; k <= 0.5 * len + 0.01; k += 0.12) pts.push([0.5 + (d[0] * k) / len, 0.5 + (d[1] * k) / len, 17 + rng.next() * 5]);
  }
  pts.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [x, y, h] of pts) stake(g, x, y, h);
  // Lashing rail.
  for (const d of joins(variant & 255)) line3(g, [0.5, 0.5, 9], [0.5 + d[0] * 0.5, 0.5 + d[1] * 0.5, 9], 'rgba(60,40,20,0.9)', 0.8);
  cracks(g, (variant >> 8) & 3, 18, rng);
}

/** Which way a gate's passage runs: across its wall line. */
function passageAlongY(variant: number): boolean {
  const m = variant & 255;
  return !!(m & 1 || m & 16) || !(m & 4 || m & 64);
}

function stoneGate(g: G, variant: number, team: string, rng: Rng): void {
  const st = { base: ORNATE ? '#b8b1a2' : '#a19b8f', mat: 'stone' as const };
  const open = !!(variant & (1 << 10)), locked = !!(variant & (1 << 11));
  boxShadow(g, 0.05, 0.05, 0.95, 0.95, 40);
  // Flanking runs to the neighbouring walls.
  for (const d of joins(variant & 255)) prism(g, halfRun(d, 0.36), 0, 24, st, 'stone', '#8e897e', 7);
  const alongY = passageAlongY(variant);
  const arch = (len: number) => {
    // The archway: dark when open, oak doors with iron studs when shut.
    const w = len * 0.5, h2 = 18;
    g.beginPath();
    g.moveTo(len / 2 - w / 2, 0);
    g.lineTo(len / 2 - w / 2, h2 - w / 2);
    g.arc(len / 2, h2 - w / 2, w / 2, Math.PI, 0, true);
    g.lineTo(len / 2 + w / 2, 0);
    g.closePath();
    g.fillStyle = open ? '#0f0904' : mat(g, 'woodV', '#5a381c', 23);
    g.fill();
    if (!open) {
      g.fillStyle = '#2b2622';
      for (const v of [4, 10, 15]) g.fillRect(len / 2 - w / 2, v, w, 0.7);
      if (locked) {
        g.fillStyle = '#c9a24a';
        g.fillRect(len / 2 - 1.2, 7, 2.4, 3);
      }
    } else {
      // Portcullis drawn up into the arch.
      g.strokeStyle = 'rgba(60,60,60,0.9)';
      g.lineWidth = 0.6;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(len / 2 + k * (w / 6), h2 - 1);
        g.lineTo(len / 2 + k * (w / 6), h2 - 4);
        g.stroke();
      }
    }
  };
  box(g, 0.05, 0.05, 0.95, 0.95, 34, st, alongY ? { left: arch } : { right: arch }, 31);
  boxTop(g, 0.05, 0.05, 0.95, 0.95, 34, 'stone', '#8e897e');
  crenels(g, 0.05, 0.05, 0.95, 0.95, 34, st, 0.14, 33);
  flagPole(g, 0.5, 0.5, 34, team, 0.7);
  cracks(g, (variant >> 8) & 3, 30, rng);
}

function palisadeGate(g: G, variant: number, rng: Rng): void {
  const open = !!(variant & (1 << 10));
  palisade(g, variant & 255, rng);
  const alongY = passageAlongY(variant);
  // Two tall gateposts with a lintel, and plank doors (swung back when open).
  const [a, b]: Array<[number, number]> = alongY ? [[0.15, 0.5], [0.85, 0.5]] : [[0.5, 0.15], [0.5, 0.85]];
  for (const [x, y] of [a, b]) stake(g, x, y, 28, 3.4);
  line3(g, [a[0], a[1], 26], [b[0], b[1], 26], '#5a3a1c', 2.4);
  if (!open) {
    const pts: [number, number, number][] = [[a[0], a[1], 1], [b[0], b[1], 1], [b[0], b[1], 22], [a[0], a[1], 22]];
    poly3(g, pts, mat(g, 'woodV', '#6b4a28', 25));
    line3(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 22], 'rgba(20,10,4,0.7)', 0.8);
    if (variant & (1 << 11)) line3(g, [a[0], a[1], 12], [b[0], b[1], 12], '#3a3a3a', 1.6);
  }
}

/** Pole and pennant (without the age finial logic of flag()). */
function flagPole(g: G, x: number, y: number, z: number, team: string, s: number): void {
  flag(g, x, y, z, team, s);
}

function tower(g: G, variant: number, team: string, rng: Rng): void {
  const level = (variant >> 12) & 3;
  const st = { base: ORNATE ? '#b8b1a2' : '#a19b8f', mat: 'stone' as const };
  const h = [46, 60, 76][level];
  boxShadow(g, 0.08, 0.08, 0.92, 0.92, h + 20);
  const win = (len: number, hh: number) => {
    for (const v of level ? [hh * 0.45, hh * 0.75] : [hh * 0.55]) {
      g.fillStyle = '#140c06';
      g.fillRect(len / 2 - 1, v, 2, 6);
    }
  };
  box(g, 0.1, 0.1, 0.9, 0.9, h, st, { left: (len, hh) => { doorAt(g, len / 2, 6, 10); win(len, hh); }, right: win }, 41 + level);
  if (level === 0) {
    // Watch tower: a timber hoarding and a pointed shingle roof.
    box(g, 0.02, 0.02, 0.98, 0.98, 10, { base: '#6b4a2a', mat: 'planks' }, {}, 43);
    g.save();
    g.translate(0, -h * ZK);
    box(g, 0.02, 0.02, 0.98, 0.98, 10, { base: '#6b4a2a', mat: 'planks' }, {}, 44);
    g.restore();
    hipRoof(g, -0.02, -0.02, 1.02, 1.02, h + 10, 22, SHINGLE, 0.08, 45);
    flag(g, 0.5, 0.5, h + 32, team, 0.7);
  } else {
    boxTop(g, 0.1, 0.1, 0.9, 0.9, h, 'stone', '#8e897e');
    crenels(g, 0.06, 0.06, 0.94, 0.94, h, st, 0.15, 47);
    if (level === 2) {
      // Keep: a turret on top.
      box(g, 0.3, 0.3, 0.7, 0.7, 0, st, {}, 49);
      g.save();
      g.translate(0, -h * ZK);
      box(g, 0.3, 0.3, 0.7, 0.7, 14, st, {}, 49);
      g.restore();
      hipRoof(g, 0.28, 0.28, 0.72, 0.72, h + 14, 16, SHINGLE, 0.05, 51);
      flag(g, 0.5, 0.5, h + 30, team, 0.8);
    } else flag(g, 0.5, 0.5, h + 6, team, 0.8);
  }
  cracks(g, (variant >> 8) & 3, h, rng);
}

// ---------- naval ----------

/** Planked walkway on piles from (x0, y0) to (x1, y1), deck at height h. */
function jetty(g: G, x0: number, y0: number, x1: number, y1: number, h: number): void {
  // Piles first (the far ones are hidden by the deck).
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y1], [x1, (y0 + y1) / 2]] as const) post(g, x, y, h + 3, 2.4, '#5a3c22');
  box(g, x0, y0, x1, y1, h, { base: '#6e4c2c', mat: 'planks' }, {}, 71);
  boxTop(g, x0, y0, x1, y1, h, 'planks', '#a8814f');
}

/** Nets drying on a frame of poles. */
function netRack(g: G, x: number, y0: number, y1: number): void {
  post(g, x, y0, 14, 1.6);
  post(g, x, y1, 14, 1.6);
  line3(g, [x, y0, 14], [x, y1, 14], '#4a3020', 0.9);
  g.strokeStyle = 'rgba(214,204,170,0.75)';
  g.lineWidth = 0.4;
  for (let k = 0; k <= 8; k++) {
    const y = y0 + ((y1 - y0) * k) / 8;
    const [ax, ay] = P(x, y, 14), [bx, by] = P(x + 0.05, y, 4 + (k % 2) * 2);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  for (const z of [7, 10]) {
    const [ax, ay] = P(x + 0.03, y0, z), [bx, by] = P(x + 0.03, y1, z);
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 3, bx, by);
    g.stroke();
  }
}

/**
 * Dock: a wharf on the shore with a boathouse, a crane and a jetty out over the
 * water. `side` (0 +x, 1 +y, 2 -x, 3 -y) is where the water is.
 */
function dock(g: G, n: number, team: string, side: number): void {
  groundPatch(g, n, '#9c8a62', 0.2);
  const m = n / 2;
  // The jetty runs out over the water from the middle of the water side.
  const pier = (): void => {
    if (side === 0) jetty(g, n - 0.2, m - 0.45, n + 1.25, m + 0.45, 6);
    else if (side === 1) jetty(g, m - 0.45, n - 0.2, m + 0.45, n + 1.25, 6);
    else if (side === 2) jetty(g, -1.25, m - 0.45, 0.2, m + 0.45, 6);
    else jetty(g, m - 0.45, -1.25, m + 0.45, 0.2, 6);
  };
  if (side >= 2) pier();
  // Wharf deck over the whole yard.
  boxShadow(g, 0.1, 0.1, n - 0.1, n - 0.1, 10);
  box(g, 0.1, 0.1, n - 0.1, n - 0.1, 5, { base: '#6a4a2c', mat: 'planks' }, {}, 73);
  boxTop(g, 0.1, 0.1, n - 0.1, n - 0.1, 5, 'planks', '#b08a58');
  g.save();
  g.translate(0, -5 * ZK);
  // Boathouse on the landward half, its open end toward the water.
  const land = (side + 2) % 4;
  const bx0 = land === 2 ? 0.2 : land === 0 ? n - 1.7 : 0.35, by0 = land === 3 ? 0.2 : land === 1 ? n - 1.7 : 0.35;
  const bx1 = land === 2 ? 1.7 : land === 0 ? n - 0.2 : n - 0.35, by1 = land === 3 ? 1.7 : land === 1 ? n - 0.2 : n - 0.35;
  box(g, bx0, by0, bx1, by1, 26, PLASTER, {
    left: (len) => {
      doorAt(g, len / 2, 8, 12);
      banner(g, len * 0.2, 22, team);
    },
    right: (len) => windowAt(g, len / 2, 16, 4, 5),
  }, 75);
  gableRoof(g, bx0, by0, bx1, by1, 26, 20, THATCH, side % 2 === 0 ? 'x' : 'y', 0.15, 77);
  // Crates, barrels and a coil of rope on the wharf; nets drying.
  const fx = side === 0 ? n - 0.9 : side === 2 ? 0.3 : 0.3, fy = side === 1 ? n - 0.9 : side === 3 ? 0.3 : n - 0.75;
  crate(g, fx, fy, 0.3);
  barrel(g, fx + 0.6, fy + 0.1, 3, 8);
  barrel(g, fx + 0.35, fy + 0.45, 3, 8);
  if (side % 2 === 0) netRack(g, side === 0 ? 0.35 : n - 0.35, 0.4, 1.4);
  else netRack(g, n - 0.4, side === 1 ? 0.4 : n - 1.4, side === 1 ? 1.4 : n - 0.4);
  // A timber crane at the head of the jetty.
  const cx = side === 0 ? n - 0.4 : side === 2 ? 0.4 : m + 0.55, cy = side === 1 ? n - 0.4 : side === 3 ? 0.4 : m + 0.55;
  post(g, cx, cy, 34, 2.4, '#5e3f22');
  const ox = side === 0 ? 0.9 : side === 2 ? -0.9 : 0, oy = side === 1 ? 0.9 : side === 3 ? -0.9 : 0;
  line3(g, [cx, cy, 33], [cx + ox, cy + oy, 36], '#4e331b', 1.8);
  line3(g, [cx, cy, 22], [cx + ox * 0.45, cy + oy * 0.45, 34], '#4e331b', 1.1);
  line3(g, [cx + ox, cy + oy, 36], [cx + ox, cy + oy, 16], 'rgba(200,180,140,0.85)', 0.5);
  const [hx, hy] = P(cx + ox, cy + oy, 15);
  g.fillStyle = '#8a6a42';
  g.fillRect(hx - 2, hy - 2, 4, 3.2);
  g.restore();
  if (side < 2) pier();
  // The owner's flag at the end of the jetty.
  const [jx, jy] = side === 0 ? [n + 1.1, m - 0.35] : side === 1 ? [m - 0.35, n + 1.1] : side === 2 ? [-1.1, m - 0.35] : [m - 0.35, -1.1];
  flag(g, jx, jy, 6, team, 0.7);
}

/** Fish trap: a ring of stakes and nets in the water, fish showing while it is stocked. */
function fishTrap(g: G, n: number, rng: Rng, stage: number): void {
  // Disturbed, darker water inside the ring.
  onGround(g, 0, 0, () => {
    const W = n * 32;
    const grad = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W * 0.55);
    grad.addColorStop(0, 'rgba(20,50,70,0.35)');
    grad.addColorStop(1, 'rgba(20,50,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
  });
  const ring: Array<[number, number]> = [];
  const R = n * 0.42, c = n / 2;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    ring.push([c + Math.cos(a) * R, c + Math.sin(a) * R]);
  }
  // Fish flashing in the trap.
  const fish = [0, 3, 6, 10][stage] ?? 0;
  for (let k = 0; k < fish; k++) {
    const a = rng.next() * Math.PI * 2, r = rng.next() * R * 0.7;
    const [x, y] = P(c + Math.cos(a) * r, c + Math.sin(a) * r, 0);
    g.fillStyle = 'rgba(200,215,220,0.8)';
    g.beginPath();
    g.ellipse(x, y, 2.2, 0.8, rng.next() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Net between the stakes (back half first), then the stakes, then the front net.
  const net = (front: boolean) => {
    g.strokeStyle = 'rgba(220,210,180,0.7)';
    g.lineWidth = 0.5;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      if (a[0] + a[1] + b[0] + b[1] > 2 * n !== front) continue;
      for (const z of [2, 5, 8]) {
        const [ax, ay] = P(a[0], a[1], z), [bx, by] = P(b[0], b[1], z);
        g.beginPath();
        g.moveTo(ax, ay);
        g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 1.2, bx, by);
        g.stroke();
      }
    }
  };
  net(false);
  for (const [x, y] of [...ring].sort((p, q) => p[0] + p[1] - q[0] - q[1])) {
    post(g, x, y, 10 + rng.next() * 3, 1.8, '#6a4a2a');
    // Ripple ring where the stake meets the water.
    const [px, py] = P(x, y, 0);
    g.strokeStyle = 'rgba(230,240,245,0.45)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(px, py, 2.6, 1.1, 0, 0, Math.PI * 2);
    g.stroke();
  }
  net(true);
  // Cork floats.
  for (let k = 0; k < ring.length; k += 2) {
    const [x, y] = P(ring[k][0], ring[k][1], 0.5);
    g.fillStyle = '#d0a040';
    g.beginPath();
    g.ellipse(x + 2, y + 1, 1.4, 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** A stepped marble monument: three terraces, colonnaded hall, a gilded spire over all. */
function wonder(g: G, n: number, team: string): void {
  const marble = { base: '#e3dccb', mat: 'stone' as const };
  const gold = '#d9b041';
  groundPatch(g, n, '#8a7a60', 0.4);
  boxShadow(g, 0.1, 0.1, n - 0.1, n - 0.1, 130);
  let z = 0;
  const tier = (i: number, h: number) => {
    g.save();
    g.translate(0, -z * ZK);
    box(g, i, i, n - i, n - i, h, marble, {}, 90 + i * 10);
    boxTop(g, i, i, n - i, n - i, h, 'stone', '#d6cfbe');
    g.restore();
    z += h;
  };
  tier(0.15, 8);
  tier(0.45, 8);
  tier(0.75, 8);
  // Steps up the front of the terraces.
  for (let k = 0; k < 6; k++) {
    const y = n - 0.15 - k * 0.1;
    box(g, n / 2 - 0.5, y - 0.1, n / 2 + 0.5, y, 4 * (k + 1), marble, {}, 120 + k);
  }
  // The colonnaded hall.
  g.save();
  g.translate(0, -z * ZK);
  box(g, 1.05, 1.05, n - 1.05, n - 1.05, 46, marble, {
    left: (len) => {
      for (let u = 6; u < len - 3; u += 8) {
        g.fillStyle = 'rgba(60,45,30,0.55)';
        g.fillRect(u + 1.4, 4, 3.4, 34);
        g.fillStyle = '#f2ecdf';
        g.fillRect(u - 0.8, 2, 2.4, 38);
      }
      doorAt(g, len / 2, 10, 22);
      banner(g, len * 0.22, 44, team);
      banner(g, len * 0.78, 44, team);
    },
    right: (len) => {
      for (let u = 6; u < len - 3; u += 8) {
        g.fillStyle = 'rgba(40,30,20,0.55)';
        g.fillRect(u + 1.4, 4, 3.4, 34);
        g.fillStyle = '#d7d0c0';
        g.fillRect(u - 0.8, 2, 2.4, 38);
      }
    },
  }, 131);
  boxTop(g, 1.05, 1.05, n - 1.05, n - 1.05, 46, 'stone', '#cfc8b6');
  // Gilt frieze.
  line3(g, [1.05, n - 1.05, 44], [n - 1.05, n - 1.05, 44], gold, 1.6);
  line3(g, [n - 1.05, 1.05, 44], [n - 1.05, n - 1.05, 44], gold, 1.6);
  g.restore();
  z += 46;
  // Upper drum and a tall pointed roof.
  g.save();
  g.translate(0, -z * ZK);
  box(g, 1.7, 1.7, n - 1.7, n - 1.7, 26, marble, { left: (len) => windowAt(g, len / 2, 12, 5, 8), right: (len) => windowAt(g, len / 2, 12, 5, 8) }, 141);
  hipRoof(g, 1.6, 1.6, n - 1.6, n - 1.6, 26, 52, { color: '#3d6f8f', kind: 'shingle', trim: gold }, 0.1, 9);
  g.restore();
  z += 26 + 52;
  line3(g, [n / 2, n / 2, z - 2], [n / 2, n / 2, z + 18], gold, 2);
  const [sx, sy] = P(n / 2, n / 2, z + 20);
  g.fillStyle = gold;
  g.beginPath();
  g.arc(sx, sy, 3, 0, Math.PI * 2);
  g.fill();
  // Obelisks at the corners of the lowest terrace.
  for (const [x, y] of [[0.4, 0.4], [n - 0.4, 0.4], [0.4, n - 0.4], [n - 0.4, n - 0.4]] as const) {
    prism(g, [[x - 0.12, y - 0.12], [x + 0.12, y - 0.12], [x + 0.12, y + 0.12], [x - 0.12, y + 0.12]], 8, 34, marble, 'stone', '#d6cfbe', 151);
    line3(g, [x, y, 42], [x, y, 50], gold, 1.4);
  }
  flag(g, n - 0.4, n - 0.4, 50, team, 1.1);
}

const PAINTERS: Record<BuildingType, Painter> = {
  wonder: (g, n, team) => wonder(g, n, team),
  dock: (g, n, team, _rng, variant) => dock(g, n, team, variant & 3),
  fish_trap: (g, n, _team, rng, variant) => fishTrap(g, n, rng, variant),
  town_center: (g, n, team) => {
    groundPatch(g, n, '#7d6444', 0.35);
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 84);
    // Dressed-stone plinth with a flagged terrace, then the timber hall.
    box(g, 0.3, 0.3, n - 0.3, n - 0.3, 6, STONE, {}, 31);
    boxTop(g, 0.3, 0.3, n - 0.3, n - 0.3, 6, 'stone', '#9d978b');
    // Steps up to the door.
    for (let k = 0; k < 3; k++) {
      const y = n - 0.3 + 0.12 * (2 - k);
      box(g, n / 2 - 0.45, y - 0.12, n / 2 + 0.45, y, 2 * (k + 1), STONE, {}, 40 + k);
    }
    g.save();
    g.translate(0, -6 * ZK);
    box(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, PLASTER, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.18, len * 0.34, len * 0.66, len * 0.82]) windowAt(g, u, 17, 4.5, 6);
        banner(g, len * 0.26, 29, team);
        banner(g, len * 0.74, 29, team);
      },
      right: (len) => {
        for (const u of [len * 0.2, len * 0.4, len * 0.6, len * 0.8]) windowAt(g, u, 17, 4.5, 6);
      },
    }, 33);
    gableRoof(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, 30, THATCH, 'x', 0.2, 11);
    // Central bell tower rising through the roof, with an open belfry.
    const t0 = n / 2 - 0.55, t1 = n / 2 + 0.55;
    box(g, t0, t0, t1, t1, 84, PLASTER, {
      left: (len) => {
        windowAt(g, len / 2, 50, 4, 6);
        g.fillStyle = '#1a0f07';
        g.fillRect(len * 0.25, 68, len * 0.5, 10);
        g.fillStyle = '#c9a24a';
        g.beginPath();
        g.arc(len / 2, 74, 2.6, Math.PI, 0);
        g.fill();
      },
      right: (len) => {
        windowAt(g, len / 2, 50, 4, 6);
        g.fillStyle = '#1a0f07';
        g.fillRect(len * 0.25, 68, len * 0.5, 10);
      },
    }, 35);
    hipRoof(g, t0, t0, t1, t1, 84, 26, THATCH.kind === 'thatch' ? { color: '#b9a46a', kind: 'shingle' } : SHINGLE, 0.15, 5);
    flag(g, n / 2, n / 2, 110, team, 1.2);
    // Chimney with a wisp of smoke.
    box(g, n - 1.3, 1.0, n - 1.0, 1.3, 64, STONE, {}, 37);
    boxTop(g, n - 1.3, 1.0, n - 1.0, 1.3, 64, 'stone', '#5a544c');
    const [sx, sy] = P(n - 1.15, 1.15, 66);
    for (let k = 0; k < 5; k++) {
      const grad = g.createRadialGradient(sx + k * 2, sy - k * 5, 0, sx + k * 2, sy - k * 5, 3 + k * 1.4);
      grad.addColorStop(0, `rgba(220,220,215,${0.3 - k * 0.05})`);
      grad.addColorStop(1, 'rgba(220,220,215,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(sx + k * 2, sy - k * 5, 3 + k * 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Stores by the door.
    barrel(g, n / 2 - 1.05, n - 0.12);
    barrel(g, n / 2 - 0.75, n - 0.02, 3, 8);
    sack(g, n / 2 + 0.8, n - 0.05);
    sack(g, n / 2 + 1.05, n - 0.15, 0.85);
    crate(g, 0.05, n - 0.55, 0.32);
  },
  house: (g, n, team) => {
    groundPatch(g, n, '#806a4a', 0.15);
    boxShadow(g, 0.25, 0.25, n - 0.2, n - 0.2, 44);
    box(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, { ...PLASTER, plinth: Math.max(PLASTER.plinth ?? 0, 4) }, {
      left: (len) => {
        doorAt(g, len * 0.33, 6.5, 11);
        windowAt(g, len * 0.72, 9, 4, 5);
      },
      right: (len) => windowAt(g, len / 2, 9, 4, 5),
    }, 41);
    gableRoof(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, 20, THATCH, 'y', 0.16, 3);
    box(g, 0.45, 0.55, 0.72, 0.82, 50, STONE, {}, 43);
    boxTop(g, 0.45, 0.55, 0.72, 0.82, 50, 'stone', '#4e4943');
    flag(g, n - 0.3, 0.3, 30, team, 0.7);
    woodpile(g, n - 0.05, n * 0.62, 2, 3);
    barrel(g, 0.15, n - 0.05, 2.8, 7.5);
  },
  lumber_camp: (g, n, team) => {
    groundPatch(g, n, '#7a6243', 0.25);
    // Sawdust and wood chips.
    onGround(g, 0, 0, () => {
      for (let k = 0; k < 70; k++) {
        const u = ((k * 37) % 61) / 61 * n * 32, v = ((k * 53) % 59) / 59 * n * 32;
        g.fillStyle = k % 3 ? 'rgba(222,190,130,0.7)' : 'rgba(160,120,70,0.7)';
        g.fillRect(u, v, 1.2, 0.6);
      }
    });
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Stacked logs, a sawhorse with a log on it and an axe in the chopping block.
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) log(g, [n * 0.66 + k * 0.17 + r * 0.085, 0.3], [n * 0.66 + k * 0.17 + r * 0.085, 1.3], 1.8 + r * 3.3, 1.7);
    crate(g, n * 0.74, n * 0.72);
    line3(g, [n * 0.24, n * 0.88, 0], [n * 0.27, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.3, n * 0.82, 0], [n * 0.27, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.44, n * 0.88, 0], [n * 0.47, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.5, n * 0.82, 0], [n * 0.47, n * 0.85, 8], '#4a301a', 1.1);
    log(g, [n * 0.18, n * 0.85], [n * 0.55, n * 0.85], 8.5, 1.5);
    const [bx, by] = P(n * 0.12, n * 0.62, 0);
    g.fillStyle = mat(g, 'woodV', '#6b4626', 13);
    g.fillRect(bx - 3, by - 5, 6, 5);
    g.fillStyle = '#d9b27a';
    g.beginPath();
    g.ellipse(bx, by - 5, 3, 1.3, 0, 0, Math.PI * 2);
    g.fill();
    line3(g, [n * 0.12, n * 0.62, 5], [n * 0.08, n * 0.6, 13], '#7a5430', 0.9);
    poly3(g, [[n * 0.12, n * 0.62, 5.5], [n * 0.15, n * 0.64, 6.5], [n * 0.14, n * 0.64, 8.5], [n * 0.11, n * 0.61, 7]], '#9aa3a8');
  },
  mining_camp: (g, n, team, rng) => {
    groundPatch(g, n, '#7b7266', 0.25);
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Ore cart on spoked wheels, heaped with gold; a pile of quarried stone.
    boxShadow(g, n * 0.68, n * 0.2, n * 0.95, n * 0.5, 14);
    box(g, n * 0.68, n * 0.2, n * 0.95, n * 0.5, 9, { base: '#7a5634', mat: 'planks' }, {}, 51);
    poly3(g, [[n * 0.68, n * 0.2, 9], [n * 0.95, n * 0.2, 9], [n * 0.95, n * 0.5, 9], [n * 0.68, n * 0.5, 9]], '#3a2a1a');
    oreHeap(g, n * 0.8, n * 0.33, '#f2c230', rng);
    for (const x of [n * 0.72, n * 0.9]) {
      const [wx, wy] = P(x, n * 0.5, 3.2);
      g.strokeStyle = '#3a2614';
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(wx, wy, 1.6, 3.2, -0.45, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 0.4;
      for (let a = 0; a < 3; a++) {
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * 1.5, wy + Math.sin(a) * 3);
        g.lineTo(wx - Math.cos(a) * 1.5, wy - Math.sin(a) * 3);
        g.stroke();
      }
    }
    oreHeap(g, n * 0.78, n * 0.8, '#a9a9a2', rng);
    // Cut blocks and pickaxes leaning on the crate.
    for (const [x, y] of [[n * 0.95, n * 0.68], [n * 1.0, n * 0.82]] as const) {
      box(g, x - 0.15, y - 0.12, x, y, 4.5, STONE, {}, 53);
      boxTop(g, x - 0.15, y - 0.12, x, y, 4.5, 'stone', '#b0aaa0');
    }
    crate(g, n * 0.3, n * 0.82, 0.3);
    line3(g, [n * 0.46, n * 0.92, 0], [n * 0.4, n * 0.88, 13], '#7a5430', 0.9);
    line3(g, [n * 0.36, n * 0.86, 13], [n * 0.45, n * 0.9, 12.5], '#6d777d', 1.2);
  },
  mill: (g, n, team) => {
    groundPatch(g, n, '#7f6a4a', 0.2);
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 64);
    box(g, 0.3, 0.35, n - 0.3, n - 0.3, 18, STONE, {
      left: (len) => doorAt(g, len * 0.4, 6, 10),
    }, 61);
    box(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, { ...PLASTER, plinth: Math.max(PLASTER.plinth ?? 0, 0) }, {
      left: (len) => windowAt(g, len * 0.5, 26, 4, 5),
      right: (len) => windowAt(g, len / 2, 26, 4, 5),
    }, 63);
    hipRoof(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, 22, THATCH, 0.14, 9);
    // Four lattice sails clothed in canvas on the south-west face.
    const [hx, hy] = P(n / 2 - 0.1, n - 0.45, 46);
    g.save();
    g.translate(hx, hy);
    g.rotate(0.3);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = mat(g, 'woodV', '#4a3218', 65);
      g.fillRect(-0.9, 0, 1.8, 35);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0.4, 0, 0.5, 35);
      g.fillStyle = mat(g, 'canvas', '#e6dcc4', 66);
      g.fillRect(1.3, 8, 7.5, 26);
      const sail = g.createLinearGradient(1.3, 0, 8.8, 0);
      sail.addColorStop(0, 'rgba(255,250,235,0.25)');
      sail.addColorStop(1, 'rgba(40,30,15,0.3)');
      g.fillStyle = sail;
      g.fillRect(1.3, 8, 7.5, 26);
      g.strokeStyle = 'rgba(70,50,25,0.75)';
      g.lineWidth = 0.45;
      for (let v = 11; v < 34; v += 3.6) {
        g.beginPath();
        g.moveTo(1.3, v);
        g.lineTo(8.8, v);
        g.stroke();
      }
      g.strokeRect(1.3, 8, 7.5, 26);
    }
    g.restore();
    const hub = g.createRadialGradient(hx - 0.8, hy - 0.8, 0.2, hx, hy, 3);
    hub.addColorStop(0, '#8a6a44');
    hub.addColorStop(1, '#2a1a0c');
    g.fillStyle = hub;
    g.beginPath();
    g.arc(hx, hy, 2.8, 0, Math.PI * 2);
    g.fill();
    sack(g, n - 0.25, n - 0.1);
    sack(g, n - 0.05, n - 0.35, 0.9);
    sack(g, n - 0.12, n + 0.05, 0.8);
    hayBale(g, 0.0, n - 0.4);
    flag(g, 0.4, 0.4, 40, team, 0.7);
  },
  barracks: (g, n, team) => {
    groundPatch(g, n, '#836748', 0.2);
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.55, 50);
    box(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, { ...PLASTER, plinth: Math.max(PLASTER.plinth ?? 0, 5) }, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.18, len * 0.82]) windowAt(g, u, 14, 4.5, 6);
        banner(g, len * 0.33, 24, team);
        banner(g, len * 0.67, 24, team);
      },
      right: (len) => windowAt(g, len / 2, 14, 4.5, 6),
    }, 71);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, 22, SHINGLE, 'x', 0.16, 21);
    // Training yard: sanded ground, a post-and-rail fence along the front.
    for (let x = 0.1; x <= n - 0.1; x += 0.45) post(g, x, n - 0.1, 9, 1.6);
    for (const z of [7, 3.5]) {
      line3(g, [0.1, n - 0.1, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.5);
      line3(g, [0.1, n - 0.1, z + 0.4], [n - 0.1, n - 0.1, z + 0.4], 'rgba(255,220,170,0.25)', 0.4);
    }
    // Straw practice dummy on a post.
    const [dx, dy] = P(0.8, n * 0.8, 0);
    g.fillStyle = 'rgba(8,12,4,0.35)';
    g.beginPath();
    g.ellipse(dx + 3, dy, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = mat(g, 'woodV', '#5a3d22', 72);
    g.fillRect(dx - 1, dy - 19, 2, 19);
    g.fillRect(dx - 6.5, dy - 14.5, 13, 1.6);
    const straw = g.createRadialGradient(dx - 1.5, dy - 12, 0.5, dx, dy - 10, 6);
    straw.addColorStop(0, '#ead28c');
    straw.addColorStop(1, '#8e7638');
    g.fillStyle = straw;
    g.beginPath();
    g.ellipse(dx, dy - 10, 3.8, 5.4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(dx, dy - 18.5, 2.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6b5232';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(dx - 3.5, dy - 8);
    g.lineTo(dx + 3.5, dy - 8);
    g.stroke();
    // Weapon rack: spears with steel heads and team shields.
    line3(g, [n * 0.58, n * 0.78, 14], [n * 1.0, n * 0.78, 14], '#4e331b', 1.2);
    for (let k = 0; k < 4; k++) {
      line3(g, [n * 0.62 + k * 0.12, n * 0.78, 0], [n * 0.6 + k * 0.12, n * 0.78, 22], '#7a5430', 1.1);
      poly3(g, [[n * 0.595 + k * 0.12, n * 0.78, 22], [n * 0.605 + k * 0.12, n * 0.78, 22], [n * 0.6 + k * 0.12, n * 0.78, 26]], '#c9d0d4', null);
    }
    for (const x of [n * 0.66, n * 0.86]) {
      const [sx, sy] = P(x, n * 0.8, 8);
      const sh = g.createRadialGradient(sx - 1.5, sy - 1.5, 0.3, sx, sy, 4.8);
      sh.addColorStop(0, shadeColor(team, 1.35));
      sh.addColorStop(1, shadeColor(team, 0.55));
      g.fillStyle = sh;
      g.beginPath();
      g.ellipse(sx, sy, 4, 4.4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a6a30';
      g.lineWidth = 0.7;
      g.stroke();
      const boss = g.createRadialGradient(sx - 0.4, sy - 0.4, 0.1, sx, sy, 1.4);
      boss.addColorStop(0, '#fff2c0');
      boss.addColorStop(1, '#8a6a20');
      g.fillStyle = boss;
      g.beginPath();
      g.arc(sx, sy, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    barrel(g, n - 0.15, n * 0.6, 2.8, 7.5);
    flag(g, n - 0.25, 0.25, 40, team, 1);
  },
  farm: (g, n, _team, rng, stage) => {
    // Ploughed field: ridged furrows run along x; wheat thins as it is harvested.
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
      // Grassy margin.
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
          // Ear of grain, lit on its left.
          g.fillStyle = shadeColor(tip, 0.85 + rng.next() * 0.3);
          g.beginPath();
          g.ellipse(sx + lean, sy - h - 1, 0.65, 1.5, lean * 0.15, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,250,220,0.35)';
          g.fillRect(sx + lean - 0.55, sy - h - 2, 0.4, 1.4);
        }
      }
    for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n], [n, n / 2]]) post(g, x, y, 7, 1.5);
    for (const z of [5, 2.5]) {
      line3(g, [0, n, z], [n, n, z], '#4e331b', 0.9);
      line3(g, [n, 0, z], [n, n, z], '#4e331b', 0.9);
    }
  },
  archery_range: (g, n, team) => {
    groundPatch(g, n, '#84694a', 0.2);
    // Open-fronted range house at the back, shooting lane and straw butts in front.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.45, 40);
    box(g, 0.2, 0.2, n - 0.2, n * 0.45, 22, { ...PLASTER, plinth: Math.max(PLASTER.plinth ?? 0, 4) }, {
      left: (len) => {
        for (const u of [len * 0.25, len * 0.5, len * 0.75]) {
          g.fillStyle = '#1e130a';
          g.fillRect(u - 4.5, 4, 9, 12);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(u - 4.5, 13, 9, 3);
        }
        banner(g, len * 0.12, 20, team);
        banner(g, len * 0.88, 20, team);
      },
      right: (len) => windowAt(g, len / 2, 10, 4, 5),
    }, 91);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.45, 22, 18, SHINGLE, 'x', 0.16, 23);
    // Straw butts with painted targets on easels.
    for (const x of [n * 0.25, n * 0.55, n * 0.85]) {
      const [tx, ty] = P(x, n * 0.85, 0);
      g.fillStyle = 'rgba(8,12,4,0.35)';
      g.beginPath();
      g.ellipse(tx + 3, ty, 6, 2, 0, 0, Math.PI * 2);
      g.fill();
      line3(g, [x - 0.08, n * 0.88, 0], [x, n * 0.85, 13], '#5a3d22', 1);
      line3(g, [x + 0.08, n * 0.82, 0], [x, n * 0.85, 13], '#5a3d22', 1);
      const straw = g.createRadialGradient(tx - 1.5, ty - 11, 0.5, tx, ty - 10, 6);
      straw.addColorStop(0, '#ecd590');
      straw.addColorStop(1, '#9a7c3a');
      g.fillStyle = straw;
      g.beginPath();
      g.ellipse(tx, ty - 10, 5, 5.6, 0, 0, Math.PI * 2);
      g.fill();
      for (const [r, c] of [[3.8, '#f2ece0'], [2.6, team], [1.4, '#f2ece0'], [0.6, '#b8352a']] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(tx, ty - 10, r, r * 1.1, 0, 0, Math.PI * 2);
        g.fill();
      }
      // A couple of arrows stuck in.
      g.strokeStyle = '#3a2614';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(tx - 1, ty - 11);
      g.lineTo(tx - 6, ty - 12.5);
      g.moveTo(tx + 1.2, ty - 9);
      g.lineTo(tx - 4, ty - 9.5);
      g.stroke();
    }
    barrel(g, 0.1, n * 0.6, 2.6, 7);
    flag(g, n - 0.25, 0.25, 34, team, 0.9);
  },
  stable: (g, n, team) => {
    groundPatch(g, n, '#806446', 0.25);
    // Long timber stable with stall doors, a hay loft and a paddock in front.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.5, 44);
    box(g, 0.2, 0.2, n - 0.2, n * 0.5, 24, { base: '#7a5634', mat: 'planks', plinth: 3 }, {
      left: (len) => {
        for (const u of [len * 0.2, len * 0.4, len * 0.6, len * 0.8]) {
          // Dutch stall doors, top half open with a dark interior.
          g.fillStyle = mat(g, 'woodV', '#5a3a1c', 93);
          g.fillRect(u - 3.5, 0.5, 7, 6);
          g.fillStyle = '#140c06';
          g.fillRect(u - 3.5, 6.5, 7, 6.5);
          g.strokeStyle = '#2a1a0c';
          g.lineWidth = 0.5;
          g.strokeRect(u - 3.5, 0.5, 7, 12.5);
          g.beginPath();
          g.moveTo(u - 3.5, 0.5);
          g.lineTo(u + 3.5, 6.5);
          g.stroke();
        }
        g.fillStyle = '#140c06';
        g.fillRect(len / 2 - 3, 16, 6, 5);
        g.fillStyle = '#d6bd70';
        g.fillRect(len / 2 - 3, 16, 6, 2.2);
        banner(g, len * 0.1, 22, team);
      },
      right: (len) => windowAt(g, len / 2, 12, 4, 5),
    }, 95);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.5, 24, 20, THATCH, 'x', 0.18, 25);
    // Paddock rails and a water trough.
    for (let x = 0.1; x <= n - 0.1; x += 0.5) post(g, x, n - 0.1, 8, 1.5);
    for (let y = n * 0.55; y <= n - 0.1; y += 0.5) post(g, n - 0.1, y, 8, 1.5);
    for (const z of [6.5, 3.2]) {
      line3(g, [0.1, n - 0.1, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.2);
      line3(g, [n - 0.1, n * 0.55, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.2);
    }
    box(g, n * 0.25, n * 0.72, n * 0.55, n * 0.8, 5, { base: '#6b4626', mat: 'planks' }, {}, 97);
    poly3(g, [[n * 0.26, n * 0.73, 4.6], [n * 0.54, n * 0.73, 4.6], [n * 0.54, n * 0.79, 4.6], [n * 0.26, n * 0.79, 4.6]], '#3f6a7a', null);
    hayBale(g, n * 0.68, n * 0.62);
    hayBale(g, n * 0.72, n * 0.72);
    flag(g, n - 0.25, 0.25, 40, team, 1);
  },
  monastery: (g, n, team) => {
    groundPatch(g, n, '#8a7a5e', 0.2);
    // Stone chapel with a bell-cote, round-arched windows and a walled garth.
    boxShadow(g, 0.3, 0.3, n - 0.3, n * 0.6, 80);
    box(g, 0.3, 0.3, n - 0.3, n * 0.6, 34, STONE, {
      left: (len) => {
        doorAt(g, len / 2, 8, 15);
        for (const u of [len * 0.2, len * 0.8]) {
          g.fillStyle = '#1c140c';
          g.beginPath();
          g.moveTo(u - 2.2, 14);
          g.lineTo(u - 2.2, 22);
          g.arc(u, 22, 2.2, Math.PI, 0, true);
          g.lineTo(u + 2.2, 14);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(80,140,220,0.35)';
          g.fill();
        }
        // Rose window.
        g.fillStyle = '#1c140c';
        g.beginPath();
        g.arc(len / 2, 26, 3.4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = shadeColor(team, 1.2);
        g.lineWidth = 0.6;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.moveTo(len / 2, 26);
          g.lineTo(len / 2 + Math.cos(k) * 3, 26 + Math.sin(k) * 3);
          g.stroke();
        }
      },
      right: (len) => {
        for (const u of [len * 0.3, len * 0.7]) windowAt(g, u, 16, 3.5, 7);
      },
    }, 101);
    gableRoof(g, 0.3, 0.3, n - 0.3, n * 0.6, 34, 26, { color: '#8a5a40', kind: 'shingle' }, 'y', 0.14, 27);
    // Bell-cote on the gable with a cross.
    const bx = n / 2, by = n * 0.6;
    box(g, bx - 0.2, by - 0.1, bx + 0.2, by + 0.05, 74, STONE, {
      left: (len) => {
        g.fillStyle = '#140c06';
        g.fillRect(len * 0.2, 62, len * 0.6, 8);
        g.fillStyle = '#c9a24a';
        g.beginPath();
        g.arc(len / 2, 66, 2, Math.PI, 0);
        g.fill();
      },
    }, 103);
    const [cx, cy] = P(bx, by, 74);
    g.fillStyle = '#d9b44a';
    g.fillRect(cx - 0.6, cy - 12, 1.2, 12);
    g.fillRect(cx - 3, cy - 9, 6, 1.2);
    // Low cloister wall and a cypress in the garth.
    for (const [a, b] of [[[0.2, n - 0.1], [n - 0.1, n - 0.1]], [[n - 0.1, n * 0.62], [n - 0.1, n - 0.1]]] as const) {
      const [ax, ay] = a, [bx2, by2] = b;
      box(g, Math.min(ax, bx2), Math.min(ay, by2) - 0.08, Math.max(ax, bx2), Math.max(ay, by2), 6, STONE, {}, 105);
      boxTop(g, Math.min(ax, bx2), Math.min(ay, by2) - 0.08, Math.max(ax, bx2), Math.max(ay, by2), 6, 'stone', '#b0aa9e');
    }
    const [tx, ty] = P(n * 0.25, n * 0.8, 0);
    const tree = g.createLinearGradient(tx - 3, 0, tx + 3, 0);
    tree.addColorStop(0, '#4c7a3a');
    tree.addColorStop(1, '#1e3a1a');
    g.fillStyle = tree;
    g.beginPath();
    g.ellipse(tx, ty - 12, 3.4, 12, 0, 0, Math.PI * 2);
    g.fill();
    flag(g, 0.4, 0.4, 40, team, 0.8);
  },
  blacksmith: (g, n, team) => {
    groundPatch(g, n, '#6f6150', 0.2);
    // Stone forge with a tall chimney; the open front shows the glowing hearth and anvil.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.6, 50);
    box(g, 0.2, 0.2, n - 0.2, n * 0.6, 26, STONE, {
      left: (len) => {
        // Open forge bay with a fire glow.
        g.fillStyle = '#140b05';
        g.fillRect(len * 0.18, 0, len * 0.42, 15);
        const glow = g.createRadialGradient(len * 0.39, 4, 0.5, len * 0.39, 4, 9);
        glow.addColorStop(0, 'rgba(255,190,80,0.95)');
        glow.addColorStop(0.4, 'rgba(255,90,20,0.6)');
        glow.addColorStop(1, 'rgba(255,60,10,0)');
        g.fillStyle = glow;
        g.fillRect(len * 0.18, 0, len * 0.42, 15);
        g.fillStyle = mat(g, 'woodH', '#4a3019', 111);
        g.fillRect(len * 0.16, 15, len * 0.46, 2);
        windowAt(g, len * 0.8, 12, 4, 5);
        banner(g, len * 0.08, 22, team);
      },
      right: (len) => windowAt(g, len / 2, 12, 4, 5),
    }, 113);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.6, 26, 18, SHINGLE, 'x', 0.15, 29);
    box(g, n - 0.85, 0.35, n - 0.45, 0.75, 62, STONE, {}, 115);
    boxTop(g, n - 0.85, 0.35, n - 0.45, 0.75, 62, 'stone', '#3c3833');
    const [cx, cy] = P(n - 0.65, 0.55, 64);
    for (let k = 0; k < 4; k++) {
      const sm = g.createRadialGradient(cx + k * 2.5, cy - k * 6, 0, cx + k * 2.5, cy - k * 6, 4 + k * 1.6);
      sm.addColorStop(0, `rgba(70,68,66,${0.45 - k * 0.09})`);
      sm.addColorStop(1, 'rgba(70,68,66,0)');
      g.fillStyle = sm;
      g.beginPath();
      g.arc(cx + k * 2.5, cy - k * 6, 4 + k * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // Anvil on a stump, quench barrel and a rack of blades in the yard.
    const [ax, ay] = P(n * 0.45, n * 0.8, 0);
    g.fillStyle = 'rgba(8,12,4,0.35)';
    g.beginPath();
    g.ellipse(ax + 2, ay, 5, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = mat(g, 'woodV', '#5a3a1c', 117);
    g.fillRect(ax - 2.4, ay - 6, 4.8, 6);
    const anvil = g.createLinearGradient(ax - 5, 0, ax + 5, 0);
    anvil.addColorStop(0, '#8a9296');
    anvil.addColorStop(1, '#2e3336');
    g.fillStyle = anvil;
    g.beginPath();
    g.moveTo(ax - 5.5, ay - 9.5);
    g.lineTo(ax + 4, ay - 9.5);
    g.quadraticCurveTo(ax + 7, ay - 9, ax + 7.5, ay - 8);
    g.lineTo(ax + 2, ay - 7.6);
    g.lineTo(ax + 1.5, ay - 6);
    g.lineTo(ax - 2.5, ay - 6);
    g.lineTo(ax - 3, ay - 7.6);
    g.lineTo(ax - 5.5, ay - 8);
    g.closePath();
    g.fill();
    barrel(g, n * 0.7, n * 0.85, 3, 7);
    for (let k = 0; k < 4; k++) line3(g, [n * 0.12 + k * 0.08, n * 0.85, 0], [n * 0.12 + k * 0.08, n * 0.85, 14], k % 2 ? '#c9d1d6' : '#aab3b8', 0.9);
    line3(g, [n * 0.08, n * 0.85, 11], [n * 0.42, n * 0.85, 11], '#4e331b', 1.1);
    flag(g, 0.3, 0.3, 32, team, 0.8);
  },
  market: (g, n, team) => {
    groundPatch(g, n, '#8a7254', 0.25);
    // Three striped stalls around a small square, heaped with produce.
    const stall = (x0: number, y0: number, x1: number, y1: number, goods: string[]) => {
      boxShadow(g, x0, y0, x1, y1, 26);
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) post(g, x, y, 15, 1.8);
      // Counter with goods.
      box(g, x0 + 0.05, y1 - 0.2, x1 - 0.05, y1, 6, { base: '#7a5634', mat: 'planks' }, {}, 121);
      for (let k = 0; k < goods.length * 4; k++) {
        const t = (k + 0.5) / (goods.length * 4);
        const [gx, gy] = P(x0 + 0.1 + (x1 - x0 - 0.2) * t, y1 - 0.1, 6.5);
        const c = goods[k % goods.length];
        const ball = g.createRadialGradient(gx - 0.5, gy - 0.8, 0.1, gx, gy - 0.5, 1.6);
        ball.addColorStop(0, shadeColor(c, 1.35));
        ball.addColorStop(1, shadeColor(c, 0.65));
        g.fillStyle = ball;
        g.beginPath();
        g.arc(gx, gy - 0.6, 1.3, 0, Math.PI * 2);
        g.fill();
      }
      hipRoof(g, x0, y0, x1, y1, 15, 9, { color: '#efe4c8', kind: 'canvas', trim: team }, 0.08);
      // Awning stripes in the team colour.
      for (let k = 1; k < 4; k++) {
        const f = k / 4;
        line3(g, [x0 + (x1 - x0) * f, y1 + 0.08, 15], [x0 + (x1 - x0) * f, (y0 + y1) / 2, 24], shadeColor(team, 1.1), 1.4);
      }
    };
    stall(0.15, 0.2, n * 0.48, n * 0.42, ['#c4392b', '#e8a33a']);
    stall(n * 0.55, 0.2, n - 0.15, n * 0.42, ['#6f9a3a', '#d8c36a']);
    stall(n * 0.55, n * 0.55, n - 0.15, n * 0.8, ['#8a4a8a', '#c4392b']);
    // Sacks, a barrel and crates in the square.
    sack(g, n * 0.25, n * 0.7);
    sack(g, n * 0.35, n * 0.78, 0.85);
    barrel(g, n * 0.15, n * 0.85, 3, 7.5);
    crate(g, n * 0.3, n * 0.52, 0.3);
    flag(g, n * 0.1, n * 0.1, 30, team, 0.9);
  },
  university: (g, n, team) => {
    groundPatch(g, n, '#8c8068', 0.2);
    // A dressed-stone hall with tall arched windows and a domed observatory.
    boxShadow(g, 0.25, 0.25, n - 0.25, n * 0.62, 70);
    box(g, 0.25, 0.25, n - 0.25, n * 0.62, 32, { base: '#b5ae9f', mat: 'stone', plinth: 5 }, {
      left: (len) => {
        doorAt(g, len / 2, 8, 14);
        for (const u of [len * 0.15, len * 0.3, len * 0.7, len * 0.85]) {
          g.fillStyle = '#1a120a';
          g.beginPath();
          g.moveTo(u - 2.4, 9);
          g.lineTo(u - 2.4, 21);
          g.arc(u, 21, 2.4, Math.PI, 0, true);
          g.lineTo(u + 2.4, 9);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,215,140,0.25)';
          g.fill();
        }
        banner(g, len * 0.5, 30, team);
      },
      right: (len) => {
        for (const u of [len * 0.3, len * 0.7]) windowAt(g, u, 14, 3.5, 7);
      },
    }, 131);
    gableRoof(g, 0.25, 0.25, n - 0.25, n * 0.62, 32, 20, SHINGLE, 'x', 0.15, 33);
    // Observatory drum and dome at the east end.
    const dx = n - 0.75, dy = n * 0.45;
    box(g, dx - 0.35, dy - 0.35, dx + 0.35, dy + 0.35, 58, { base: '#bdb6a7', mat: 'stone' }, { left: (len) => windowAt(g, len / 2, 44, 3, 6), right: (len) => windowAt(g, len / 2, 44, 3, 6) }, 133);
    const [cx, cy] = P(dx, dy, 58);
    const dome = g.createRadialGradient(cx - 5, cy - 8, 1, cx, cy - 3, 16);
    dome.addColorStop(0, ORNATE ? '#f2d27a' : '#a8c4c0');
    dome.addColorStop(1, ORNATE ? '#8a6a1c' : '#3e5a58');
    g.fillStyle = dome;
    g.beginPath();
    g.ellipse(cx, cy - 2, 22.4 / 2, 15, 0, Math.PI, 0);
    g.lineTo(cx + 11.2, cy);
    g.ellipse(cx, cy, 11.2, 5.6, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,30,30,0.5)';
    g.lineWidth = 0.6;
    for (const k of [-0.5, 0, 0.5]) {
      g.beginPath();
      g.moveTo(cx + k * 11, cy + 2.8 * Math.cos(k));
      g.quadraticCurveTo(cx + k * 6, cy - 12, cx, cy - 17);
      g.stroke();
    }
    g.fillStyle = '#d9b44a';
    g.fillRect(cx - 0.6, cy - 22, 1.2, 5);
    flag(g, 0.4, 0.4, 38, team, 0.8);
  },
  palisade_wall: (g, _n, _team, rng, v) => palisade(g, v, rng),
  palisade_gate: (g, _n, _team, rng, v) => palisadeGate(g, v, rng),
  stone_wall: (g, _n, _team, rng, v) => stoneWall(g, v, rng),
  gate: (g, _n, team, rng, v) => stoneGate(g, v, team, rng),
  watch_tower: (g, _n, team, rng, v) => tower(g, v, team, rng),
  castle: (g, n, team) => {
    const st = { base: ORNATE ? '#bcb5a6' : '#a49e92', mat: 'stone' as const };
    groundPatch(g, n, '#7d7060', 0.3);
    boxShadow(g, 0.2, 0.2, n - 0.2, n - 0.2, 100);
    // Curtain walls with a gatehouse, a great keep in the ward, round-shouldered corner towers.
    const T = 0.85;
    const corner = (x: number, y: number) => {
      box(g, x, y, x + T, y + T, 54, st, { left: (len) => { g.fillStyle = '#140c06'; g.fillRect(len / 2 - 1, 30, 2, 7); } }, 61);
      boxTop(g, x, y, x + T, y + T, 54, 'stone', '#8e897e');
      crenels(g, x - 0.04, y - 0.04, x + T + 0.04, y + T + 0.04, 54, st, 0.14, 63);
    };
    corner(0.15, 0.15);
    box(g, 0.4, 0.3, n - 0.4, 0.75, 36, st, {}, 65);
    boxTop(g, 0.4, 0.3, n - 0.4, 0.75, 36, 'stone', '#8e897e');
    box(g, 0.3, 0.4, 0.75, n - 0.4, 36, st, {}, 67);
    boxTop(g, 0.3, 0.4, 0.75, n - 0.4, 36, 'stone', '#8e897e');
    corner(n - 0.15 - T, 0.15);
    corner(0.15, n - 0.15 - T);
    // The keep.
    box(g, 1.15, 1.15, n - 1.15, n - 1.15, 76, st, {
      left: (len) => {
        for (const u of [len * 0.3, len * 0.7]) {
          g.fillStyle = '#140c06';
          g.fillRect(u - 1.2, 40, 2.4, 8);
          g.fillRect(u - 1.2, 58, 2.4, 8);
        }
        banner(g, len / 2, 72, team);
      },
      right: (len) => {
        for (const u of [len * 0.3, len * 0.7]) {
          g.fillStyle = '#140c06';
          g.fillRect(u - 1.2, 50, 2.4, 8);
        }
      },
    }, 69);
    boxTop(g, 1.15, 1.15, n - 1.15, n - 1.15, 76, 'stone', '#8e897e');
    crenels(g, 1.1, 1.1, n - 1.1, n - 1.1, 76, st, 0.16, 71);
    flag(g, n / 2, n / 2, 76, team, 1.4);
    // Front curtain walls with the gatehouse, then the front corner tower.
    box(g, n - 0.75, 0.4, n - 0.3, n - 0.4, 36, st, {}, 73);
    boxTop(g, n - 0.75, 0.4, n - 0.3, n - 0.4, 36, 'stone', '#8e897e');
    crenels(g, n - 0.78, 0.4, n - 0.27, n - 0.4, 36, st, 0.14, 75);
    box(g, 0.4, n - 0.75, n - 0.4, n - 0.3, 36, st, {
      left: (len) => {
        doorAt(g, len / 2, 12, 20);
        banner(g, len * 0.25, 32, team);
        banner(g, len * 0.75, 32, team);
      },
    }, 77);
    boxTop(g, 0.4, n - 0.75, n - 0.4, n - 0.3, 36, 'stone', '#8e897e');
    crenels(g, 0.4, n - 0.78, n - 0.4, n - 0.27, 36, st, 0.14, 79);
    corner(n - 0.15 - T, n - 0.15 - T);
  },
  siege_workshop: (g, n, team) => {
    groundPatch(g, n, '#7a6448', 0.25);
    // A tall open-fronted timber shed with a wheel and beams in the yard and a hoisting crane.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.62, 60);
    box(g, 0.2, 0.2, n - 0.2, n * 0.62, 34, { base: '#7a5634', mat: 'planks', plinth: Math.max(PLASTER.plinth ?? 0, 4) }, {
      left: (len) => {
        g.fillStyle = '#140c06';
        g.fillRect(len * 0.15, 0, len * 0.5, 26);
        g.fillStyle = mat(g, 'woodH', '#4a3019', 141);
        g.fillRect(len * 0.13, 26, len * 0.54, 2.4);
        // A half-built ram frame glimpsed inside.
        g.strokeStyle = '#8a6038';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(len * 0.2, 2);
        g.lineTo(len * 0.35, 16);
        g.lineTo(len * 0.5, 2);
        g.moveTo(len * 0.25, 8);
        g.lineTo(len * 0.45, 8);
        g.stroke();
        banner(g, len * 0.82, 30, team);
      },
      right: (len) => windowAt(g, len / 2, 16, 4, 5),
    }, 143);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.62, 34, 22, SHINGLE, 'x', 0.18, 35);
    // Spare wheel leaning on the wall and stacked beams.
    const [wx, wy] = P(n * 0.85, n * 0.68, 7);
    g.strokeStyle = '#4e331b';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(wx, wy, 4, 7, -0.4, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.7;
    for (let a = 0; a < 3; a++) {
      g.beginPath();
      g.moveTo(wx + Math.cos(a) * 3.6, wy + Math.sin(a) * 6.4);
      g.lineTo(wx - Math.cos(a) * 3.6, wy - Math.sin(a) * 6.4);
      g.stroke();
    }
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) log(g, [n * 0.15 + k * 0.15 + r * 0.075, n * 0.72], [n * 0.15 + k * 0.15 + r * 0.075, n - 0.05], 1.6 + r * 2.9, 1.5);
    // Crane: a mast, jib and hook.
    line3(g, [n * 0.62, n * 0.85, 0], [n * 0.62, n * 0.85, 44], '#5a3d22', 1.8);
    line3(g, [n * 0.62, n * 0.85, 42], [n * 0.95, n * 0.85, 34], '#5a3d22', 1.4);
    line3(g, [n * 0.93, n * 0.85, 34], [n * 0.93, n * 0.85, 20], 'rgba(200,180,140,0.8)', 0.5);
    flag(g, n - 0.25, 0.25, 40, team, 0.9);
  },
};

/** Building sprites for one zoom level, cached per type, player and variant. */
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
    BANNER = BANNERS[player] ?? 'swallowtail';
    PAINTERS[type](g, n, PLAYER_COLORS[player % PLAYER_COLORS.length], new Rng(n * 31 + type.length), variant);
    grade(c, 0.06, n * 97 + variant);
    // Anchor = footprint's north corner.
    return { c, ax: halfW * k, ay: RISE * k };
  }
}
