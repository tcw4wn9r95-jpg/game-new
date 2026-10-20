// Ships, drawn as small 3D models: a lofted steel hull, decks, superstructure,
// radar masts, guns and missile cells, turned to one of eight headings and
// rolled a little for the swell. Faces are lit by the same sun as the buildings and drawn back to
// front. Coordinates are in tiles: u along the keel (bow +), v across
// (starboard +), z up from the waterline.
import { shade } from './figures';
import { ZK, lightOf } from './iso3d';
import { grade } from './materials';
import type { Sprite } from './sprites';

type G = CanvasRenderingContext2D;
type V3 = [number, number, number];

export type ShipType = 'fishing_ship' | 'transport_ship' | 'galley' | 'fire_ship' | 'demolition_raft' | 'siege_barge';
export const SHIP_TYPES: ShipType[] = ['fishing_ship', 'transport_ship', 'galley', 'fire_ship', 'demolition_raft', 'siege_barge'];

export interface ShipPose {
  /** Heading 0-7: 0 toward +x (screen lower right), counting clockwise on the map. */
  dir: number;
  /** Swell frame 0-1. */
  frame: number;
  /** Fishing: net out. */
  work: boolean;
  /** Firing (guns flash, missiles launch). */
  attack: boolean;
  /** Upgraded hull (Missile Boat). */
  elite: boolean;
}

interface Hull {
  /** Length, half-beam and freeboard (tiles). */
  L: number;
  B: number;
  D: number;
  /** Stern width as a share of the beam (a raft is square). */
  transom: number;
  wood: string;
  deck: string;
}

const HULLS: Record<ShipType, Hull> = {
  fishing_ship: { L: 1.3, B: 0.3, D: 0.2, transom: 0.7, wood: '#33465a', deck: '#8e9396' },
  transport_ship: { L: 1.8, B: 0.48, D: 0.24, transom: 0.95, wood: '#5f6a66', deck: '#7d8380' },
  galley: { L: 2.0, B: 0.32, D: 0.2, transom: 0.6, wood: '#7f8b94', deck: '#6c757c' },
  fire_ship: { L: 1.5, B: 0.3, D: 0.17, transom: 0.65, wood: '#6f7b82', deck: '#5f676d' },
  demolition_raft: { L: 1.0, B: 0.2, D: 0.08, transom: 0.7, wood: '#2c3136', deck: '#3a4046' },
  siege_barge: { L: 2.5, B: 0.42, D: 0.24, transom: 0.7, wood: '#8a959c', deck: '#737c82' },
};

/** Sprite bounds, in tiles around the anchor (the ship's centre on the water). */
const EXTENT = { x: 2, up: 3.2, down: 0.9 };

/** Paints a ship sprite at `s` device px per tile. */
export function shipSprite(type: ShipType, s: number, team: string, p: ShipPose): Sprite {
  const c = document.createElement('canvas');
  c.width = Math.ceil(EXTENT.x * 2 * s);
  c.height = Math.ceil((EXTENT.up + EXTENT.down) * s);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const ax = EXTENT.x * s, ay = EXTENT.up * s;
  g.translate(ax, ay);
  new ShipPainter(g, s, type, team, p).paint();
  grade(c, 0.04, p.dir * 7 + p.frame);
  return { c, ax, ay };
}

interface Item {
  depth: number;
  draw: () => void;
}

class ShipPainter {
  private readonly items: Item[] = [];
  private readonly h: Hull;
  private readonly fx: number;
  private readonly fy: number;
  private readonly roll: number;
  private readonly t: number;

  constructor(
    private readonly g: G,
    private readonly s: number,
    private readonly type: ShipType,
    private readonly team: string,
    private readonly p: ShipPose,
  ) {
    this.h = HULLS[type];
    const a = (p.dir * Math.PI) / 4;
    this.fx = Math.cos(a);
    this.fy = Math.sin(a);
    // Frame 0 rolls one way, frame 1 the other.
    this.t = Math.PI / 2 + (p.frame % 2) * Math.PI;
    this.roll = 0.05 * Math.sin(this.t);
  }

  // ---------- geometry ----------

  /** Ship-local point to map space (with the swell's roll). */
  private w(u: number, v: number, z: number): V3 {
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
    const v2 = v * cr - z * sr, z2 = v * sr + z * cr + 0.02 * Math.sin(this.t + u);
    return [u * this.fx - v2 * this.fy, u * this.fy + v2 * this.fx, z2];
  }

  private X(q: V3): [number, number] {
    return [(q[0] - q[1]) * this.s, ((q[0] + q[1]) / 2) * this.s - q[2] * this.s * ZK];
  }

