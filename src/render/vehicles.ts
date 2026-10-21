// Modern ground vehicles, drawn in figure space (ground at y = 0, +x the
// direction of travel in side view). The fast and armoured units (buggy, tank,
// technical, super-heavy tank) also have front and back views; the heavy
// weapons (dozer, howitzer, gun truck, assault bridge, missile launcher) are
// only ever drawn side-on, like the siege engines they replace.
import { type FigureSpec, type G, type P, blob, limb, poly, shade, stroke, OUT } from './figures';

const RUBBER = '#1d1f22';
const STEEL_D = '#3a3f45';
const GLASS = '#203342';

/** Military paint for a player: their colour pulled toward olive drab, as hex. */
function paint(team: string, k = 0.5): string {
  const t = parseInt(team.slice(1), 16), o = [0x5d, 0x63, 0x44];
  const c = [(t >> 16) & 255, (t >> 8) & 255, t & 255].map((v, i) => Math.round(v * (1 - k) + o[i] * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function shadow(g: G, rx: number, ry: number, dx = 6): void {
  const grad = g.createRadialGradient(dx, 0, 0, dx, 0, rx);
  grad.addColorStop(0, 'rgba(8,12,4,0.45)');
  grad.addColorStop(1, 'rgba(8,12,4,0)');
  g.save();
  g.scale(1, ry / rx);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(dx, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** An off-road tyre with a rim and hub; `turn` spins the tread blocks. */
function tyre(g: G, x: number, y: number, r: number, turn: number, far = false): void {
  blob(g, x, y, r, r, far ? '#141517' : RUBBER);
  g.strokeStyle = far ? 'rgba(80,80,80,0.4)' : 'rgba(110,110,110,0.55)';
  g.lineWidth = r * 0.16;
  for (let k = 0; k < 10; k++) {
    const a = turn + (k / 10) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    g.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
    g.stroke();
  }
  blob(g, x, y, r * 0.55, r * 0.55, far ? '#3a3e42' : '#6b7177');
  blob(g, x, y, r * 0.18, r * 0.18, '#2a2e32', 0, false);
  for (let k = 0; k < 5; k++) {
    const a = turn * 1 + (k / 5) * Math.PI * 2;
    blob(g, x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, r * 0.06, r * 0.06, '#202326', 0, false);
  }
}

/** A tank track from x0 to x1: road wheels, sprocket and idler, with links that crawl with `phase`. */
function track(g: G, x0: number, x1: number, h: number, phase: number, far = false): void {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x0 + r, 0);
  g.lineTo(x1 - r, 0);
  g.arc(x1 - r, -r, r, Math.PI / 2, -Math.PI / 2, true);
  g.lineTo(x0 + r * 1.2, -h);
  g.arc(x0 + r, -r, r, -Math.PI / 2, Math.PI / 2, true);
  g.closePath();
  g.fillStyle = far ? '#121315' : '#202225';
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.2;
  g.stroke();
  // Links along the top and bottom runs.
  g.strokeStyle = far ? 'rgba(90,90,90,0.25)' : 'rgba(140,140,140,0.45)';
  g.lineWidth = 1.2;
  const step = 4.5;
  for (let x = x0 + r + (phase % step); x < x1 - r; x += step) {
    g.beginPath();
    g.moveTo(x, -0.2);
    g.lineTo(x, -2.4);
    g.moveTo(x1 - (x - x0), -h + 0.2);
    g.lineTo(x1 - (x - x0), -h + 2.4);
    g.stroke();
  }
  if (far) return;
  const n = Math.max(3, Math.round((x1 - x0 - h) / (h * 0.62)));
  for (let k = 0; k <= n; k++) {
    const x = x0 + r + ((x1 - x0 - h) * k) / n;
    blob(g, x, -r * 0.82, r * 0.62, r * 0.62, '#4d535a');
    blob(g, x, -r * 0.82, r * 0.22, r * 0.22, '#2a2e32', 0, false);
  }
  // Drive sprocket with teeth.
  blob(g, x1 - r, -r, r * 0.72, r * 0.72, '#3e444a');
  for (let k = 0; k < 8; k++) {
    const a = phase * 0.3 + (k / 8) * Math.PI * 2;
    blob(g, x1 - r + Math.cos(a) * r * 0.62, -r + Math.sin(a) * r * 0.62, r * 0.1, r * 0.1, '#202326', 0, false);
  }
}

function muzzleFlash(g: G, x: number, y: number, s: number, dir = 1): void {
  const r = 9 * s;
  const glow = g.createRadialGradient(x, y, 0, x, y, r * 1.8);
  glow.addColorStop(0, 'rgba(255,255,230,1)');
  glow.addColorStop(0.3, 'rgba(255,210,80,0.95)');
  glow.addColorStop(1, 'rgba(255,110,20,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + dir * r * 0.7, y - r * 0.6);
  g.lineTo(x + dir * r * 0.65, y - r * 0.12);
  g.lineTo(x + dir * r * 1.9, y);
  g.lineTo(x + dir * r * 0.65, y + r * 0.12);
  g.lineTo(x + dir * r * 0.7, y + r * 0.6);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(x + dir * r * 0.35, y, r * 0.55, 0, Math.PI * 2);
  g.fill();
}

/** A puff of grey gun smoke. */
function smoke(g: G, x: number, y: number, s: number, a = 0.5): void {
  for (const [dx, dy, r] of [[0, 0, 5], [5, -3, 4], [-4, -4, 4.5], [2, -7, 3.5]]) blob(g, x + dx * s, y + dy * s, r * s, r * s, `rgba(200,200,195,${a})`, 0, false);
}

/** Helmeted crew head poking out of a hatch. */
function crewHead(g: G, x: number, y: number, skin: string, team: string): void {
  blob(g, x, y, 4.6, 4.8, skin);
  blob(g, x - 0.5, y - 3, 5.4, 3.6, '#4f5340');
  g.fillStyle = team;
  g.fillRect(x - 3, y - 4.5, 3, 1.6);
  g.fillStyle = 'rgba(20,24,30,0.9)';
  g.fillRect(x + 1.5, y - 1, 3.2, 1.6);
}

/** A whip antenna with a small team pennant. */
function antenna(g: G, x: number, y: number, h: number, team: string): void {
  stroke(g, [x, y], [x - 3, y - h], 0.8, '#1a1c1e');
  poly(g, [[x - 3, y - h], [x - 3 - 8, y - h + 2], [x - 3, y - h + 4]], team, false);
}

/** Team roundel/ID marker: a bright chevron on armour. */
function chevron(g: G, x: number, y: number, s: number, team: string): void {
  poly(g, [[x - 4 * s, y - 3 * s], [x, y + 1 * s], [x + 4 * s, y - 3 * s], [x + 4 * s, y], [x, y + 4 * s], [x - 4 * s, y]], shade(team, 1.15));
}

// ---------- battle tank and super-heavy ----------

function drawTank(g: G, f: FigureSpec, heavy: boolean): void {
  const moving = f.anim === 'walk';
  const firing = f.anim === 'work' && f.frame === 2;
  const recoil = f.anim === 'work' ? [0, 0, 7, 3][f.frame % 4] : 0;
  const bob = moving ? (f.frame % 2) * -0.8 : 0;
  const hull = paint(f.team, heavy ? 0.55 : 0.45);
  const L = heavy ? 64 : 56;
  shadow(g, f.view === 'side' ? L + 8 : 36, 9, 6);
  if (f.view === 'side') {
    const phase = moving ? f.frame * 1.5 : 0;
    track(g, -L + 2, L - 2, heavy ? 17 : 15, phase, true);
    g.save();
    g.translate(0, bob);
    // Lower hull with a sloped glacis, side skirts in team paint.
    const top = heavy ? -34 : -30;
    poly(g, [[-L, -14], [-L + 2, top], [L - 18, top], [L + 4, top + 10], [L, -14]], shade(hull, 0.8));
    poly(g, [[-L + 2, top + 2], [L - 8, top + 2], [L - 2, -12], [-L + 4, -12]], hull);
    // Skirt panels.
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.8;
    for (let x = -L + 14; x < L - 6; x += 14) stroke(g, [x, top + 3], [x, -13], 0.8, 'rgba(0,0,0,0.3)');
    if (heavy) {
      // Reactive armour bricks along the skirt.
      for (let x = -L + 6; x < L - 10; x += 8) poly(g, [[x, top + 4], [x + 6.5, top + 4], [x + 6.5, top + 10], [x, top + 10]], shade(hull, 1.1));
    }
    g.fillStyle = shade(f.team, 1.1);
    g.fillRect(-L + 4, -18, L * 2 - 14, 2.4);
    g.restore();
    track(g, -L + 4, L, heavy ? 17 : 15, phase);
    g.save();
    g.translate(0, bob);
    // Turret, low and angular, with the main gun.
    const tz = (heavy ? -34 : -30) - 1;
    const tx = heavy ? -4 : -2;
    const th = heavy ? 18 : 15;
    // Gun barrel first so the mantlet covers its root.
    const gx = tx + 22 - recoil, gy = tz - th * 0.55;
    const gl = heavy ? 64 : 58;
    limb(g, [gx, gy], [gx + gl, gy - 1.5], heavy ? 5.2 : 4.4, STEEL_D, 0.85);
    limb(g, [gx + gl * 0.55, gy - 0.8], [gx + gl * 0.7, gy - 1], heavy ? 7.2 : 6.4, STEEL_D, 1);
    if (heavy) limb(g, [gx + gl - 6, gy - 1.3], [gx + gl, gy - 1.5], 6.6, STEEL_D, 1);
    poly(g, [[tx - 26, tz], [tx - 24, tz - th], [tx + 12, tz - th - 1], [tx + 26, tz - th * 0.45], [tx + 24, tz]], hull);
    poly(g, [[tx - 30, tz - 2], [tx - 26, tz - th + 2], [tx - 20, tz - th + 2], [tx - 22, tz - 2]], shade(hull, 0.75));
    // Smoke dischargers, sights and the commander's hatch with a crewman.
    for (let k = 0; k < 3; k++) blob(g, tx + 16 + k * 2.5, tz - th + 1, 1.2, 1.2, STEEL_D, 0, false);
    poly(g, [[tx + 2, tz - th - 1], [tx + 9, tz - th - 1], [tx + 9, tz - th - 5], [tx + 2, tz - th - 5]], STEEL_D);
    blob(g, tx + 8.5, tz - th - 3, 1, 1.4, '#4aa3e0', 0, false);
    crewHead(g, tx - 9, tz - th - 4, f.look.skin, f.team);
    poly(g, [[tx - 15, tz - th - 1], [tx - 4, tz - th - 1], [tx - 4, tz - th + 1], [tx - 15, tz - th + 1]], shade(hull, 0.6));
    if (heavy) {
      // Remote weapon station.
      poly(g, [[tx - 22, tz - th - 1], [tx - 14, tz - th - 1], [tx - 14, tz - th - 7], [tx - 22, tz - th - 7]], STEEL_D);
      limb(g, [tx - 15, tz - th - 5], [tx - 2, tz - th - 5.5], 1.6, '#1d1f22');
    }
    chevron(g, tx - 6, tz - th * 0.5, 1.2, f.team);
    antenna(g, tx - 22, tz - th, heavy ? 30 : 26, f.team);
    if (firing) {
      muzzleFlash(g, gx + gl + 1, gy - 1.5, heavy ? 1.6 : 1.4);
      smoke(g, gx + gl + 10, gy - 4, 1.4, 0.45);
    } else if (f.anim === 'work' && f.frame === 3) smoke(g, gx + gl + 14, gy - 8, 1.6, 0.3);
    g.restore();
    return;
  }
  // Front and back: the hull end-on between its tracks, the turret above.
  const front = f.view === 'front';
  const w = heavy ? 34 : 30;
  for (const sx of [-1, 1]) {
    poly(g, [[sx * w - 6, 0], [sx * w + 6 * sx * 0 + 6, 0], [sx * w + 6, -16], [sx * w - 6, -16]].map(([x, y]) => [x, y] as P), '#202225');
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(140,140,140,0.4)';
      g.fillRect(sx * w - 5, -14 + k * 3.6 + (moving ? f.frame % 2 : 0) * 1.8, 10, 1.2);
    }
  }
  poly(g, [[-w + 4, -6], [w - 4, -6], [w - 2, heavy ? -32 : -28], [-w + 2, heavy ? -32 : -28]], shade(hull, front ? 0.9 : 0.75));
  if (front) {
    for (const sx of [-1, 1]) blob(g, sx * (w - 9), -12, 2, 1.6, '#f6f0c8');
    poly(g, [[-w + 2, heavy ? -32 : -28], [w - 2, heavy ? -32 : -28], [w - 6, heavy ? -38 : -34], [-w + 6, heavy ? -38 : -34]], hull);
  } else {
    // Engine deck grilles and exhausts.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = -2; k <= 2; k++) g.fillRect(k * 8 - 3, -26, 6, 14);
    poly(g, [[-w + 2, heavy ? -32 : -28], [w - 2, heavy ? -32 : -28], [w - 6, heavy ? -38 : -34], [-w + 6, heavy ? -38 : -34]], shade(hull, 0.8));
  }
  const tz = heavy ? -38 : -34;
  poly(g, [[-20, tz], [20, tz], [16, tz - 15], [-16, tz - 15]], hull);
  chevron(g, front ? -10 : 0, tz - 7, 1.1, f.team);
  if (front) {
    // The gun barrel end-on with its muzzle.
    blob(g, 0, tz - 8, 6, 6, STEEL_D);
    blob(g, 0, tz - 8, 3, 3, '#0c0d0e', 0, false);
    crewHead(g, 10, tz - 18, f.look.skin, f.team);
  } else {
    crewHead(g, -10, tz - 18, f.look.skin, f.team);
    poly(g, [[-18, tz - 13], [18, tz - 13], [18, tz - 9], [-18, tz - 9]], shade(hull, 0.7));
  }
  antenna(g, front ? -15 : 15, tz - 14, 24, f.team);
}

// ---------- recon buggy and technical ----------

function drawBuggy(g: G, f: FigureSpec, technical: boolean): void {
  const moving = f.anim === 'walk';
  const firing = f.anim === 'work' && f.frame === 2;
  const bob = moving ? [0, -1.2, -0.4, -1.4, 0, -0.8][f.frame % 6] : 0;
  const turn = moving ? f.frame * 0.9 : 0;
  const body = technical ? '#c9c2b0' : paint(f.team, 0.5);
  shadow(g, f.view === 'side' ? 52 : 30, 8, 5);
  if (f.view === 'side') {
    const wr = technical ? 10 : 11;
    const fx = technical ? 32 : 30, rx = technical ? -30 : -28;
    tyre(g, fx - 3, -wr, wr, turn, true);
    tyre(g, rx - 3, -wr, wr, turn, true);
    g.save();
    g.translate(0, bob);
    if (technical) {
      // Pickup: bonnet, cab, and an open bed with a gunner on a heavy MG.
      poly(g, [[-44, -14], [-44, -30], [-6, -30], [-6, -14]], shade(body, 0.92));
      poly(g, [[-6, -14], [-6, -46], [12, -46], [22, -32], [46, -30], [48, -14]], body);
      poly(g, [[-3, -44], [10, -44], [18, -33], [-3, -33]], GLASS);
      g.fillStyle = 'rgba(160,200,230,0.35)';
      g.fillRect(-1, -42, 3, 7);
      g.fillStyle = f.team;
      g.fillRect(-44, -24, 92, 3);
      chevron(g, 2, -24, 1, f.team);
      blob(g, 46, -24, 2, 1.6, '#f6f0c8');
      // Gunner standing in the bed behind a shield.
      const recoil = firing ? -2 : 0;
      limb(g, [-26, -30], [-26, -52], 3, STEEL_D, 1);
      crewHead(g, -30, -56, f.look.skin, f.team);
      poly(g, [[-22, -54], [-19, -54], [-19, -44], [-22, -44]], STEEL_D);
      limb(g, [-24 + recoil, -52], [0 + recoil, -53], 2.6, '#1d1f22', 1);
      poly(g, [[-28 + recoil, -55], [-20 + recoil, -55], [-20 + recoil, -49], [-28 + recoil, -49]], '#2a2d31');
      if (firing) muzzleFlash(g, 2, -53, 0.9);
      antenna(g, -42, -30, 20, f.team);
    } else {
      // Buggy: open tube frame, roll cage, two crew and a pintle MG.
      poly(g, [[-40, -12], [-42, -24], [38, -26], [44, -16], [40, -12]], body);
      limb(g, [-30, -24], [-24, -50], 2.4, '#2a2d31', 1);
      limb(g, [-24, -50], [10, -50], 2.4, '#2a2d31', 1);
      limb(g, [10, -50], [24, -26], 2.4, '#2a2d31', 1);
      limb(g, [-6, -24], [-4, -50], 2.2, '#2a2d31', 1);
      crewHead(g, 4, -36, f.look.skin, f.team);
      crewHead(g, -16, -40, f.look.skin, f.team);
      const recoil = firing ? -2 : 0;
      limb(g, [-20 + recoil, -54], [8 + recoil, -55], 2.2, '#1d1f22', 1);
      poly(g, [[-24 + recoil, -57], [-16 + recoil, -57], [-16 + recoil, -52], [-24 + recoil, -52]], '#2a2d31');
      if (firing) muzzleFlash(g, 10, -55, 0.8);
      if (f.elite) {
        // Strike buggy: a missile pod over the cage.
        poly(g, [[-10, -60], [8, -60], [8, -53], [-10, -53]], shade(f.team, 0.7));
        for (const dx of [-6, -1, 4]) blob(g, 8, -56.5 + (dx % 2), 1.4, 1.4, '#e8d38a', 0, false);
      }
      g.fillStyle = shade(f.team, 1.1);
      g.fillRect(-40, -18, 80, 2.4);
      blob(g, 40, -20, 2, 1.6, '#f6f0c8');
      antenna(g, -26, -50, 18, f.team);
    }
    g.restore();
    tyre(g, fx, -wr, wr, turn);
    tyre(g, rx, -wr, wr, turn);
    return;
  }
  const front = f.view === 'front';
  const w = 26;
  for (const sx of [-1, 1]) {
    poly(g, [[sx * w - 5, 0], [sx * w + 5, 0], [sx * w + 5, -20], [sx * w - 5, -20]], RUBBER);
    g.fillStyle = 'rgba(110,110,110,0.45)';
    for (let k = 0; k < 4; k++) g.fillRect(sx * w - 4, -18 + k * 5 + (moving ? (f.frame % 2) * 2.5 : 0), 8, 1.2);
  }
  g.save();
  g.translate(0, bob);
  if (technical) {
    poly(g, [[-w + 2, -12], [w - 2, -12], [w - 2, -30], [-w + 2, -30]], shade(body, front ? 0.95 : 0.8));
    poly(g, [[-w + 4, -30], [w - 4, -30], [w - 8, -46], [-w + 8, -46]], front ? GLASS : shade(body, 0.85));
    if (front) for (const sx of [-1, 1]) blob(g, sx * (w - 7), -20, 2.6, 2, '#f6f0c8');
    g.fillStyle = f.team;
    g.fillRect(-w + 2, -24, w * 2 - 4, 3);
    crewHead(g, 0, -56, f.look.skin, f.team);
    poly(g, [[-7, -54], [7, -54], [7, -46], [-7, -46]], STEEL_D);
  } else {
    poly(g, [[-w + 2, -10], [w - 2, -10], [w - 4, -24], [-w + 4, -24]], shade(body, front ? 0.95 : 0.8));
    limb(g, [-w + 6, -24], [-w + 10, -50], 2.4, '#2a2d31', 1);
    limb(g, [w - 6, -24], [w - 10, -50], 2.4, '#2a2d31', 1);
    limb(g, [-w + 10, -50], [w - 10, -50], 2.4, '#2a2d31', 1);
    crewHead(g, -8, -34, f.look.skin, f.team);
    crewHead(g, 8, -36, f.look.skin, f.team);
    if (front) for (const sx of [-1, 1]) blob(g, sx * (w - 8), -16, 2.4, 2, '#f6f0c8');
    g.fillStyle = shade(f.team, 1.1);
    g.fillRect(-w + 2, -14, w * 2 - 4, 2.4);
  }
  g.restore();
}

export const drawScout = (g: G, f: FigureSpec) => drawBuggy(g, f, false);
export const drawHorseArcher = (g: G, f: FigureSpec) => drawBuggy(g, f, true);
export const drawKnight = (g: G, f: FigureSpec) => drawTank(g, f, false);
export const drawIronBear = (g: G, f: FigureSpec) => drawTank(g, f, true);

// ---------- heavy weapons (side view only) ----------

/** Breaching dozer: an armoured bulldozer whose blade drives forward on the strike. */
export function drawRam(g: G, f: FigureSpec): void {
  const thrust = f.anim === 'work' ? [0, 3, 9, 5][f.frame % 4] : 0;
  const moving = f.anim === 'walk';
  const hull = paint(f.team, 0.4);
  shadow(g, 62, 8, 4);
  track(g, -46, 34, 18, moving ? f.frame * 1.5 : 0, true);
  // Engine bay and armoured cab with vision slits.
  poly(g, [[-50, -16], [-50, -40], [-8, -40], [-4, -16]], shade(hull, 0.9));
  poly(g, [[-8, -16], [-10, -62], [18, -62], [26, -40], [30, -16]], hull);
  poly(g, [[-6, -58], [14, -58], [19, -46], [-6, -46]], GLASS);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let k = 0; k < 3; k++) g.fillRect(-4 + k * 6, -53, 4, 1.4);
  poly(g, [[-46, -40], [-40, -48], [-28, -48], [-24, -40]], STEEL_D);
  limb(g, [-36, -48], [-36, -60], 3, '#2a2d31', 1);
  if (f.elite) for (let x = -48; x < 24; x += 9) poly(g, [[x, -36], [x + 7, -36], [x + 7, -28], [x, -28]], shade(hull, 1.12));
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-50, -22, 78, 3);
  chevron(g, 6, -30, 1.3, f.team);
  track(g, -44, 36, 18, moving ? f.frame * 1.5 : 0);
  // Push arms and the blade with its cutting edge.
  const bx = 44 + thrust;
  limb(g, [18, -12], [bx - 2, -14], 4, STEEL_D, 1);
  limb(g, [20, -30], [bx - 2, -24], 3.4, '#c99a26', 1);
  poly(g, [[bx - 4, 2], [bx + 6, 2], [bx + 10, -12], [bx + 6, -38], [bx - 4, -36], [bx - 1, -14]], '#555b62');
  stroke(g, [bx - 4, 2], [bx + 6, 2], 2, '#c0c6cb');
  for (let y = -32; y < -2; y += 6) stroke(g, [bx - 2, y], [bx + 7, y], 0.8, 'rgba(0,0,0,0.3)');
  if (f.anim === 'work' && f.frame === 2) {
    // Concrete dust where the blade bites.
    for (const [dx, dy, r] of [[14, -8, 5], [18, -16, 4], [12, -22, 3.5]]) blob(g, bx + dx, dy, r, r, 'rgba(200,190,170,0.6)', 0, false);
  }
}

/** Self-propelled howitzer: tracked, a long barrel at high angle that recoils and flashes. */
export function drawMangonel(g: G, f: FigureSpec): void {
  const moving = f.anim === 'walk';
  const recoil = f.anim === 'work' ? [0, 0, 8, 3][f.frame % 4] : 0;
  const hull = paint(f.team, 0.45);
  shadow(g, 62, 8, 4);
  track(g, -50, 46, 15, moving ? f.frame * 1.5 : 0, true);
  poly(g, [[-54, -14], [-52, -30], [40, -30], [52, -20], [50, -14]], hull);
  // Large boxy turret at the back with the gun at 35 degrees.
  const elev = f.anim === 'work' ? -35 : -12;
  const a = (elev * Math.PI) / 180;
  const ox = 8, oy = -44;
  const ux = Math.cos(a), uy = Math.sin(a);
  const l0 = 6 - recoil, l1 = 72 - recoil;
  limb(g, [ox + ux * l0, oy + uy * l0], [ox + ux * l1, oy + uy * l1], 4.6, STEEL_D, 0.85);
  limb(g, [ox + ux * (l1 - 5), oy + uy * (l1 - 5)], [ox + ux * l1, oy + uy * l1], 7, STEEL_D, 1);
  poly(g, [[-48, -30], [-46, -56], [14, -56], [20, -30]], shade(hull, 1.05));
  poly(g, [[-46, -56], [-44, -60], [10, -60], [14, -56]], shade(hull, 0.8));
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(-40, -50, 20, 8);
  crewHead(g, -30, -64, f.look.skin, f.team);
  chevron(g, -6, -44, 1.3, f.team);
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-52, -22, 98, 2.6);
  antenna(g, -44, -60, 26, f.team);
  track(g, -48, 48, 15, moving ? f.frame * 1.5 : 0);
  if (f.anim === 'work' && f.frame === 2) {
    muzzleFlash(g, ox + ux * (l1 + 2), oy + uy * (l1 + 2), 1.5);
    smoke(g, ox + ux * (l1 + 12), oy + uy * (l1 + 12), 1.8, 0.5);
  } else if (f.anim === 'work' && f.frame === 3) smoke(g, ox + ux * (l1 + 18), oy + uy * (l1 + 18) - 6, 2.2, 0.3);
}

/** Gun truck: a light 4x4 with a heavy machine gun on a ring mount. */
export function drawScorpion(g: G, f: FigureSpec): void {
  const moving = f.anim === 'walk';
  const firing = f.anim === 'work' && (f.frame === 2 || f.frame === 0);
  const turn = moving ? f.frame * 0.9 : 0;
  const body = paint(f.team, 0.5);
  shadow(g, 50, 7, 4);
  tyre(g, 25, -9, 9, turn, true);
  tyre(g, -25, -9, 9, turn, true);
  poly(g, [[-40, -10], [-42, -28], [-10, -30], [4, -40], [22, -40], [34, -28], [42, -24], [42, -10]], body);
  poly(g, [[6, -38], [20, -38], [28, -29], [6, -29]], GLASS);
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-40, -18, 82, 2.4);
  chevron(g, -14, -20, 1, f.team);
  blob(g, 40, -20, 2, 1.6, '#f6f0c8');
  // Gunner in the ring mount with a shielded HMG.
  const rec = firing ? -2 : 0;
  poly(g, [[-22, -30], [-6, -30], [-6, -34], [-22, -34]], STEEL_D);
  crewHead(g, -16, -42, f.look.skin, f.team);
  poly(g, [[-8, -48], [-4, -48], [-4, -36], [-8, -36]], STEEL_D);
  limb(g, [-12 + rec, -44], [18 + rec, -45], 3, '#1d1f22', 1);
  poly(g, [[-16 + rec, -47], [-6 + rec, -47], [-6 + rec, -41], [-16 + rec, -41]], '#2a2d31');
  if (firing) muzzleFlash(g, 20, -45, 1);
  antenna(g, -36, -28, 20, f.team);
  tyre(g, 28, -9, 9, turn);
  tyre(g, -22, -9, 9, turn);
}

