// Modern infantry: fatigues, a team-coloured plate carrier, helmets and
// firearms. Built on the articulated figure skeleton in figures.ts (feet at
// y = 0, head top near y = -100, +x the facing direction in side view). Arms
// that hold a weapon are solved with two-bone IK so the grip lands on the gun.
import {
  D2R,
  type FigureSpec,
  type G,
  IDLE,
  type Look,
  type P,
  type Pose,
  type View,
  arm,
  blob,
  groundShadow,
  head,
  legs,
  limb,
  poly,
  roundLight,
  seg,
  shade,
  stroke,
  walkPose,
  OUT,
} from './figures';

type Kit = 'breacher' | 'commando' | 'at' | 'rifle' | 'shield' | 'sniper' | 'agent' | 'sapper' | 'commander' | 'aa';
type Gun = 'rifle' | 'dmr' | 'shotgun' | 'lmg' | 'sniper' | 'rpg' | 'atgm' | 'pistol' | 'manpads';

const GUNMETAL = '#25292e';
const POLYMER = '#33383e';
const GLOVE = '#2a2826';
const FLASH_FRAME = 2;

/** Camouflage palettes: base, light and dark blotches. */
const CAMO: Record<string, [string, string, string]> = {
  wood: ['#5d6344', '#7d7c55', '#3c4430'],
  desert: ['#a08f69', '#c2b18a', '#7d6a4a'],
  urban: ['#5c6168', '#80858b', '#3d4146'],
  night: ['#3b4048', '#52575f', '#262a30'],
};

const KIT_CAMO: Record<Kit, keyof typeof CAMO> = {
  breacher: 'urban',
  commando: 'night',
  at: 'wood',
  rifle: 'wood',
  shield: 'urban',
  sniper: 'wood',
  agent: 'night',
  sapper: 'desert',
  commander: 'wood',
  aa: 'desert',
};

// ---------- helpers ----------

