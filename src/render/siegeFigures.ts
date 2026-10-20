// Siege engines in figure space (ground at y = 0, a villager stands 100 tall,
// facing +x). Timber frames with iron fittings and hide or plank cladding,
// shaded with the same primitives as the soldiers.
import { type FigureSpec, HANDLE, OUT, STEEL, STEEL_DARK, blob, limb, poly, roundLight, shade, stroke } from './figures';

type G = CanvasRenderingContext2D;
type P = [number, number];

const OAK = '#7a5430';
const OAK_DARK = '#4e331b';
const IRON = '#3a3634';

function shadow(g: G, rx: number, ry: number, dx = 6) {
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

/** A spoked wheel; `turn` spins it as the engine rolls. */
function wheel(g: G, x: number, y: number, r: number, turn: number, far = false) {
  const rim = far ? shade(OAK_DARK, 0.7) : OAK_DARK;
  blob(g, x, y, r, r, rim);
  blob(g, x, y, r * 0.78, r * 0.78, far ? shade(OAK, 0.6) : shade(OAK, 0.85), 0, false);
  g.strokeStyle = far ? '#2a1a0c' : OAK_DARK;
  g.lineWidth = Math.max(1, r * 0.16);
  for (let k = 0; k < 6; k++) {
    const a = turn + (k * Math.PI) / 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    g.stroke();
  }
  g.strokeStyle = IRON;
  g.lineWidth = Math.max(1, r * 0.14);
  g.beginPath();
  g.arc(x, y, r * 0.95, 0, Math.PI * 2);
  g.stroke();
  blob(g, x, y, r * 0.2, r * 0.2, IRON, 0, false);
}

/** A squared beam from a to b. */
function beam(g: G, a: P, b: P, w: number, color = OAK) {
  limb(g, a, b, w, color, 1);
}

/** Plank cladding over a polygon, with seams and iron straps. */
function planks(g: G, pts: P[], color: string, horizontal = true) {
  poly(g, pts, color);
  g.save();
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  g.strokeStyle = 'rgba(20,10,4,0.45)';
  g.lineWidth = 0.8;
  if (horizontal) for (let y = y0 + 6; y < y1; y += 6) (g.beginPath(), g.moveTo(x0, y), g.lineTo(x1, y), g.stroke());
  else for (let x = x0 + 6; x < x1; x += 6) (g.beginPath(), g.moveTo(x, y0), g.lineTo(x, y1), g.stroke());
  g.restore();
}

const spin = (f: FigureSpec) => (f.anim === 'walk' ? (f.frame / 6) * Math.PI * 2 : 0);

// ---------- ram ----------

export function drawRam(g: G, f: FigureSpec): void {
  shadow(g, 62, 10);
  const t = spin(f);
  // Far wheels, then the shed.
  wheel(g, -34, -14, 13, t, true);
  wheel(g, 30, -14, 13, t, true);
  // The swinging log, hung in chains, iron-capped when upgraded.
  const swing = f.anim === 'work' ? [-10, 0, 12, 4][f.frame % 4] : 0;
  const logY = -34;
  stroke(g, [-10, -66], [-14 + swing * 0.3, logY], 0.8, '#5a5a5a');
  stroke(g, [18, -66], [16 + swing * 0.3, logY], 0.8, '#5a5a5a');
  beam(g, [-58 + swing, logY], [62 + swing, logY], 11, '#6b4626');
  if (f.elite) poly(g, [[60 + swing, logY - 8], [76 + swing, logY - 6], [80 + swing, logY], [76 + swing, logY + 6], [60 + swing, logY + 8]], STEEL_DARK);
  else blob(g, 63 + swing, logY, 6, 6.5, '#d9b27a');
  // Frame and the hide-covered gable roof.
  for (const x of [-50, -16, 18, 50]) beam(g, [x, -16], [x * 0.85, -62], 4.5);
  beam(g, [-54, -18], [54, -18], 5, OAK_DARK);
  const roof: P[] = [[-62, -54], [-8, -86], [58, -54], [52, -48], [-56, -48]];
  poly(g, roof, '#8a6038');
  g.save();
  g.beginPath();
  roof.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  // Stitched hides.
  for (let k = -4; k <= 4; k++) {
    g.fillStyle = k % 2 ? 'rgba(60,35,15,0.25)' : 'rgba(200,160,110,0.15)';
    g.beginPath();
    g.moveTo(-8 + k * 14, -88);
    g.lineTo(-8 + k * 14 - 30, -46);
    g.lineTo(-8 + k * 14 - 16, -46);
    g.lineTo(-8 + k * 14 + 14, -88);
    g.fill();
  }
  g.restore();
  // Team cloth hanging at the back.
  poly(g, [[-60, -50], [-48, -50], [-48, -30], [-54, -34], [-60, -30]], f.team);
  wheel(g, -30, -12, 14, t);
  wheel(g, 34, -12, 14, t);
}

// ---------- mangonel ----------

export function drawMangonel(g: G, f: FigureSpec): void {
  shadow(g, 52, 9);
  const t = spin(f);
  wheel(g, -28, -10, 10, t, true);
  wheel(g, 28, -10, 10, t, true);
  beam(g, [-46, -16], [46, -16], 9, OAK_DARK);
  // Uprights and crossbar stop.
  beam(g, [6, -18], [10, -58], 6);
  beam(g, [-10, -18], [10, -58], 5, shade(OAK, 0.85));
  beam(g, [2, -58], [18, -58], 5, OAK_DARK);
  // Torsion skein and the arm: back at rest, slamming up against the bar when it throws.
  blob(g, -14, -24, 7, 7, '#b8a07a');
  const ang = f.anim === 'work' ? [-150, -120, -20, -35][f.frame % 4] : -150;
  const a = (ang * Math.PI) / 180;
  const tip: P = [-14 + Math.cos(a) * 54, -24 + Math.sin(a) * 54];
  beam(g, [-14, -24], tip, 5, HANDLE);
  // Bucket, with a stone in it until the throw.
  blob(g, tip[0], tip[1], 7, 5, OAK_DARK);
  if (f.anim !== 'work' || f.frame % 4 < 2) blob(g, tip[0], tip[1] - 4, 5, 5, '#8a857c');
  wheel(g, -24, -8, 11, t);
  wheel(g, 32, -8, 11, t);
}

// ---------- scorpion ----------

export function drawScorpion(g: G, f: FigureSpec): void {
  shadow(g, 40, 8);
  // Tripod.
  beam(g, [-22, -1], [0, -38], 4.5);
  beam(g, [22, -1], [0, -38], 4.5);
  beam(g, [-4, -2], [0, -38], 4, shade(OAK, 0.7));
  // Stock, bow arms and string; the string snaps forward on loosing.
  const drawn = f.anim !== 'work' || f.frame % 4 !== 2;
  beam(g, [-28, -42], [36, -38], 6, OAK_DARK);
  const bowX = 26;
  const sx = drawn ? -16 : bowX - 4;
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(bowX - 6, -64);
  g.quadraticCurveTo(bowX + 8, -40, bowX - 6, -14);
  g.stroke();
  g.strokeStyle = '#8a6038';
  g.lineWidth = 3.4;
  g.stroke();
  g.strokeStyle = 'rgba(230,225,210,0.9)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(bowX - 6, -64);
  g.lineTo(sx, -40);
  g.lineTo(bowX - 6, -14);
  g.stroke();
  if (drawn) {
    beam(g, [sx, -40], [bowX + 18, -40], 2.2, '#4a3019');
    poly(g, [[bowX + 18, -42.5], [bowX + 26, -40], [bowX + 18, -37.5]], STEEL);
  }
  // Winch.
  blob(g, -26, -42, 4, 4, IRON);
  poly(g, [[-30, -48], [-22, -48], [-20, -44], [-32, -44]], f.team);
}

// ---------- siege tower ----------

export function drawSiegeTower(g: G, f: FigureSpec): void {
  shadow(g, 46, 10);
  const t = spin(f);
  wheel(g, -24, -10, 10, t, true);
  wheel(g, 24, -10, 10, t, true);
  // Planked tower, tapering, with a hide-clad front.
  planks(g, [[-34, -16], [34, -16], [28, -170], [-28, -170]], '#7a5634');
  planks(g, [[18, -16], [34, -16], [28, -170], [14, -170]], shade('#7a5634', 0.75), false);
  for (const y of [-56, -100, -144]) beam(g, [-32, y], [32, y], 4, OAK_DARK);
  for (const x of [-30, 30]) beam(g, [x, -16], [x * 0.93, -170], 4, OAK_DARK);
  // Ladder rungs inside the open back.
  for (let y = -30; y > -160; y -= 12) stroke(g, [-24, y], [-12, y], 1.4, '#3a2412');
  // Drawbridge at the top, raised (lowered while unloading).
  const down = f.anim === 'work';
  beam(g, [28, -150], down ? [62, -146] : [40, -184], 5, '#8a6038');
  // Battlements and the team banner on top.
  for (let x = -26; x <= 22; x += 12) poly(g, [[x, -170], [x + 7, -170], [x + 7, -180], [x, -180]], '#6b4a2a');
  beam(g, [0, -180], [0, -214], 2.2, HANDLE);
  poly(g, [[1, -214], [20, -209], [1, -202]], f.team);
  wheel(g, -20, -8, 11, t);
  wheel(g, 28, -8, 11, t);
}

// ---------- trebuchet ----------

export function drawTrebuchet(g: G, f: FigureSpec): void {
  const t = spin(f);
  if (f.packed !== false) {
    // Packed for the road: the beam folded along a long wagon.
    shadow(g, 76, 10);
    wheel(g, -50, -12, 12, t, true);
    wheel(g, 50, -12, 12, t, true);
    planks(g, [[-72, -22], [72, -22], [70, -34], [-70, -34]], OAK_DARK);
    beam(g, [-86, -42], [92, -46], 7, HANDLE);
    poly(g, [[-40, -36], [-10, -36], [-12, -58], [-38, -58]], '#6b4a2a');
    poly(g, [[-38, -58], [-12, -58], [-14, -64], [-36, -64]], f.team);
    blob(g, 92, -46, 4, 4, IRON);
    wheel(g, -46, -10, 13, t);
    wheel(g, 54, -10, 13, t);
    return;
  }
  shadow(g, 70, 12);
  // A-frame on a heavy base.
  beam(g, [-62, -6], [62, -6], 10, OAK_DARK);
  for (const [x0, x1] of [[-44, -4], [40, 4], [-30, -2], [30, 2]] as const) beam(g, [x0, -8], [x1, -138], 7, x0 < -35 || x0 > 35 ? OAK : shade(OAK, 0.8));
  beam(g, [-40, -70], [40, -70], 5, OAK_DARK);
  // The arm: counterweight down at rest, swinging the long end over to throw.
  const ang = f.anim === 'work' ? [200, 230, 300, 280][f.frame % 4] : 200;
  const a = (ang * Math.PI) / 180;
  const pivot: P = [0, -138];
  const long: P = [pivot[0] + Math.cos(a) * 96, pivot[1] - Math.sin(a) * 96];
  const short: P = [pivot[0] - Math.cos(a) * 30, pivot[1] + Math.sin(a) * 30];
  beam(g, short, long, 7, HANDLE);
  // Counterweight box hanging from the short end.
  stroke(g, short, [short[0], short[1] + 12], 1.6, IRON);
  planks(g, [[short[0] - 16, short[1] + 12], [short[0] + 16, short[1] + 12], [short[0] + 13, short[1] + 40], [short[0] - 13, short[1] + 40]], '#5a3a1c', false);
  // Sling and boulder at the long end.
  const sling: P = [long[0] + 8, long[1] + 26];
  stroke(g, long, sling, 0.9, '#d8c9a0');
  if (f.anim !== 'work' || f.frame % 4 < 2) blob(g, sling[0], sling[1], 7, 6.5, '#8a857c');
  blob(g, pivot[0], pivot[1], 5, 5, IRON);
  poly(g, [[-62, -16], [-50, -16], [-50, -30], [-56, -26], [-62, -30]], f.team);
}

export { roundLight };