  private static depth(pts: V3[]): number {
    let d = 0;
    for (const q of pts) d += q[0] + q[1] + q[2];
    return d / pts.length;
  }

  private static normal(pts: V3[]): V3 {
    // Newell's method: robust for slightly non-planar quads.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return [nx, ny, nz];
  }

  private path(pts: V3[]): void {
    const { g } = this;
    g.beginPath();
    pts.forEach((q, i) => {
      const [x, y] = this.X(q);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
  }

  /**
   * A lit face. `out` is a point the outward normal should face away from
   * (the hull's axis); faces turned from the viewer are skipped unless two-sided.
   */
  private face(pts: V3[], color: string, opts: { out?: V3; twoSided?: boolean; bias?: number; after?: () => void; edge?: string | null } = {}): void {
    let n = ShipPainter.normal(pts);
    if (opts.out) {
      const c = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length, a[2] + q[2] / pts.length] as V3, [0, 0, 0] as V3);
      if ((c[0] - opts.out[0]) * n[0] + (c[1] - opts.out[1]) * n[1] + (c[2] - opts.out[2]) * n[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    // Toward the viewer is +(1, 1, 1).
    const facing = n[0] + n[1] + n[2];
    if (facing <= 0) {
      if (!opts.twoSided) return;
      n = [-n[0], -n[1], -n[2]];
    }
    const light = lightOf(n);
    this.items.push({
      depth: ShipPainter.depth(pts) + (opts.bias ?? 0),
      draw: () => {
        const { g } = this;
        this.path(pts);
        g.fillStyle = shade(color, Math.max(0.35, Math.min(1.35, light)));
        g.fill();
        if (opts.edge !== null) {
          g.strokeStyle = opts.edge ?? 'rgba(30,18,8,0.45)';
          g.lineWidth = Math.max(0.6, this.s * 0.012);
          g.lineJoin = 'round';
          g.stroke();
        }
        opts.after?.();
      },
    });
  }

  private line(a: V3, b: V3, color: string, width: number, bias = 0): void {
    this.items.push({
      depth: ShipPainter.depth([a, b]) + bias,
      draw: () => {
        const { g } = this;
        const [x0, y0] = this.X(a), [x1, y1] = this.X(b);
        g.strokeStyle = color;
        g.lineWidth = Math.max(0.8, width * this.s);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      },
    });
  }

  private dot(q: V3, r: number, color: string, bias = 0): void {
    this.items.push({
      depth: q[0] + q[1] + q[2] + bias,
      draw: () => {
        const { g } = this;
        const [x, y] = this.X(q);
        const R = Math.max(0.8, r * this.s);
        const grad = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
        grad.addColorStop(0, shade(color, 1.25));
        grad.addColorStop(1, shade(color, 0.6));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fill();
      },
    });
  }

  // ---------- hull ----------

  /** Half-beam at a station t (-1 stern .. 1 bow). */
  private beam(t: number): number {
    const { B, transom } = this.h;
    if (this.type === 'transport_ship') return B * (t > 0.92 ? 0.92 : 1);
    if (t >= 0) return B * Math.pow(Math.max(0, 1 - t * t), 0.6);
    return B * Math.max(transom, Math.sqrt(Math.max(0, 1 - Math.pow(-t, 3))));
  }

  /** Deck edge height at a station: the sheer rises toward bow and stern. */
  private sheer(t: number): number {
    const { D } = this.h;
    if (this.type === 'transport_ship') return D;
    return D * (1 + 0.18 * t * t + (t > 0 ? 0.3 * t * t * t : 0));
  }

  private hull(): void {
    const { L, wood, deck } = this.h;
    const n = 12;
    const st = Array.from({ length: n + 1 }, (_, i) => -1 + (2 * i) / n);
    const axis = (u: number): V3 => this.w(u, 0, 0.02);
    const top = (t: number, side: number): V3 => this.w((t * L) / 2, side * this.beam(t), this.sheer(t));
    const wl = (t: number, side: number): V3 => this.w((t * L) / 2, side * this.beam(t) * 0.8, 0);
    const mid = (t: number, side: number, q: number): V3 => {
      const a = top(t, side), b = wl(t, side);
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
    };

    // Shadow on the water around the waterline.
    this.items.push({
      depth: -1e3,
      draw: () => {
        const { g } = this;
        const ring: V3[] = [...st.map((t) => this.w((t * L) / 2, this.beam(t) * 1.05 + 0.05, 0)), ...[...st].reverse().map((t) => this.w((t * L) / 2, -this.beam(t) * 1.05 - 0.05, 0))];
        this.path(ring);
        g.fillStyle = 'rgba(8,24,40,0.32)';
        g.fill();
      },
    });

    const stripe = this.team;
    for (let i = 0; i < n; i++) {
      const t0 = st[i], t1 = st[i + 1];
      const um = (((t0 + t1) / 2) * L) / 2;
      for (const side of [-1, 1]) {
        const pts = [top(t0, side), top(t1, side), wl(t1, side), wl(t0, side)];
        this.face(pts, wood, {
          out: axis(um),
          after: () => {
            const { g } = this;
            // A team band under the deck edge and dark anti-fouling at the waterline.
            this.path([mid(t0, side, 0.1), mid(t1, side, 0.1), mid(t1, side, 0.24), mid(t0, side, 0.24)]);
            g.fillStyle = shade(stripe, 0.95);
            g.fill();
            this.path([mid(t0, side, 0.78), mid(t1, side, 0.78), wl(t1, side), wl(t0, side)]);
            g.fillStyle = 'rgba(110,30,26,0.75)';
            g.fill();
          },
        });
      }
      // Deck, with non-slip panel seams.
      const dk = [top(t0, -1), top(t1, -1), top(t1, 1), top(t0, 1)];
      this.face(dk, shade(deck, 0.88), {
        twoSided: true,
        bias: -0.05,
        edge: null,
        after: () => {
          const { g } = this;
          g.strokeStyle = 'rgba(30,34,38,0.35)';
          g.lineWidth = Math.max(0.5, this.s * 0.008);
          for (const v of [-0.5, 0, 0.5]) {
            const a = this.w((t0 * L) / 2, v * this.beam(t0), this.sheer(t0)), b = this.w((t1 * L) / 2, v * this.beam(t1), this.sheer(t1));
            const [x0, y0] = this.X(a), [x1, y1] = this.X(b);
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
          }
        },
      });
    }
    // Gunwale rails.
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) this.line(top(st[i], side), top(st[i + 1], side), shade(wood, 0.55), 0.018, 0.02);
    // Transom.
    if (this.h.transom > 0) this.face([top(-1, -1), top(-1, 1), wl(-1, 1), wl(-1, -1)], shade(wood, 0.9), { out: axis(0) });
    if (this.type === 'transport_ship') {
      // The landing craft's bow ramp, raised.
      const z = this.sheer(1);
      this.face([this.w(L / 2, -this.h.B * 0.9, 0.02), this.w(L / 2, this.h.B * 0.9, 0.02), this.w(L / 2 + 0.06, this.h.B * 0.9, z + 0.06), this.w(L / 2 + 0.06, -this.h.B * 0.9, z + 0.06)], shade(wood, 0.9), { out: axis(0), twoSided: true });
    }
  }

  // ---------- rigging, crew and fittings ----------

  private deckZ(u: number): number {
    return this.sheer((u / this.h.L) * 2);
  }

  private mast(u: number, h: number): number {
    const z0 = this.deckZ(u);
    this.line(this.w(u, 0, z0), this.w(u, 0, z0 + h), '#3c4248', 0.035, 0.3);
    // A spinning radar bar near the top, and the owner's flag streaming aft.
    const top = z0 + h;
    const spin = this.p.dir * 0.7 + this.p.frame * 1.3;
    const r = 0.16;
    this.line(this.w(u + Math.cos(spin) * r, Math.sin(spin) * r, top - 0.12), this.w(u - Math.cos(spin) * r, -Math.sin(spin) * r, top - 0.12), '#d8dcdf', 0.03, 0.32);
    const wave = Math.sin(this.t * 1.5) * 0.04;
    this.face([this.w(u, 0, top), this.w(u - 0.3, wave, top - 0.04), this.w(u, 0, top - 0.12)], this.team, { twoSided: true, bias: 0.5, edge: null });
    return top;
  }

  /** A box on deck: u0..u1 along the keel, v0..v1 across, rising h from z0. */
  private block(u0: number, u1: number, v0: number, v1: number, z0: number, h: number, color: string, bias = 0.1, windows = false): void {
    const c = (u: number, v: number, z: number) => this.w(u, v, z);
    const out = this.w((u0 + u1) / 2, (v0 + v1) / 2, z0 + h / 2);
    const z1 = z0 + h;
    this.face([c(u0, v0, z1), c(u1, v0, z1), c(u1, v1, z1), c(u0, v1, z1)], shade(color, 1.08), { out, bias });
    const sides: Array<[number, number, number, number]> = [
      [u0, v0, u1, v0],
      [u1, v0, u1, v1],
      [u1, v1, u0, v1],
      [u0, v1, u0, v0],
    ];
    for (const [ua, va, ub, vb] of sides) {
      const front = ua === u1 && ub === u1;
      this.face([c(ua, va, z0), c(ub, vb, z0), c(ub, vb, z1), c(ua, va, z1)], color, {
        out,
        bias,
        after: windows
          ? () => {
              // A band of dark bridge windows.
              const { g } = this;
              const q = (k: number, z: number): V3 => c(ua + (ub - ua) * k, va + (vb - va) * k, z);
              this.path([q(0.1, z1 - h * 0.45), q(0.9, z1 - h * 0.45), q(0.9, z1 - h * 0.18), q(0.1, z1 - h * 0.18)]);
              g.fillStyle = front ? 'rgba(20,40,60,0.9)' : 'rgba(25,35,45,0.75)';
              g.fill();
            }
          : undefined,
      });
    }
  }

  /** A gun turret on deck, its barrel trained along `aim` (radians in ship space). */
  private turret(u: number, size: number, barrel: number, color: string, firing: boolean, aim = 0): void {
    const z = this.deckZ(u);
    this.block(u - size, u + size * 0.8, -size * 0.8, size * 0.8, z, size * 0.9, color, 0.2);
    const zb = z + size * 0.5;
    const tip = this.w(u + Math.cos(aim) * barrel, Math.sin(aim) * barrel, zb + 0.02);
    this.line(this.w(u, 0, zb), tip, '#2e3338', Math.max(0.018, size * 0.28), 0.25);
    if (firing) this.flash(tip, size * 1.4);
  }

  private flash(q: V3, r: number, bias = 0.5): void {
    this.items.push({
      depth: q[0] + q[1] + q[2] + bias,
      draw: () => {
        const { g } = this;
        const [x, y] = this.X(q);
        const R = Math.max(2, r * this.s);
        const grad = g.createRadialGradient(x, y, 0, x, y, R);
        grad.addColorStop(0, 'rgba(255,255,230,1)');
        grad.addColorStop(0.35, 'rgba(255,200,70,0.9)');
        grad.addColorStop(1, 'rgba(255,100,20,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fill();
      },
    });
  }

  /** A sailor or marine: a body and a head (a helmet for soldiers). */
  private crew(u: number, v: number, cloth: string, helm = false): void {
    const z = this.deckZ(u);
    this.line(this.w(u, v, z), this.w(u, v, z + 0.2), cloth, 0.09, 0.1);
    this.dot(this.w(u, v, z + 0.25), 0.045, helm ? '#5d6344' : '#d8aa80', 0.12);
  }

  // ---------- types ----------

  paint(): void {
    this.hull();
    const fire = this.p.attack;
    switch (this.type) {
      case 'fishing_ship': {
        // Trawler: wheelhouse forward, an A-frame gantry and net drum aft.
        this.block(0.1, 0.42, -0.2, 0.2, this.deckZ(0.25), 0.26, '#e8e6e0', 0.1, true);
        this.mast(0.3, 0.75);
        const za = this.deckZ(-0.5);
        this.line(this.w(-0.55, -0.22, za), this.w(-0.55, 0, za + 0.5), '#d0661c', 0.03, 0.2);
        this.line(this.w(-0.55, 0.22, za), this.w(-0.55, 0, za + 0.5), '#d0661c', 0.03, 0.2);
        this.dot(this.w(-0.3, 0, this.deckZ(-0.3) + 0.06), 0.08, '#2f78c8', 0.05);
        this.crew(-0.15, 0.08, '#e8661c');
        if (this.p.work) {
          // Net trailing over the stern from the gantry.
          const a = this.w(-0.55, 0, za + 0.48);
          const dip = 0.1 * Math.sin(this.t);
          for (let k = 0; k < 5; k++) this.line(a, this.w(-1.0 - (k % 2) * 0.1, -0.3 + k * 0.15 + dip, -0.02), 'rgba(230,220,190,0.75)', 0.01, 0.2);
        }
        break;
      }
      case 'transport_ship': {
        // Landing craft: open well deck with a vehicle and troops, bridge aft.
        this.block(-0.85, -0.5, -0.36, 0.36, this.deckZ(-0.7), 0.34, '#76807c', 0.1, true);
        this.mast(-0.65, 0.75);
        this.block(-0.1, 0.45, -0.17, 0.17, this.deckZ(0.2), 0.14, shade(this.team, 0.75), 0.1);
        for (const [u, v] of [[0.6, 0.2], [0.6, -0.2], [-0.25, 0.25], [-0.25, -0.25]]) this.crew(u, v, '#5d6344', true);
        break;
      }
      case 'galley': {
        // Patrol boat (missile boat when upgraded): bridge, mast, deck gun forward.
        this.block(-0.25, 0.3, -0.22, 0.22, this.deckZ(0), 0.3, '#9aa5ad', 0.1, true);
        this.block(-0.2, 0.15, -0.16, 0.16, this.deckZ(0) + 0.3, 0.12, '#8f9aa2', 0.15);
        this.mast(0.0, 0.85);
        this.turret(0.65, 0.09, 0.3, '#8f9aa2', fire);
        if (this.p.elite) {
          // Angled anti-ship missile canisters aft.
          for (const v of [-0.14, 0.14]) {
            const z = this.deckZ(-0.6);
            this.line(this.w(-0.75, v, z + 0.05), this.w(-0.45, v, z + 0.15), '#c9cfd2', 0.06, 0.2);
          }
        } else this.turret(-0.65, 0.06, 0.18, '#8f9aa2', false, Math.PI);
        this.crew(-0.45, 0.12, '#2a3a4a', true);
        break;
      }
      case 'fire_ship': {
        // Gunboat: low hull, armoured cabin and a rapid-fire autocannon up front.
        this.block(-0.35, 0.1, -0.18, 0.18, this.deckZ(-0.1), 0.24, '#7d8990', 0.1, true);
        this.mast(-0.2, 0.6);
        this.turret(0.45, 0.08, 0.32, '#5c666d', fire);
        if (fire) this.flash(this.w(0.45 + 0.38, 0.03, this.deckZ(0.45) + 0.06), 0.1);
        this.crew(-0.55, -0.08, '#2a3a4a', true);
        break;
      }
      case 'demolition_raft': {
        // Drone boat: a low dark hull, a sensor mast and a warhead in the bow.
        const z = this.deckZ(0);
        this.block(-0.3, 0.05, -0.1, 0.1, z, 0.08, '#3a4148', 0.1);
        this.line(this.w(-0.2, 0, z + 0.08), this.w(-0.2, 0, z + 0.32), '#1e2226', 0.015, 0.3);
        this.dot(this.w(-0.2, 0, z + 0.33), 0.03, Math.floor(this.t) % 2 ? '#ff3a2a' : '#8a1a12', 0.35);
        this.block(0.15, 0.35, -0.08, 0.08, z, 0.05, '#e8c22a', 0.12);
        this.dot(this.w(-0.32, 0, z + 0.12), 0.035, this.team, 0.2);
        break;
      }
      case 'siege_barge': {
        // Destroyer: forward gun, vertical launch cells, stepped superstructure and a lattice mast.
        this.turret(0.85, 0.1, 0.32, '#9aa5ad', fire && this.p.frame % 2 === 0);
        const zc = this.deckZ(0.5);
        this.block(0.4, 0.62, -0.2, 0.2, zc, 0.05, '#5f686e', 0.1);
        for (let k = 0; k < 4; k++) for (const v of [-0.1, 0.1]) this.dot(this.w(0.44 + k * 0.05, v, zc + 0.06), 0.012, '#2a2f34', 0.15);
        if (fire) this.flash(this.w(0.5, 0, zc + 0.25), 0.3);
        this.block(-0.45, 0.32, -0.32, 0.32, this.deckZ(0), 0.3, '#9aa5ad', 0.1, true);
        this.block(-0.2, 0.25, -0.24, 0.24, this.deckZ(0) + 0.3, 0.2, '#929da5', 0.15, true);
        this.mast(0.0, 1.05);
        this.block(-0.75, -0.55, -0.12, 0.12, this.deckZ(-0.6), 0.22, '#5f686e', 0.1);
        this.block(-1.15, -0.85, -0.3, 0.3, this.deckZ(-1), 0.04, '#5f676d', 0.05);
        break;
      }
    }
    this.items.sort((a, b) => a.depth - b.depth);
    for (const it of this.items) it.draw();
  }
}

/** Portrait framing: the ship side-on, filling the square. */
export function shipPortrait(type: ShipType, px: number, team: string): HTMLCanvasElement {
  const sp = shipSprite(type, px / 3.2, team, { dir: 1, frame: 0, work: false, attack: false, elite: false });
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.drawImage(sp.c, px / 2 - sp.ax, px * 0.68 - sp.ay);
  return c;
}

/** Heading (0-7) for a movement direction in map space. */
export function headingOf(dx: number, dy: number): number {
  return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
}
