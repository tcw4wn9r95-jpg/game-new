// Ships, drawn as small 3D models: a lofted plank hull, decks, masts, sails,
// oars and crew, turned to one of eight headings and rolled a little for the
// swell. Faces are lit by the same sun as the buildings and drawn back to
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
  /** Firing (fire ship pots blaze, barge arm thrown). */
  attack: boolean;
  /** Upgraded hull (War Galley). */
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
  fishing_ship: { L: 1.25, B: 0.3, D: 0.17, transom: 0.45, wood: '#86603a', deck: '#b8925e' },
  transport_ship: { L: 1.75, B: 0.48, D: 0.26, transom: 0.6, wood: '#7a5434', deck: '#b28c58' },
  galley: { L: 2.0, B: 0.36, D: 0.2, transom: 0.4, wood: '#6e4a2c', deck: '#a8824e' },
  fire_ship: { L: 1.55, B: 0.36, D: 0.19, transom: 0.45, wood: '#4c3424', deck: '#7a5a3a' },
  demolition_raft: { L: 1.0, B: 0.42, D: 0.07, transom: 1, wood: '#7c6440', deck: '#9c7c4c' },
  siege_barge: { L: 1.95, B: 0.6, D: 0.2, transom: 0.85, wood: '#6a4a2e', deck: '#a07c4c' },
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
    if (this.type === 'demolition_raft') return B;
    if (t >= 0) return B * Math.pow(Math.max(0, 1 - t * t), 0.6);
    return B * Math.max(transom, Math.sqrt(Math.max(0, 1 - Math.pow(-t, 3))));
  }

  /** Deck edge height at a station: the sheer rises toward bow and stern. */
  private sheer(t: number): number {
    const { D } = this.h;
    if (this.type === 'demolition_raft' || this.type === 'siege_barge') return D;
    return D * (1 + 0.55 * t * t + (t > 0 ? 0.35 * t * t * t : 0));
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

    const stripe = this.p.elite ? '#d8b048' : this.team;
    for (let i = 0; i < n; i++) {
      const t0 = st[i], t1 = st[i + 1];
      const um = (((t0 + t1) / 2) * L) / 2;
      for (const side of [-1, 1]) {
        const pts = [top(t0, side), top(t1, side), wl(t1, side), wl(t0, side)];
        this.face(pts, wood, {
          out: axis(um),
          after: () => {
            const { g } = this;
            // Strakes, a dark wale and a painted band under the gunwale.
            g.lineWidth = Math.max(0.6, this.s * 0.01);
            g.strokeStyle = 'rgba(28,16,6,0.55)';
            for (const q of [0.42, 0.66, 0.86]) {
              const [x0, y0] = this.X(mid(t0, side, q)), [x1, y1] = this.X(mid(t1, side, q));
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
            }
            if (this.type !== 'demolition_raft') {
              this.path([mid(t0, side, 0.1), mid(t1, side, 0.1), mid(t1, side, 0.26), mid(t0, side, 0.26)]);
              g.fillStyle = shade(stripe, 0.85);
              g.fill();
            }
            // Wet, darker wood at the waterline.
            this.path([mid(t0, side, 0.86), mid(t1, side, 0.86), wl(t1, side), wl(t0, side)]);
            g.fillStyle = 'rgba(20,40,40,0.35)';
            g.fill();
          },
        });
      }
      // Deck planking.
      const dk = [top(t0, -1), top(t1, -1), top(t1, 1), top(t0, 1)];
      this.face(dk, shade(deck, 0.88), {
        twoSided: true,
        bias: -0.05,
        edge: null,
        after: () => {
          const { g } = this;
          g.strokeStyle = 'rgba(60,36,16,0.4)';
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
      for (let i = 0; i < n; i++) this.line(top(st[i], side), top(st[i + 1], side), shade(wood, 0.6), 0.025, 0.02);
    // Transom.
    if (this.h.transom > 0) this.face([top(-1, -1), top(-1, 1), wl(-1, 1), wl(-1, -1)], shade(wood, 0.9), { out: axis(0) });
    // Bow stem post.
    if (this.type !== 'demolition_raft' && this.type !== 'siege_barge') this.line(this.w(L / 2, 0, 0), this.w(L / 2 + 0.06, 0, this.sheer(1) + 0.08), shade(wood, 0.7), 0.04);
  }

  // ---------- rigging, crew and fittings ----------

  private deckZ(u: number): number {
    return this.sheer((u / this.h.L) * 2);
  }

  private mast(u: number, h: number): number {
    const z0 = this.deckZ(u);
    this.line(this.w(u, 0, z0), this.w(u, 0, z0 + h), '#5a3c22', 0.045, 0.3);
    // A pennant in the owner's colours, streaming aft.
    const top = z0 + h;
    const wave = Math.sin(this.t * 1.5) * 0.04;
    this.face([this.w(u, 0, top), this.w(u - 0.32, wave, top - 0.05), this.w(u, 0, top - 0.11)], this.team, { twoSided: true, bias: 0.5, edge: null });
    return top;
  }

  /** A square sail on a yard, bellied forward, with a band of team colour. */
  private squareSail(u: number, zBot: number, zTop: number, half: number): void {
    const rows = 3, cols = 4;
    const belly = 0.14;
    const pt = (i: number, j: number): V3 => {
      const v = -half + (2 * half * j) / cols;
      const z = zTop - ((zTop - zBot) * i) / rows;
      const bow = belly * (1 - Math.pow(v / half, 2)) * Math.sin((Math.PI * (i + 0.6)) / (rows + 0.6));
      return this.w(u + bow, v, z);
    };
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const color = i === 1 ? this.team : this.p.elite ? '#f0e6cc' : '#e6dcc2';
        this.face([pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j)], color, { twoSided: true, bias: 0.35, edge: 'rgba(80,60,40,0.25)' });
      }
    this.line(this.w(u, -half * 1.08, zTop), this.w(u, half * 1.08, zTop), '#4a3020', 0.03, 0.36);
  }

  /** A triangular fore-and-aft sail (fishing boats). */
  private lateen(u: number, zBot: number, zTop: number, len: number): void {
    const b = 0.08 * Math.sin(this.t);
    const a = this.w(u + 0.05, 0, zTop), c = this.w(u - len, 0.1 + b, zBot + 0.05), d = this.w(u + 0.25, 0.04, zBot);
    this.face([a, c, d], '#e8dcc0', { twoSided: true, bias: 0.35, edge: 'rgba(80,60,40,0.3)' });
    this.line(this.w(u + 0.3, 0, zBot - 0.02), this.w(u - len - 0.05, 0.1, zBot + 0.25), '#4a3020', 0.025, 0.36);
  }

  /** A sailor or marine: a body and a head (a helmet for soldiers). */
  private crew(u: number, v: number, cloth: string, helm = false): void {
    const z = this.deckZ(u);
    this.line(this.w(u, v, z), this.w(u, v, z + 0.2), cloth, 0.09, 0.1);
    this.dot(this.w(u, v, z + 0.25), 0.045, helm ? '#8a8e94' : '#d8aa80', 0.12);
  }

  private oars(n: number, from: number, to: number, reach: number): void {
    const { L } = this.h;
    for (let k = 0; k < n; k++) {
      const u = (from + ((to - from) * k) / Math.max(1, n - 1)) * (L / 2);
      const t = (u / L) * 2;
      const sweep = 0.16 * Math.sin(this.t + 0.3);
      for (const side of [-1, 1]) {
        const a = this.w(u, side * this.beam(t), this.sheer(t) - 0.02);
        const b = this.w(u + sweep, side * (this.beam(t) + reach), -0.02);
        this.line(a, b, '#6a4a2a', 0.022, 0.01);
      }
    }
  }

  private crate(u: number, v: number, size: number, color: string): void {
    const z = this.deckZ(u);
    const hs = size / 2;
    const c = (du: number, dv: number, dz: number) => this.w(u + du, v + dv, z + dz);
    const out = this.w(u, v, z + hs);
    this.face([c(-hs, -hs, size), c(hs, -hs, size), c(hs, hs, size), c(-hs, hs, size)], shade(color, 1.1), { out, bias: 0.1 });
    for (const [a, b] of [
      [c(-hs, -hs, 0), c(hs, -hs, 0)],
      [c(hs, -hs, 0), c(hs, hs, 0)],
      [c(hs, hs, 0), c(-hs, hs, 0)],
      [c(-hs, hs, 0), c(-hs, -hs, 0)],
    ]) {
      const up = (q: V3): V3 => [q[0], q[1], q[2] + size];
      this.face([a, b, up(b), up(a)], color, { out, bias: 0.1 });
    }
  }

  private flame(q: V3, r: number, bias = 0.4): void {
    this.items.push({
      depth: q[0] + q[1] + q[2] + bias,
      draw: () => {
        const { g } = this;
        const [x, y] = this.X(q);
        const R = r * this.s * (1 + 0.15 * Math.sin(this.t * 2));
        const grad = g.createRadialGradient(x, y, 0, x, y - R * 0.6, R * 1.4);
        grad.addColorStop(0, 'rgba(255,248,200,0.95)');
        grad.addColorStop(0.35, 'rgba(255,170,40,0.9)');
        grad.addColorStop(1, 'rgba(200,40,10,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - R * 0.7, y);
        g.quadraticCurveTo(x - R * 0.5, y - R * 1.4, x + Math.sin(this.t) * R * 0.3, y - R * 2.2);
        g.quadraticCurveTo(x + R * 0.6, y - R * 1.2, x + R * 0.7, y);
        g.closePath();
        g.fill();
      },
    });
  }

  // ---------- types ----------

  paint(): void {
    this.hull();
    const { L } = this.h;
    switch (this.type) {
      case 'fishing_ship': {
        const top = this.mast(0.1, 0.95);
        this.lateen(0.12, this.deckZ(0) + 0.2, top - 0.05, 0.55);
        this.crew(-0.35, 0.05, '#6b5a42');
        if (this.p.work) {
          // Net cast over the side from a boom.
          const a = this.w(-0.1, 0.32, this.deckZ(-0.1) + 0.3);
          this.line(this.w(-0.1, 0, this.deckZ(-0.1) + 0.3), a, '#4a3020', 0.02, 0.2);
          const dip = 0.1 * Math.sin(this.t);
          for (let k = 0; k < 5; k++) this.line(a, this.w(-0.45 + k * 0.18, 0.6 + dip, -0.02), 'rgba(230,220,190,0.75)', 0.01, 0.2);
          this.line(this.w(-0.45, 0.6 + dip, -0.02), this.w(0.27, 0.6 + dip, -0.02), 'rgba(230,220,190,0.75)', 0.012, 0.2);
        } else {
          // Net heaped on the stern.
          this.dot(this.w(-0.45, -0.05, this.deckZ(-0.45) + 0.04), 0.07, '#9a8c6a', 0.05);
        }
        break;
      }
      case 'transport_ship': {
        const top = this.mast(0.05, 1.35);
        this.squareSail(0.08, this.deckZ(0) + 0.35, top - 0.12, 0.42);
        this.crate(0.45, 0.15, 0.16, '#8a6a42');
        this.crate(0.42, -0.15, 0.14, '#7c5e3a');
        this.crate(-0.45, 0.1, 0.18, '#8a6a42');
        this.dot(this.w(-0.5, -0.2, this.deckZ(-0.5) + 0.07), 0.07, '#6e4a2a', 0.05);
        this.crew(-0.75, 0, '#575866');
        // A steering oar over the stern.
        this.line(this.w(-L / 2 + 0.05, 0.2, this.deckZ(-L / 2) + 0.1), this.w(-L / 2 - 0.15, 0.32, -0.02), '#5a3c22', 0.03);
        break;
      }
      case 'galley': {
        const top = this.mast(0.1, this.p.elite ? 1.45 : 1.3);
        this.squareSail(0.12, this.deckZ(0) + 0.4, top - 0.12, 0.36);
        this.oars(this.p.elite ? 6 : 5, -0.65, 0.55, 0.42);
        for (const [u, v] of [
          [0.55, 0.12],
          [-0.35, -0.1],
          [-0.6, 0.1],
        ])
          this.crew(u, v, this.team, true);
        // A bronze ram at the waterline.
        this.line(this.w(L / 2 - 0.05, 0, 0.04), this.w(L / 2 + 0.22, 0, 0.03), '#a07a3a', 0.05, 0.05);
        break;
      }
      case 'fire_ship': {
        const top = this.mast(-0.1, 1.05);
        this.squareSail(-0.08, this.deckZ(0) + 0.35, top - 0.1, 0.3);
        this.oars(3, -0.5, 0.3, 0.38);
        // Pitch pots on the foredeck, and a siphon nozzle over the bow.
        for (const [u, v] of [
          [0.42, 0.12],
          [0.42, -0.12],
          [0.6, 0],
        ]) {
          const q = this.w(u, v, this.deckZ(u) + 0.06);
          this.dot(q, 0.06, '#3a2a20', 0.05);
          if (this.p.attack || (this.p.frame + u * 10) % 2 < 1) this.flame([q[0], q[1], q[2] + 0.05], this.p.attack ? 0.09 : 0.05);
        }
        this.line(this.w(0.55, 0, this.deckZ(0.55) + 0.12), this.w(L / 2 + 0.15, 0, this.deckZ(0.7) + 0.14), '#8a7a6a', 0.035, 0.3);
        this.crew(-0.45, 0, '#4a3a2a');
        break;
      }
      case 'demolition_raft': {
        // Lashed logs, a stack of powder kegs and a sputtering fuse.
        for (const [u, v] of [
          [0.05, 0.12],
          [0.05, -0.12],
          [-0.18, 0],
          [0.22, 0],
        ]) {
          const q = this.w(u, v, this.deckZ(u) + 0.07);
          this.dot(q, 0.085, '#5a3a20', 0.05);
          this.dot([q[0], q[1], q[2] + 0.07], 0.05, '#2a2420', 0.08);
        }
        const tip = this.w(0.05, 0, this.deckZ(0) + 0.32);
        this.line(this.w(0.05, 0, this.deckZ(0) + 0.14), tip, '#3a3020', 0.015, 0.3);
        this.flame(tip, 0.035, 0.4);
        this.crew(-0.38, 0.05, '#4f5a4a');
        break;
      }
      case 'siege_barge': {
        this.oars(4, -0.6, 0.45, 0.4);
        // A catapult on deck: frame, arm (thrown when firing) and a stone.
        const u0 = 0.05, z0 = this.deckZ(u0);
        const frame = (dv: number) => this.line(this.w(u0 - 0.25, dv, z0), this.w(u0 + 0.05, dv, z0 + 0.42), '#5a3c22', 0.05, 0.1);
        frame(-0.18);
        frame(0.18);
        this.line(this.w(u0 - 0.3, -0.2, z0), this.w(u0 + 0.25, -0.2, z0), '#4e331b', 0.05, 0.05);
        this.line(this.w(u0 - 0.3, 0.2, z0), this.w(u0 + 0.25, 0.2, z0), '#4e331b', 0.05, 0.05);
        this.line(this.w(u0 + 0.05, -0.2, z0 + 0.4), this.w(u0 + 0.05, 0.2, z0 + 0.4), '#4e331b', 0.045, 0.12);
        const thrown = this.p.attack;
        const armTip = thrown ? this.w(u0 + 0.25, 0, z0 + 0.75) : this.w(u0 - 0.55, 0, z0 + 0.12);
        this.line(this.w(u0, 0, z0 + 0.08), armTip, '#6e4a2a', 0.05, 0.2);
        if (!thrown) this.dot([armTip[0], armTip[1], armTip[2] + 0.05], 0.07, '#8a8680', 0.25);
        this.crew(-0.65, 0.18, '#575866');
        this.crew(-0.7, -0.15, '#575866');
        this.mast(-0.8, 0.6);
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