/** Assault bridge: an armoured carrier with a folded scissor bridge and troops riding in the back. */
export function drawSiegeTower(g: G, f: FigureSpec): void {
  const moving = f.anim === 'walk';
  const hull = paint(f.team, 0.45);
  shadow(g, 60, 8, 4);
  track(g, -48, 44, 15, moving ? f.frame * 1.5 : 0, true);
  poly(g, [[-52, -14], [-50, -40], [30, -40], [50, -24], [48, -14]], hull);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 0; k < 3; k++) g.fillRect(-40 + k * 14, -34, 8, 3);
  // Troop hatches with helmets showing.
  for (const x of [-38, -26, -14]) crewHead(g, x, -44, f.look.skin, f.team);
  // Folded bridge on top: two trusses on a launch arm.
  const span = (y: number) => {
    poly(g, [[-54, y], [44, y], [50, y - 7], [-48, y - 7]], '#8a9096');
    for (let x = -46; x < 44; x += 10) stroke(g, [x, y], [x + 5, y - 7], 1, 'rgba(30,30,30,0.45)');
  };
  span(-50);
  span(-58);
  limb(g, [34, -40], [40, -54], 4, STEEL_D, 1);
  chevron(g, 10, -28, 1.3, f.team);
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-50, -20, 96, 2.6);
  antenna(g, -44, -60, 18, f.team);
  track(g, -46, 46, 15, moving ? f.frame * 1.5 : 0);
}