/** Elbow position for a two-bone arm reaching from shoulder s to hand h (elbow drops below the line). */
function reach(s: P, h: P, l1 = 17, l2 = 16): { elbow: P; hand: P } {
  let dx = h[0] - s[0], dy = h[1] - s[1];
  let d = Math.hypot(dx, dy) || 1;
  const max = l1 + l2 - 0.5;
  if (d > max) {
    // Out of reach: stretch toward it.
    dx *= max / d;
    dy *= max / d;
    h = [s[0] + dx, s[1] + dy];
    d = max;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = s[0] + (dx * a) / d, my = s[1] + (dy * a) / d;
  const px = -dy / d, py = dx / d;
  const e1: P = [mx + px * hh, my + py * hh], e2: P = [mx - px * hh, my - py * hh];
  return { elbow: e1[1] > e2[1] ? e1 : e2, hand: h };
}

function ikArm(g: G, s: P, h: P, sleeve: string, glove = GLOVE): void {
  const { elbow, hand } = reach(s, h);
  limb(g, s, elbow, 7.4, sleeve, 0.85);
  limb(g, elbow, hand, 6, sleeve, 0.85);
  blob(g, hand[0], hand[1], 2.9, 2.8, glove);
}

/** Splotches of camouflage inside the current clip. */
function camo(g: G, x: number, y: number, w: number, h: number, pal: [string, string, string], seed: number): void {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = k % 2 ? pal[1] : pal[2];
    g.globalAlpha = 0.75;
    g.beginPath();
    g.ellipse(x + rnd() * w, y + rnd() * h, 2 + rnd() * 3.5, 1.4 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** The combat shirt from shoulders to belt, with camo, a belt and a team plate carrier over it. */
function body(g: G, view: View, sh: P, hip: P, pal: [string, string, string], team: string, carrier: 'plate' | 'heavy' | 'none' | 'jacket', seed: number): void {
  const [sx, sy] = sh, [hx, hy] = hip;
  const half = view === 'side' ? 8.5 : 12.5;
  const hipHalf = view === 'side' ? 9 : 11;
  const outline = () => {
    g.beginPath();
    g.moveTo(sx - half + 3, sy - 1.5);
    g.quadraticCurveTo(sx, sy - 3, sx + half - 3, sy - 1.5);
    g.quadraticCurveTo(sx + half + 1, sy, sx + half, sy + 5);
    g.lineTo(hx + hipHalf, hy + 5);
    g.quadraticCurveTo(hx, hy + 7, hx - hipHalf, hy + 5);
    g.lineTo(sx - half, sy + 5);
    g.quadraticCurveTo(sx - half - 1, sy, sx - half + 3, sy - 1.5);
    g.closePath();
  };
  outline();
  g.strokeStyle = OUT;
  g.lineWidth = 1.4;
  g.stroke();
  const grad = g.createLinearGradient(sx - half, 0, sx + half, 0);
  grad.addColorStop(0, shade(pal[0], 1.2));
  grad.addColorStop(0.5, pal[0]);
  grad.addColorStop(1, shade(pal[0], 0.65));
  g.fillStyle = grad;
  g.fill();
  g.save();
  outline();
  g.clip();
  camo(g, sx - half, sy - 3, half * 2, hy - sy + 10, pal, seed);
  g.restore();
  // Belt with a buckle.
  g.fillStyle = '#2b2a26';
  g.fillRect(hx - hipHalf - 0.5, hy - 1, hipHalf * 2 + 1, 3.6);
  if (carrier === 'none') return;
  if (carrier === 'jacket') {
    // A dark softshell zipped up, with a team armband.
    poly(g, [[sx - half + 0.5, sy], [sx + half - 0.5, sy], [hx + hipHalf, hy + 4], [hx - hipHalf, hy + 4]], '#2c3036');
    if (view === 'front') stroke(g, [sx, sy + 1], [hx, hy + 4], 0.8, '#8a9098');
    return;
  }
  // Plate carrier: team-coloured cordura with a pouch row and shoulder straps.
  const heavy = carrier === 'heavy';
  const c0 = sy + 2, c1 = hy - (heavy ? -2 : 4);
  const cw = view === 'side' ? half + (heavy ? 2.5 : 1.5) : half - 0.5;
  const cx = view === 'side' ? sx + 1.5 : sx;
  const cf = shade(team, 0.82);
  poly(g, [[cx - cw, c0], [cx + cw, c0], [cx + cw + 0.5, c1], [cx - cw - 0.5, c1]], cf);
  // Webbing rows.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = c0 + 4; y < c1 - 2; y += 3.2) g.fillRect(cx - cw + 1, y, cw * 2 - 2, 0.8);
  if (view !== 'back') {
    // Magazine pouches along the bottom, and a name tape.
    const n = view === 'side' ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const px = cx - cw + 1.5 + ((cw * 2 - 3) / n) * k;
      poly(g, [[px, c1 - 7], [px + (cw * 2 - 3) / n - 1, c1 - 7], [px + (cw * 2 - 3) / n - 1, c1], [px, c1]], shade(team, 0.7));
    }
    g.fillStyle = 'rgba(240,240,230,0.55)';
    g.fillRect(cx - (view === 'side' ? 2 : 5), c0 + 3, view === 'side' ? 4 : 10, 1.6);
  }
  if (heavy) {
    // Collar and groin protector.
    poly(g, [[cx - cw + 1, c0 - 1], [cx + cw - 1, c0 - 1], [cx + cw - 3, c0 + 3], [cx - cw + 3, c0 + 3]], shade(team, 0.6));
    poly(g, [[hx - 5, hy + 3], [hx + 5, hy + 3], [hx + 3, hy + 11], [hx - 3, hy + 11]], shade(team, 0.7));
  }
}

/** A modern ballistic helmet with an NVG shroud, side rails and a team patch. */
function helmet(g: G, view: View, x: number, y: number, team: string, color = '#6b6a4c', visor = false): void {
  const dome = roundLight(g, x - 2, y - 8, 12, 9, color);
  g.beginPath();
  if (view === 'side') {
    g.moveTo(x - 10.5, y + 1);
    g.quadraticCurveTo(x - 12, y - 14, x, y - 14.5);
    g.quadraticCurveTo(x + 10.5, y - 14, x + 10, y - 3);
    g.lineTo(x + 3, y - 3.5);
    g.quadraticCurveTo(x - 1, y - 1, x - 3, y + 3);
    g.closePath();
  } else {
    g.moveTo(x - 11, y + 1);
    g.quadraticCurveTo(x - 11.5, y - 15, x, y - 15);
    g.quadraticCurveTo(x + 11.5, y - 15, x + 11, y + 1);
    g.lineTo(x + 9, y - 4);
    g.quadraticCurveTo(x, y - 6, x - 9, y - 4);
    g.closePath();
  }
  g.strokeStyle = OUT;
  g.lineWidth = 1.3;
  g.stroke();
  g.fillStyle = dome;
  g.fill();
  if (view === 'side') {
    stroke(g, [x - 7, y - 5], [x + 6, y - 6], 1.6, shade(color, 0.6));
    g.fillStyle = team;
    g.fillRect(x - 6, y - 11, 5, 3.2);
    // NVG mount on the brow.
    poly(g, [[x + 7, y - 9], [x + 11, y - 8.5], [x + 11, y - 5.5], [x + 7, y - 6]], '#1e2124');
  } else if (view === 'front') {
    poly(g, [[x - 3, y - 11], [x + 3, y - 11], [x + 2.5, y - 7], [x - 2.5, y - 7]], '#1e2124');
  } else {
    g.fillStyle = team;
    g.fillRect(x - 3, y - 11, 6, 3.4);
  }
  if (visor && view !== 'back') {
    g.fillStyle = 'rgba(120,170,200,0.45)';
    if (view === 'side') g.fillRect(x + 4, y - 5, 6.5, 11);
    else g.fillRect(x - 9, y - 4, 18, 11);
    g.strokeStyle = 'rgba(230,245,255,0.6)';
    g.lineWidth = 0.6;
    g.strokeRect(view === 'side' ? x + 4 : x - 9, y - 5, view === 'side' ? 6.5 : 18, 11);
  }
}

/** Wraparound shooting glasses. */
function glasses(g: G, view: View, x: number, y: number): void {
  if (view === 'back') return;
  g.fillStyle = 'rgba(20,24,30,0.9)';
  if (view === 'side') g.fillRect(x + 3.5, y - 1.8, 6, 2.6);
  else {
    g.fillRect(x - 6.5, y - 1.8, 13, 2.6);
    g.fillStyle = 'rgba(140,200,255,0.5)';
    g.fillRect(x - 5.5, y - 1.5, 3, 0.8);
  }
}

/** A soft beret in the team colour with a cap badge. */
function beret(g: G, view: View, x: number, y: number, team: string): void {
  blob(g, x - (view === 'side' ? 2 : 0), y - 9, 10.5, 4.6, team, view === 'side' ? -0.15 : 0);
  stroke(g, [x - 9, y - 6], [x + 8, y - 6], 1.6, '#1d1a16');
  if (view !== 'back') blob(g, x + (view === 'side' ? 5 : -4), y - 9, 1.6, 1.8, '#e6c25a');
}

/** A ghillie hood of burlap strands over the head. */
function ghillie(g: G, view: View, x: number, y: number): void {
  for (let k = 0; k < 22; k++) {
    const a = Math.PI * (0.95 + (k / 21) * 1.1);
    const r = 10 + (k % 3);
    const sx = x + Math.cos(a) * r * (view === 'side' ? 0.9 : 1);
    const sy = y - 3 + Math.sin(a) * r;
    stroke(g, [sx, sy], [sx + (k % 2 ? -2 : 2) - (view === 'side' ? 3 : 0), sy + 8 + (k % 4)], 1.5, k % 3 ? '#5c6340' : '#8a8458');
  }
  blob(g, x - (view === 'side' ? 1 : 0), y - 6, 11, 8, '#5f6543', 0, false);
}

// ---------- weapons ----------

/**
 * Draws a firearm in its own frame: origin at the pistol grip, +x down the barrel.
 * Returns the muzzle x (for the flash) and where the support hand goes.
 */
function gunShape(g: G, kind: Gun, elite: boolean): { muzzle: number; support: number } {
  const dark = (pts: P[], c = GUNMETAL) => poly(g, pts, c);
  switch (kind) {
    case 'pistol':
      dark([[-2, -3.5], [9, -3.5], [9, -0.5], [1.5, -0.5], [1, 4], [-2.5, 4]]);
      return { muzzle: 9, support: 0 };
    case 'shotgun':
      dark([[-15, -1], [-6, -2.5], [-6, 1.5], [-14, 4]], POLYMER);
      dark([[-6, -3.2], [22, -3.2], [22, -1], [-6, 0.5]]);
      dark([[6, -1], [16, -1], [16, 1.6], [6, 1.6]], POLYMER);
      dark([[-2.5, 0], [0.5, 0], [0, 5], [-3, 5]], POLYMER);
      return { muzzle: 22, support: 11 };
    case 'lmg':
      dark([[-16, -2], [-6, -3.5], [-6, 2], [-15, 4]], POLYMER);
      dark([[-6, -4.5], [14, -4.5], [14, 0.8], [-6, 1]]);
      dark([[14, -3.2], [30, -3.2], [30, -1.6], [14, -1.6]]);
      // Box magazine and a folded bipod.
      dark([[0, 1], [8, 1], [8, 9], [0, 9]], '#4a4e44');
      stroke(g, [22, -1.5], [16, 2], 1, '#1c1f22');
      dark([[-2.5, 0.5], [0.5, 0.5], [0, 5], [-3, 5]], POLYMER);
      dark([[-1, -7], [6, -7], [6, -4.5], [-1, -4.5]], '#1c1f22');
      return { muzzle: 30, support: 12 };
    case 'sniper':
      dark([[-17, -2], [-6, -3], [-6, 1.5], [-16, 5]], '#4d5236');
      dark([[-6, -3.5], [12, -3.5], [12, 1], [-6, 1.5]], '#4d5236');
      dark([[12, -2.8], [40, -2.8], [40, -1.4], [12, -1.4]]);
      // Long scope.
      dark([[-4, -8.2], [12, -8.2], [12, -5.6], [-4, -5.6]], '#1a1d20');
      blob(g, 12.5, -6.9, 1.6, 1.8, '#3b86c4', 0, false);
      dark([[-2.5, 1], [0.5, 1], [0, 5], [-3, 5]], '#4d5236');
      return { muzzle: 40, support: 10 };
    case 'rpg': {
      // Launcher tube on the shoulder with a warhead cone at the front.
      dark([[-18, -5.5], [20, -5.5], [20, -0.5], [-18, -0.5]], elite ? '#4d5338' : '#5d4a32');
      poly(g, [[20, -6.5], [27, -6.5], [32, -3], [27, 0.5], [20, 0.5]], elite ? '#9ea38e' : '#6b7b4a');
      dark([[-1, -0.5], [2, -0.5], [1.5, 5], [-1.5, 5]], POLYMER);
      dark([[7, -0.5], [9.5, -0.5], [9, 3.5], [7, 3.5]], POLYMER);
      dark([[1, -9.5], [6, -9.5], [6, -5.5], [1, -5.5]], '#1c1f22');
      return { muzzle: 32, support: 8 };
    }
    case 'manpads':
      // A slim launch tube with a grip stock, sight and seeker cap.
      dark([[-18, -5], [24, -5], [24, -0.5], [-18, -0.5]], '#56603f');
      poly(g, [[24, -5.5], [28, -4.8], [28, -0.7], [24, 0]], '#e8eaea');
      dark([[-1, -0.5], [2, -0.5], [1.5, 5], [-1.5, 5]], POLYMER);
      dark([[4, -11], [10, -11], [10, -5], [4, -5]], '#2a2f34');
      blob(g, 7, -8, 1.4, 1.4, '#ff5a4a', 0, false);
      return { muzzle: 28, support: 9 };
    case 'atgm':
      // Fat launch tube with a command-launch unit on the side.
      dark([[-14, -7], [24, -7], [24, 0], [-14, 0]], '#5c6146');
      stroke(g, [-14, -3.5], [24, -3.5], 0.6, 'rgba(0,0,0,0.3)');
      dark([[-4, -1], [8, -1], [8, 7], [-4, 7]], '#33372b');
      blob(g, 9, 3, 1.8, 1.8, '#3b86c4', 0, false);
      return { muzzle: 24, support: 6 };
    case 'dmr':
    case 'rifle': {
      const len = kind === 'dmr' ? 32 : 26;
      // Collapsible stock, receiver, rail and handguard, barrel, curved magazine.
      dark([[-15, -1.2], [-6, -2.5], [-6, 1.6], [-14, 4.2]], POLYMER);
      dark([[-6, -4], [8, -4], [8, 1.2], [-6, 1.6]]);
      dark([[8, -4], [17, -4], [17, 0.6], [8, 0.8]], kind === 'dmr' ? '#5b5a44' : POLYMER);
      dark([[17, -2.8], [len, -2.8], [len, -1.6], [17, -1.6]]);
      dark([[1, 1.2], [5.5, 1.2], [6.5, 8], [2.5, 8.4]], '#3a3e44');
      dark([[-2.5, 1], [0.5, 1], [0, 5.5], [-3, 5.5]], POLYMER);
      // Optic.
      if (kind === 'dmr' || elite) {
        dark([[-3, -8], [9, -8], [9, -5.2], [-3, -5.2]], '#1a1d20');
        blob(g, 9.5, -6.6, 1.4, 1.5, '#3b86c4', 0, false);
      } else {
        dark([[-1, -7], [4, -7], [4, -4], [-1, -4]], '#1a1d20');
        blob(g, 1.5, -5.5, 0.8, 0.8, '#e2403a', 0, false);
      }
      return { muzzle: len, support: 13 };
    }
  }
}

function muzzleFlash(g: G, x: number, y: number, s: number): void {
  const r = 7 * s;
  const glow = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
  glow.addColorStop(0, 'rgba(255,255,230,1)');
  glow.addColorStop(0.3, 'rgba(255,214,90,0.95)');
  glow.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.moveTo(x - 1, y);
  g.lineTo(x + r * 0.7, y - r * 0.55);
  g.lineTo(x + r * 0.6, y - r * 0.1);
  g.lineTo(x + r * 1.7, y);
  g.lineTo(x + r * 0.6, y + r * 0.1);
  g.lineTo(x + r * 0.7, y + r * 0.55);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(x + r * 0.3, y, r * 0.5, 0, Math.PI * 2);
  g.fill();
}

/** Places a gun with its grip at `grip`, pointing along figure angle `deg` (90 = straight ahead). */
function placeGun(g: G, kind: Gun, grip: P, deg: number, elite: boolean, flash: boolean): { support: P; muzzle: P } {
  const ux = Math.sin(deg * D2R), uy = Math.cos(deg * D2R);
  g.save();
  g.translate(grip[0], grip[1]);
  g.rotate(Math.atan2(uy, ux));
  const { muzzle, support } = gunShape(g, kind, elite);
  if (flash) {
    if (kind === 'rpg' || kind === 'atgm' || kind === 'manpads') {
      // Backblast out of the rear of the tube, and the motor's flare at the front.
      muzzleFlash(g, muzzle, -3, 0.8);
      g.save();
      g.scale(-1, 1);
      muzzleFlash(g, 18, -3, 1.4);
      g.restore();
    } else muzzleFlash(g, muzzle, -2.2, kind === 'pistol' ? 0.6 : kind === 'shotgun' || kind === 'lmg' ? 1.2 : 1);
  }
  g.restore();
  return {
    support: [grip[0] + ux * support - uy * -1, grip[1] + uy * support + ux * -1],
    muzzle: [grip[0] + ux * muzzle, grip[1] + uy * muzzle],
  };
}

/** A ballistic shield with a viewport and a team stripe (centre x, y), seen side-on or face-on. */
function ballisticShield(g: G, x: number, y: number, view: View, team: string): void {
  if (view === 'side') {
    poly(g, [[x - 2, y - 30], [x + 3, y - 29], [x + 3.5, y + 28], [x - 2, y + 28]], '#22262a');
    g.fillStyle = 'rgba(140,190,220,0.6)';
    g.fillRect(x + 1.5, y - 22, 2, 6);
    g.fillStyle = team;
    g.fillRect(x + 1, y - 2, 2.6, 6);
    return;
  }
  poly(g, [[x - 13, y - 28], [x + 13, y - 28], [x + 14, y + 26], [x - 14, y + 26]], '#24282c');
  g.fillStyle = 'rgba(130,180,215,0.55)';
  g.fillRect(x - 7, y - 23, 14, 5);
  g.strokeStyle = 'rgba(220,240,255,0.5)';
  g.lineWidth = 0.6;
  g.strokeRect(x - 7, y - 23, 14, 5);
  g.fillStyle = team;
  g.fillRect(x - 13, y - 2, 26, 4);
  g.fillStyle = 'rgba(240,240,240,0.85)';
  g.font = 'bold 6px sans-serif';
  g.textAlign = 'center';
  if (view === 'front') g.fillText('SECURITY', x, y + 12);
}

function satchel(g: G, x: number, y: number, blink: boolean): void {
  poly(g, [[x - 6, y - 5], [x + 6, y - 5], [x + 6, y + 5], [x - 6, y + 5]], '#55573f');
  for (const k of [-3, 0, 3]) {
    g.fillStyle = '#d8d2b8';
    g.fillRect(x + k - 1, y - 4, 2, 8);
  }
  g.fillStyle = '#1e2124';
  g.fillRect(x - 3, y - 7.5, 6, 3);
  blob(g, x + 1.5, y - 6, 1.1, 1.1, blink ? '#ff3a2a' : '#6a1a14', 0, false);
}

function tablet(g: G, x: number, y: number, view: View, glow: boolean): void {
  if (view === 'side') {
    poly(g, [[x - 1, y - 7], [x + 2, y - 7.5], [x + 2.5, y + 6], [x - 0.5, y + 6.5]], '#1e2124');
    if (glow) blob(g, x + 4, y - 1, 3, 6, 'rgba(110,220,255,0.35)', 0, false);
    return;
  }
  poly(g, [[x - 7, y - 5], [x + 7, y - 5], [x + 7, y + 5], [x - 7, y + 5]], '#1e2124');
  g.fillStyle = view === 'front' ? '#2a3a46' : '#3f8fd0';
  g.fillRect(x - 6, y - 4, 12, 8);
}

/** A medical backpack with a white cross. */
function medPack(g: G, x: number, y: number): void {
  poly(g, [[x - 7, y - 10], [x + 7, y - 10], [x + 7.5, y + 10], [x - 7.5, y + 10]], '#3a3e44');
  g.fillStyle = '#f2f2f2';
  g.fillRect(x - 1.4, y - 5, 2.8, 8);
  g.fillRect(x - 4, y - 2.4, 8, 2.8);
}

// ---------- the trooper ----------

const GUN_OF: Partial<Record<Kit, Gun>> = {
  breacher: 'shotgun',
  commando: 'lmg',
  at: 'rpg',
  rifle: 'rifle',
  shield: 'pistol',
  sniper: 'sniper',
  sapper: 'rifle',
  aa: 'manpads',
};

function drawTrooper(g: G, f: FigureSpec, kit: Kit): void {
  const look: Look = { ...f.look, female: false, cloth: CAMO[KIT_CAMO[kit]][2] };
  const pal = CAMO[KIT_CAMO[kit]];
  const acting = f.anim === 'work';
  const walking = f.anim === 'walk';
  const pose: Pose = walking ? walkPose(f.frame) : acting ? { ...IDLE, near: [18, 6], far: [-16, -8], lean: 6 } : IDLE;
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  const sleeve = pal[0];
  const flash = acting && f.frame === FLASH_FRAME;
  let gun = GUN_OF[kit];
  if (kit === 'at' && f.elite) gun = 'atgm';
  if (kit === 'rifle' && f.elite) gun = 'dmr';
  const carrier = kit === 'breacher' || kit === 'shield' ? 'heavy' : kit === 'agent' ? 'jacket' : kit === 'commander' ? 'none' : 'plate';
  groundShadow(g, 15, 5);

  // Kit slung on the back.
  const backPack = () => {
    if (kit === 'agent') medPack(g, sh[0] - (f.view === 'side' ? 8 : 0), sh[1] + 12);
    else if (kit === 'sapper') poly(g, [[sh[0] - 8, sh[1] + 1], [sh[0] + 6, sh[1] + 1], [sh[0] + 7, sh[1] + 22], [sh[0] - 9, sh[1] + 22]], '#5a5c44');
    else if (kit === 'at' && f.view === 'back') {
      // Spare rockets in a carrier.
      for (const dx of [-4, 4]) poly(g, [[sh[0] + dx - 2.5, sh[1] - 6], [sh[0] + dx + 2.5, sh[1] - 6], [sh[0] + dx + 2.5, sh[1] + 20], [sh[0] + dx - 2.5, sh[1] + 20]], '#6b7b4a');
    } else if (kit === 'commando' || kit === 'sniper' || kit === 'rifle') poly(g, [[sh[0] - 7, sh[1] + 2], [sh[0] + 7, sh[1] + 2], [sh[0] + 7, sh[1] + 18], [sh[0] - 7, sh[1] + 18]], shade(pal[0], 0.8));
  };

  if (f.view === 'side') {
    // Pack behind, far leg, near leg, body, then gun and arms in front.
    if (kit !== 'commander' && kit !== 'shield') {
      g.save();
      g.translate(-4, 0);
      backPack();
      g.restore();
    }
    legs(g, pose, 'side', hip, look, 'far');
    legs(g, pose, 'side', hip, look, 'near');
    body(g, 'side', sh, hip, pal, f.team, carrier, f.frame + 3);
    const shF: P = [sh[0] + 1, sh[1] + 2], shN: P = [sh[0] - 1, sh[1] + 2];
    const hx = headC[0], hy = headC[1];
    const headgear = () => {
      head(g, 'side', hx, hy, look, f.team);
      if (kit === 'commander') {
        beret(g, 'side', hx, hy, f.team);
        glasses(g, 'side', hx, hy);
      } else if (kit === 'sniper') ghillie(g, 'side', hx, hy);
      else if (kit === 'agent') {
        // Ball cap, team crown, and an earpiece.
        blob(g, hx - 1, hy - 8, 9.5, 5.5, f.team);
        poly(g, [[hx + 5, hy - 6], [hx + 14, hy - 5], [hx + 13, hy - 3.5], [hx + 5, hy - 4]], shade(f.team, 0.6));
      } else {
        if (kit === 'commando') {
          // Balaclava under the helmet.
          blob(g, hx + 1, hy + 2, 8.5, 8, '#24272b');
          blob(g, hx + 5.5, hy - 0.5, 2.6, 1.6, f.look.skin, 0, false);
        }
        helmet(g, 'side', hx, hy, f.team, kit === 'sapper' ? '#8a7a58' : kit === 'commando' ? '#3a3e40' : '#6b6a4c', kit === 'breacher' && !!f.elite);
        if (kit !== 'commando') glasses(g, 'side', hx, hy);
      }
    };
    if (gun && kit !== 'shield') {
      // Aim on the strike; otherwise carry at the low ready (muzzle forward and down).
      const shoulderGun = gun === 'rpg' || gun === 'atgm' || gun === 'manpads';
      // AA troopers aim high, at the sky.
      const aim = acting ? (gun === 'manpads' ? 122 : shoulderGun ? 92 : 91) : walking ? 66 : 70;
      const recoil = flash ? -2 : 0;
      const pocket: P = shoulderGun ? [sh[0] + 2 + recoil, sh[1] - 1] : [sh[0] + 3 + recoil, sh[1] + 4];
      const back = shoulderGun ? 6 : 14;
      const ux = Math.sin(aim * D2R), uy = Math.cos(aim * D2R);
      const grip: P = [pocket[0] + ux * back, pocket[1] + uy * back];
      const triggerHand: P = [grip[0] - uy * -3 * 0, grip[1] + 2.5];
      // Support arm (far side) first, so the gun sits over it.
      const tmp = placeGunDry(gun, grip, aim);
      ikArm(g, shF, tmp.support, shade(sleeve, 0.7));
      headgear();
      placeGun(g, gun, grip, aim, !!f.elite, flash);
      ikArm(g, shN, triggerHand, sleeve);
    } else if (kit === 'shield') {
      headgear();
      // Shield on the far arm out front; pistol over its edge on the strike.
      const shieldX = sh[0] + 14, shieldY = hip[1] - 6;
      ikArm(g, shF, [shieldX - 3, shieldY - 4], shade(sleeve, 0.7));
      ballisticShield(g, shieldX, shieldY, 'side', f.team);
      if (acting) {
        const grip: P = [shieldX + 2, sh[1] + 2];
        placeGun(g, 'pistol', grip, 92, false, flash);
        ikArm(g, shN, grip, sleeve);
      } else ikArm(g, shN, [shieldX - 2, shieldY + 4], sleeve);
    } else if (kit === 'agent') {
      headgear();
      const hand: P = acting ? [sh[0] + 13, sh[1] + 6] : [sh[0] + 6, hip[1] + 4];
      ikArm(g, shF, [hand[0] + 2, hand[1] - 1], shade('#2c3036', 0.8), GLOVE);
      tablet(g, hand[0] + 3, hand[1] - 1, 'side', acting);
      ikArm(g, shN, hand, '#2c3036', f.look.skin);
      if (acting) signal(g, hand[0] + 6, hand[1] - 4, f.frame);
    } else if (kit === 'commander') {
      headgear();
      // Officer's service dress: the jacket, ribbons, and a radio handset at the ear.
      poly(g, [[sh[0] - 8, sh[1]], [sh[0] + 8, sh[1]], [hip[0] + 9, hip[1] + 8], [hip[0] - 9, hip[1] + 8]], '#4c5238');
      g.fillStyle = '#c9a43a';
      g.fillRect(sh[0] + 1, sh[1] + 6, 5, 1.6);
      g.fillStyle = f.team;
      g.fillRect(sh[0] + 1, sh[1] + 8, 5, 1.6);
      ikArm(g, shF, [sh[0] + 4, hip[1] + 6], shade('#4c5238', 0.7), f.look.skin);
      ikArm(g, shN, acting ? [hx + 2, hy + 4] : [sh[0] + 3, hip[1] + 8], '#4c5238', f.look.skin);
      if (acting) poly(g, [[hx + 1, hy + 1], [hx + 4, hy + 1], [hx + 4, hy + 9], [hx + 1, hy + 9]], '#1e2124');
    }
    if (kit === 'sapper') {
      // A satchel charge in hand, its arming light blinking.
      const hand: P = [sh[0] + 9, hip[1] + 4];
      satchel(g, hand[0] + 2, hand[1] + 2, Math.floor(f.frame / 2) % 2 === 0);
    }
    return;
  }

  // Front and back views.
  const front = f.view === 'front';
  if (front && kit !== 'commander' && kit !== 'shield') {
    // Pack straps only; the pack itself is hidden behind the body.
  }
  if (!front) {
    legs(g, pose, f.view, hip, look, 'far');
    legs(g, pose, f.view, hip, look, 'near');
    body(g, 'back', sh, hip, pal, f.team, carrier, 7);
    if (kit !== 'commander') backPack();
    arm(g, pose, 'back', sh, look, sleeve, 'far');
    arm(g, pose, 'back', sh, look, sleeve, 'near');
    if (gun && kit !== 'shield' && kit !== 'at' && kit !== 'aa') placeGun(g, gun, [sh[0] - 6, sh[1] + 20], 140, !!f.elite, false);
    if (kit === 'at' || kit === 'aa') placeGun(g, gun!, [sh[0] + 2, sh[1] + 2], 100, !!f.elite, false);
    const [hx, hy] = headC;
    head(g, 'back', hx, hy, look, f.team);
    if (kit === 'commander') beret(g, 'back', hx, hy, f.team);
    else if (kit === 'sniper') ghillie(g, 'back', hx, hy);
    else if (kit === 'agent') blob(g, hx, hy - 8, 9.5, 5.5, f.team);
    else helmet(g, 'back', hx, hy, f.team, kit === 'sapper' ? '#8a7a58' : kit === 'commando' ? '#3a3e40' : '#6b6a4c');
    if (kit === 'shield') ballisticShield(g, sh[0], sh[1] + 18, 'back', f.team);
    return;
  }
  legs(g, pose, 'front', hip, look, 'far');
  legs(g, pose, 'front', hip, look, 'near');
  body(g, 'front', sh, hip, pal, f.team, carrier, 5);
  if (kit === 'commander') {
    poly(g, [[sh[0] - 12, sh[1]], [sh[0] + 12, sh[1]], [hip[0] + 11, hip[1] + 8], [hip[0] - 11, hip[1] + 8]], '#4c5238');
    stroke(g, [sh[0], sh[1] + 1], [hip[0], hip[1] + 8], 0.8, 'rgba(0,0,0,0.4)');
    g.fillStyle = '#c9a43a';
    g.fillRect(sh[0] + 3, sh[1] + 7, 6, 1.6);
    g.fillStyle = f.team;
    g.fillRect(sh[0] + 3, sh[1] + 9, 6, 1.6);
    for (const k of [-1, 1]) {
      g.fillStyle = '#e6c25a';
      g.fillRect(sh[0] + k * 9 - 2, sh[1] + 1, 4, 1.4);
    }
  }
  const [hx, hy] = headC;
  head(g, 'front', hx, hy, look, f.team);
  if (kit === 'commander') {
    beret(g, 'front', hx, hy, f.team);
    glasses(g, 'front', hx, hy);
  } else if (kit === 'sniper') ghillie(g, 'front', hx, hy);
  else if (kit === 'agent') {
    blob(g, hx, hy - 8, 9.5, 5.5, f.team);
    poly(g, [[hx - 8, hy - 5], [hx + 8, hy - 5], [hx + 9, hy - 3], [hx - 9, hy - 3]], shade(f.team, 0.6));
  } else {
    if (kit === 'commando') {
      blob(g, hx, hy + 2, 9, 8.5, '#24272b');
      g.fillStyle = f.look.skin;
      g.fillRect(hx - 6, hy - 2, 12, 3.4);
      blob(g, hx - 3.3, hy - 0.3, 0.9, 0.9, '#2a1a10', 0, false);
      blob(g, hx + 3.3, hy - 0.3, 0.9, 0.9, '#2a1a10', 0, false);
    }
    helmet(g, 'front', hx, hy, f.team, kit === 'sapper' ? '#8a7a58' : kit === 'commando' ? '#3a3e40' : '#6b6a4c', kit === 'breacher' && !!f.elite);
    if (kit !== 'commando') glasses(g, 'front', hx, hy);
  }
  const shL: P = [sh[0] - 12, sh[1] + 2], shR: P = [sh[0] + 12, sh[1] + 2];
  if (kit === 'shield') {
    ikArm(g, shL, [sh[0] - 4, sh[1] + 14], shade(sleeve, 0.8));
    ikArm(g, shR, [sh[0] + 6, sh[1] + 16], sleeve);
    ballisticShield(g, sh[0], sh[1] + 22, 'front', f.team);
    return;
  }
  if (gun) {
    // Held across the chest at port arms.
    const grip: P = [sh[0] + 6, sh[1] + 18];
    const deg = gun === 'rpg' || gun === 'atgm' || gun === 'manpads' ? 150 : 135;
    const dry = placeGunDry(gun, grip, deg);
    placeGun(g, gun, grip, deg, !!f.elite, false);
    ikArm(g, shL, dry.support, shade(sleeve, 0.85));
    ikArm(g, shR, [grip[0], grip[1] + 2], sleeve);
  } else if (kit === 'agent') {
    ikArm(g, shL, [sh[0] - 3, sh[1] + 18], '#2c3036', f.look.skin);
    ikArm(g, shR, [sh[0] + 3, sh[1] + 18], '#2c3036', f.look.skin);
    tablet(g, sh[0], sh[1] + 16, 'back', false);
  } else {
    ikArm(g, shL, [sh[0] - 13, hip[1] + 6], '#4c5238', f.look.skin);
    ikArm(g, shR, [sh[0] + 13, hip[1] + 6], '#4c5238', f.look.skin);
  }
  if (kit === 'sapper') satchel(g, sh[0] - 9, hip[1] + 4, Math.floor(f.frame / 2) % 2 === 0);
}

/** Where the support hand would land on a gun, without drawing it. */
function placeGunDry(kind: Gun, grip: P, deg: number): { support: P } {
  const ux = Math.sin(deg * D2R), uy = Math.cos(deg * D2R);
  const support = kind === 'pistol' ? 0 : kind === 'rpg' ? 8 : kind === 'manpads' ? 9 : kind === 'atgm' ? 6 : kind === 'sniper' ? 10 : kind === 'lmg' ? 12 : kind === 'shotgun' ? 11 : 13;
  return { support: [grip[0] + ux * support + uy * 1.5, grip[1] + uy * support - ux * -1.5] };
}

/** Concentric signal arcs from the agent's tablet as it works. */
function signal(g: G, x: number, y: number, frame: number): void {
  for (let k = 0; k < 3; k++) {
    const r = 5 + ((k * 5 + frame * 2.5) % 15);
    g.strokeStyle = `rgba(110,220,255,${0.85 - r / 20})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, r, -0.7, 0.7);
    g.stroke();
  }
}

export const drawMilitia = (g: G, f: FigureSpec) => drawTrooper(g, f, f.variant === 'claymore' ? 'commando' : 'breacher');
export const drawClaymore = (g: G, f: FigureSpec) => drawTrooper(g, f, 'commando');
export const drawSpearman = (g: G, f: FigureSpec) => drawTrooper(g, f, 'at');
export const drawArcher = (g: G, f: FigureSpec) => drawTrooper(g, f, 'rifle');
export const drawSkirmisher = (g: G, f: FigureSpec) => drawTrooper(g, f, 'shield');
export const drawMonk = (g: G, f: FigureSpec) => drawTrooper(g, f, 'agent');
export const drawArbalest = (g: G, f: FigureSpec) => drawTrooper(g, f, 'sniper');
export const drawKing = (g: G, f: FigureSpec) => drawTrooper(g, f, 'commander');
export const drawPetard = (g: G, f: FigureSpec) => drawTrooper(g, f, 'sapper');

export const drawAATrooper = (g: G, f: FigureSpec) => drawTrooper(g, f, 'aa');