/** Missile launcher: an eight-wheel truck whose missile lies flat to travel and stands erect to fire. */
export function drawTrebuchet(g: G, f: FigureSpec): void {
  const packed = f.packed !== false;
  const moving = f.anim === 'walk';
  const turn = moving ? f.frame * 0.9 : 0;
  const body = paint(f.team, 0.5);
  shadow(g, 88, 9, 4);
  const wheels = [-56, -34, 30, 52];
  for (const x of wheels) tyre(g, x - 3, -11, 11, turn, true);
  // Chassis and cab.
  poly(g, [[-82, -14], [-82, -30], [62, -30], [62, -14]], shade(body, 0.85));
  poly(g, [[62, -14], [62, -52], [84, -52], [96, -32], [96, -14]], body);
  poly(g, [[66, -48], [82, -48], [90, -34], [66, -34]], GLASS);
  blob(g, 94, -22, 2.4, 2, '#f6f0c8');
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-82, -26, 178, 2.6);
  chevron(g, 74, -24, 1.2, f.team);
  // Launch cradle and the missile.
  const angle = packed ? 0 : f.anim === 'work' ? -82 : -78;
  const a = (angle * Math.PI) / 180;
  const pivot: P = [-70, -34];
  g.save();
  g.translate(pivot[0], pivot[1]);
  g.rotate(a === 0 ? 0 : a);
  const len = 128;
  const flying = f.anim === 'work' && f.frame >= 3;
  poly(g, [[0, -2], [len, -2], [len, 4], [0, 4]], '#4a4f55');
  if (!flying) {
    // White body, team band, dark nose and fins at the base.
    poly(g, [[4, -10], [len - 14, -10], [len, -5.5], [len - 14, -1], [4, -1]], '#e8e9e6');
    poly(g, [[len - 14, -10], [len, -5.5], [len - 14, -1]], '#2a2d31');
    g.fillStyle = f.team;
    g.fillRect(len * 0.55, -10, 8, 9);
    poly(g, [[4, -10], [-4, -16], [12, -10]], '#5d6268');
    poly(g, [[4, -1], [-4, 5], [12, -1]], '#5d6268');
    if (f.anim === 'work' && f.frame === 2) {
      // Ignition: a blast of flame and smoke out of the base.
      g.save();
      g.scale(-1, 1);
      g.translate(-4, -5.5);
      for (const s of [2.2, 1.4]) {
        const r = 9 * s;
        const fl = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
        fl.addColorStop(0, 'rgba(255,255,230,1)');
        fl.addColorStop(0.35, 'rgba(255,190,60,0.9)');
        fl.addColorStop(1, 'rgba(255,90,20,0)');
        g.fillStyle = fl;
        g.beginPath();
        g.ellipse(r * 0.8, 0, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }
  g.restore();
  if (!packed) {
    // Stabiliser jacks down.
    for (const x of [-78, 54]) {
      limb(g, [x, -16], [x, 0], 3, STEEL_D, 1);
      poly(g, [[x - 5, 0], [x + 5, 0], [x + 5, 2], [x - 5, 2]], '#2a2d31');
    }
    if (f.anim === 'work' && f.frame >= 2) smoke(g, -76, -10, 2.4, f.frame === 2 ? 0.6 : 0.35);
  }
  antenna(g, 66, -52, 20, f.team);
  for (const x of wheels) tyre(g, x, -11, 11, turn);
}

// ---------- anti-air and aircraft ----------

/** AA vehicle: a tracked carrier with a twin-cannon turret raised high and a spinning search radar. */
export function drawAAVehicle(g: G, f: FigureSpec): void {
  const moving = f.anim === 'walk';
  const firing = f.anim === 'work' && (f.frame === 2 || f.frame === 0);
  const hull = paint(f.team, 0.45);
  shadow(g, 56, 8, 4);
  track(g, -46, 42, 15, moving ? f.frame * 1.5 : 0, true);
  poly(g, [[-50, -14], [-48, -30], [34, -30], [46, -20], [44, -14]], hull);
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-48, -22, 90, 2.6);
  // Turret with twin cannons at a steep angle.
  const a = (-58 * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  const rec = firing ? 3 : 0;
  for (const dx of [-2, 3]) {
    const ox = -4 + dx, oy = -44;
    limb(g, [ox + ux * (4 - rec), oy + uy * (4 - rec)], [ox + ux * (42 - rec), oy + uy * (42 - rec)], 3, STEEL_D, 1);
  }
  poly(g, [[-24, -30], [-22, -52], [14, -52], [20, -30]], shade(hull, 1.05));
  // Missile pods either side of the turret.
  poly(g, [[-30, -48], [-22, -48], [-22, -38], [-30, -38]], '#4b5258');
  for (const y of [-45, -41]) blob(g, -29, y, 1.2, 1.2, '#e8eaea', 0, false);
  chevron(g, -2, -40, 1.1, f.team);
  // Search radar on a mast, turned by the frame.
  limb(g, [8, -52], [8, -64], 2, STEEL_D, 1);
  const turn = Math.cos((f.frame / 6) * Math.PI * 2);
  poly(g, [[8 - 11 * turn, -68], [8 + 11 * turn, -68], [8 + 11 * turn, -63], [8 - 11 * turn, -63]], '#c9cdd0');
  crewHead(g, -14, -56, f.look.skin, f.team);
  if (firing)
    for (const dx of [-2, 3]) muzzleFlash(g, -4 + dx + ux * 44, -44 + uy * 44, 0.8);
  track(g, -44, 44, 15, moving ? f.frame * 1.5 : 0);
}

/** Recon drone: a quadcopter with spinning rotors, a camera gimbal and a team light. */
export function drawDrone(g: G, f: FigureSpec): void {
  const spin = f.frame;
  // Arms and rotors (far pair first).
  for (const [x, far] of [[-20, true], [20, true], [-14, false], [14, false]] as const) {
    const y = far ? -22 : -18;
    stroke(g, [0, -16], [x, y], 2.2, far ? '#2a2e33' : '#3a4048');
    limb(g, [x, y], [x, y - 3], 2.4, '#1d1f22', 1);
    const w = 12 * (0.6 + 0.4 * Math.abs(Math.cos(spin + x)));
    g.fillStyle = 'rgba(200,210,220,0.35)';
    g.beginPath();
    g.ellipse(x, y - 4, w, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    stroke(g, [x - w, y - 4], [x + w, y - 4], 0.8, 'rgba(30,30,30,0.6)');
  }
  // Body shell and the camera ball under it.
  poly(g, [[-10, -19], [10, -19], [12, -13], [-12, -13]], '#e2e4e6');
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-9, -17.5, 18, 2);
  blob(g, 4, -9, 3.6, 3.6, '#2a2e33');
  blob(g, 5.5, -9.3, 1.4, 1.4, '#3b86c4', 0, false);
  blob(g, -9, -14, 1, 1, spin % 2 ? '#ff3a2a' : '#7fff6a', 0, false);
}

/** Attack helicopter: tandem cockpit, stub wings with rocket pods, a chin cannon and spinning rotors. */
export function drawHeli(g: G, f: FigureSpec): void {
  const body = paint(f.team, 0.55);
  const firing = f.anim === 'work' && f.frame === 2;
  const spin = (f.frame / 6) * Math.PI * 2;
  // Tail boom, fin and tail rotor.
  poly(g, [[-58, -40], [-50, -40], [-2, -30], [-2, -24], [-50, -32]], shade(body, 0.9));
  poly(g, [[-62, -54], [-54, -54], [-48, -36], [-58, -36]], body);
  const tr = 9 * Math.abs(Math.cos(spin * 2));
  g.fillStyle = 'rgba(200,210,220,0.35)';
  g.beginPath();
  g.ellipse(-60, -46, 2.2, 10, 0, 0, Math.PI * 2);
  g.fill();
  stroke(g, [-60, -46 - tr], [-60, -46 + tr], 1, 'rgba(30,30,30,0.7)');
  // Skids.
  limb(g, [-14, -8], [26, -8], 1.6, '#2a2d31', 1);
  for (const x of [-6, 16]) stroke(g, [x, -8], [x + 2, -16], 1.4, '#2a2d31');
  // Fuselage with a tapered nose.
  poly(g, [[-8, -16], [-6, -34], [16, -36], [34, -28], [40, -20], [34, -14], [8, -12]], body);
  // Tandem cockpit glazing.
  poly(g, [[10, -34], [26, -33], [36, -24], [24, -24], [12, -26]], GLASS);
  g.fillStyle = 'rgba(170,210,240,0.4)';
  g.fillRect(14, -32, 6, 2);
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-6, -22, 30, 2.4);
  chevron(g, 2, -27, 1, f.team);
  // Stub wing and rocket pod, chin cannon.
  poly(g, [[-2, -22], [12, -22], [12, -19], [-2, -19]], STEEL_D);
  poly(g, [[0, -19], [14, -19], [16, -15], [0, -15]], '#4b5258');
  for (const y of [-18, -16]) blob(g, 16, y, 1, 0.9, '#d8c060', 0, false);
  limb(g, [30, -14], [40, -12], 1.6, '#1d1f22', 1);
  if (firing) muzzleFlash(g, 42, -12, 0.8);
  // Engine housing, mast and the main rotor: a blur disc with two blades.
  poly(g, [[-4, -34], [12, -36], [14, -40], [-2, -40]], shade(body, 0.8));
  limb(g, [6, -40], [6, -46], 2.2, STEEL_D, 1);
  g.fillStyle = 'rgba(200,210,220,0.28)';
  g.beginPath();
  g.ellipse(6, -47, 52, 4, 0, 0, Math.PI * 2);
  g.fill();
  for (const k of [0, Math.PI / 2]) {
    const l = 52 * Math.cos(spin + k);
    stroke(g, [6 - l, -47 - Math.sin(spin + k) * 2], [6 + l, -47 + Math.sin(spin + k) * 2], 1.4, 'rgba(25,28,32,0.85)');
  }
}

/** Strike jet: pointed nose, bubble canopy, tail fin, wing and missiles, an afterburner when moving. */
export function drawJet(g: G, f: FigureSpec): void {
  const body = paint(f.team, 0.6);
  const moving = f.anim === 'walk' || f.anim === 'work';
  const firing = f.anim === 'work' && f.frame === 2;
  if (moving) {
    const fl = g.createLinearGradient(-80, 0, -56, 0);
    fl.addColorStop(0, 'rgba(255,120,30,0)');
    fl.addColorStop(0.6, 'rgba(255,170,60,0.8)');
    fl.addColorStop(1, 'rgba(255,250,220,1)');
    g.fillStyle = fl;
    g.beginPath();
    g.ellipse(-64 - (f.frame % 2) * 2, -22, 14 + (f.frame % 3) * 2, 3.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Far wing, fuselage, near wing, tail.
  poly(g, [[-20, -26], [10, -26], [-30, -38], [-40, -38]], shade(body, 0.7));
  poly(g, [[-56, -26], [-56, -18], [30, -16], [62, -21], [30, -28], [-30, -28]], body);
  poly(g, [[-56, -26], [-46, -26], [-36, -48], [-46, -48]], shade(body, 0.85));
  poly(g, [[-30, -22], [20, -22], [-14, -8], [-28, -8]], shade(body, 1.05));
  // Canopy and intakes.
  poly(g, [[22, -27], [36, -31], [46, -26], [24, -25]], GLASS);
  g.fillStyle = 'rgba(170,210,240,0.45)';
  g.fillRect(30, -30, 6, 1.6);
  poly(g, [[0, -24], [10, -24], [10, -19], [0, -19]], '#2a2d31');
  g.fillStyle = shade(f.team, 1.1);
  g.fillRect(-40, -23, 50, 2);
  chevron(g, -40, -36, 0.9, f.team);
  // Missiles under the wing.
  if (!firing) for (const x of [-22, -6]) poly(g, [[x, -10], [x + 14, -10], [x + 17, -8.5], [x + 14, -7], [x, -7]], '#e8eaea');
  else muzzleFlash(g, 8, -8, 0.9);
}
