// Seeded procedural map generation for the four map types.
// Pipeline: start positions -> water shape -> fords -> elevation -> ground types ->
// per-start resources -> forests -> contested deposits -> fish -> land connectivity fix.
import data from '../data/maps.json';
import { Noise } from './noise';
import { Rng } from './rng';
import { Feature, type FeatureId, type GameMap, type MapSize, type MapType, type Point, Terrain, isWater } from './terrain';

export interface MapOptions {
  type: MapType;
  size: MapSize;
  /** 2 to 4 player slots. Slots are ordered around the map so 2v2 teammates are neighbours. */
  players: number;
  seed: number;
}

const TAU = Math.PI * 2;
const NEIGHBORS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Teams by slot for river placement: first half vs second half. */
function teamOf(slot: number, players: number): number {
  return slot < Math.ceil(players / 2) ? 0 : 1;
}

export function generateMap(opts: MapOptions): GameMap {
  return new MapBuilder(opts).build();
}

/**
 * How this particular map is made: one of several layouts for its type, and
 * the size and spread of its forests, hills and bases. Rolled from the seed,
 * so no two maps of a type share a template; fairness rules (resources at
 * every base, walkable routes between bases) still hold for all of them.
 */
interface Look {
  layout: string;
  startR: number;
  /** Bases drift this share of their spacing around the circle. */
  jitter: number;
  cx: number;
  cy: number;
  forest: 'clumps' | 'belts' | 'groves' | 'mixed';
  forestBias: number;
  forestScale: number;
  hillLow: number;
  hillScale: number;
  dirt: number;
  /** The tree line behind each base: turned and widened. */
  arcTurn: number;
  arcWidth: number;
  /** Its distance from the base and depth. */
  arcR: number;
  arcDepth: number;
  ponds: number;
}

const LAYOUTS: Record<string, string[]> = {
  heartland: ['river', 'fork', 'twin', 'marsh', 'bend'],
  coastal: ['straight', 'bay', 'gulf', 'isles'],
  lakes: ['central', 'scattered', 'twin', 'ring'],
  islands: ['classic', 'scattered', 'big', 'chain'],
};

class MapBuilder {
  private readonly look: Look;
  private readonly N: number;
  private readonly cfg: (typeof data.sizes)[MapSize];
  private readonly rng: Rng;
  private readonly shapeNoise: Noise;
  private readonly hillNoise: Noise;
  private readonly forestNoise: Noise;
  private readonly map: GameMap;
  /** Tiles kept free of forests and deposits (fords, start areas). */
  private readonly reserved: Uint8Array;
  /** Islands only: index of the island each land tile belongs to, -1 for water. */
  private islandOf: Int16Array | null = null;
  private starts: Point[] = [];
  /** Coastal only: direction from the map centre toward the sea. */
  private seaAngle = 0;

  constructor(private readonly opts: MapOptions) {
    this.cfg = data.sizes[opts.size];
    this.N = this.cfg.tiles;
    this.rng = new Rng(opts.seed);
    this.shapeNoise = new Noise(this.rng);
    this.hillNoise = new Noise(this.rng);
    this.forestNoise = new Noise(this.rng);
    this.look = this.rollLook();
    const n = this.N * this.N;
    this.reserved = new Uint8Array(n);
    this.map = {
      type: opts.type,
      sizeName: opts.size,
      seed: opts.seed,
      size: this.N,
      terrain: new Uint8Array(n),
      elevation: new Uint8Array(n),
      feature: new Uint8Array(n),
      amount: new Uint16Array(n),
      animals: [],
      starts: [],
    };
  }

  build(): GameMap {
    this.placeStarts();
    this.shapeWater();
    this.clearStartAreas();
    if (this.opts.type !== 'islands') this.bridgeCutOffStarts();
    this.shapeElevation();
    this.paintGround();
    this.starts.forEach((s, i) => this.placeStartResources(s, i));
    this.placeForests();
    this.placeContestedDeposits();
    this.placeDeepFish();
    if (this.opts.type !== 'islands') this.ensureStartsConnected();
    this.map.starts = this.starts;
    return this.map;
  }

  private rollLook(): Look {
    const r = () => this.rng.next();
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    const islands = this.opts.type === 'islands';
    return {
      layout: pick(LAYOUTS[this.opts.type]),
      startR: (islands ? 0.33 : 0.36) + (r() - 0.5) * (islands ? 0.04 : 0.08),
      jitter: r() * 0.09,
      cx: 0.5 + (r() - 0.5) * 0.06,
      cy: 0.5 + (r() - 0.5) * 0.06,
      forest: pick(['clumps', 'belts', 'groves', 'mixed'] as const),
      forestBias: (r() - 0.5) * 0.06,
      forestScale: 9 + r() * 7,
      hillLow: 0.54 + r() * 0.14,
      hillScale: 9 + r() * 12,
      dirt: 0.66 + r() * 0.12,
      arcTurn: (r() - 0.5) * 1.6,
      arcWidth: 0.7 + r() * 0.7,
      arcR: 13 + r() * 4,
      arcDepth: 3 + r() * 2.5,
      ponds: 0.3 + r() * 1.9,
    };
  }

  // ---------- helpers ----------

  private idx(x: number, y: number) {
    return y * this.N + x;
  }

  private inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.N && y < this.N;
  }

  private distToStart(x: number, y: number, s: Point) {
    return Math.hypot(x - s.x, y - s.y);
  }

  private nearestStart(x: number, y: number): number {
    let best = 0, bd = Infinity;
    this.starts.forEach((s, i) => {
      const d = this.distToStart(x, y, s);
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }

  private minStartDist(x: number, y: number) {
    return Math.min(...this.starts.map((s) => this.distToStart(x, y, s)));
  }

  private isLand(i: number) {
    return !isWater(this.map.terrain[i]);
  }

  /** Free for a resource: dry land, empty, not reserved, outside every Town Center area. */
  private free(x: number, y: number): boolean {
    if (!this.inside(x, y)) return false;
    const i = this.idx(x, y);
    return this.isLand(i) && this.map.feature[i] === Feature.None && !this.reserved[i];
  }

  private setFeature(x: number, y: number, f: FeatureId, amount: number) {
    const i = this.idx(x, y);
    this.map.feature[i] = f;
    this.map.amount[i] = Math.min(65535, Math.round(amount));
  }

  // ---------- 1. start positions ----------

  private placeStarts() {
    const { N } = this;
    const p = this.opts.players;
    const a0 = this.rng.next() * TAU;
    const L = this.look;
    const pts: Array<[number, number]> = [];
    if (this.opts.type === 'coastal') {
      // Sea lies in direction a0; players spread over the landward half circle.
      const cx = 0.5 - 0.02 * Math.cos(a0), cy = 0.5 - 0.02 * Math.sin(a0);
      for (let i = 0; i < p; i++) {
        const a = a0 + Math.PI / 2 + (i * Math.PI) / (p - 1) + (this.rng.next() - 0.5) * L.jitter * 2;
        const r = 0.29 + L.jitter * 0.5 + (this.rng.next() - 0.5) * 0.03;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      this.seaAngle = a0;
    } else {
      for (let i = 0; i < p; i++) {
        const a = a0 + (i * TAU) / p + (this.rng.next() - 0.5) * 2 * L.jitter * (TAU / p);
        const r = L.startR + (this.rng.next() - 0.5) * 0.03;
        pts.push([L.cx + r * Math.cos(a), L.cy + r * Math.sin(a)]);
      }
    }
    const lo = 12, hi = N - 13;
    this.starts = pts.map(([x, y]) => ({
      x: Math.max(lo, Math.min(hi, Math.round(x * N))),
      y: Math.max(lo, Math.min(hi, Math.round(y * N))),
    }));
  }

  // ---------- 2. water ----------

  private shapeWater() {
    const L = this.look, N = this.N, r = () => this.rng.next();
    switch (this.opts.type) {
      case 'heartland': {
        const ponds = (k: number) => this.addPonds(Math.round(((N * N) / 20000) * L.ponds * k));
        if (L.layout === 'twin') {
          // Two rivers with a strip of land between them.
          const gap = (0.09 + r() * 0.05) * N;
          this.carveRiver(gap, 0.85);
          this.carveRiver(-gap, 0.85);
        } else if (L.layout === 'fork') {
          this.carveRiver(0, 1, true);
        } else if (L.layout === 'marsh') {
          // A narrow river through boggy ground: shallows walk, pools don't.
          this.carveRiver(0, 0.7);
          this.addMarsh(Math.round((N * N) / 2600));
          ponds(1.5);
          return;
        } else if (L.layout === 'bend') {
          this.carveRiver(0, 1.25, false, 2.2);
        } else this.carveRiver(0, 0.8 + r() * 0.5);
        ponds(1);
        return;
      }
      case 'coastal': {
        const proj = (nx: number, ny: number) => (nx - 0.5) * Math.cos(this.seaAngle) + (ny - 0.5) * Math.sin(this.seaAngle);
        const perp = (nx: number, ny: number) => -(nx - 0.5) * Math.sin(this.seaAngle) + (ny - 0.5) * Math.cos(this.seaAngle);
        const edge = 0.12 + r() * 0.08, wob = 0.08 + r() * 0.12;
        if (L.layout === 'bay') {
          // The coast curves round a great bay.
          const R = 0.5 + r() * 0.25, c = edge + R;
          this.fillWhere((nx, ny, n) => Math.hypot(proj(nx, ny) - c, perp(nx, ny)) < R + (n - 0.5) * wob);
        } else if (L.layout === 'gulf') {
          // A long inlet reaching inland between the bases.
          const w = 0.035 + r() * 0.03, reach = -0.02 - r() * 0.06, lean = (r() - 0.5) * 0.3;
          this.fillWhere(
            (nx, ny, n) =>
              proj(nx, ny) > edge + (n - 0.5) * wob || (Math.abs(perp(nx, ny) - lean * (proj(nx, ny) - edge)) < w + (n - 0.5) * 0.04 && proj(nx, ny) > reach),
          );
        } else this.fillWhere((nx, ny, n) => proj(nx, ny) > edge + (n - 0.5) * wob);
        const isles = L.layout === 'isles' ? 3 : 1;
        this.addOffshoreIsles(Math.round(((N * N) / 16000) * isles), (nx, ny) => proj(nx, ny) > edge + 0.08);
        return;
      }
      case 'lakes': {
        if (L.layout === 'scattered') {
          this.addLakes(3 + Math.floor(r() * 3), (0.05 + r() * 0.04) * N);
        } else if (L.layout === 'twin') {
          // Two lakes either side of the line between the bases.
          const a = Math.atan2(this.starts[1].y - this.starts[0].y, this.starts[1].x - this.starts[0].x) + Math.PI / 2;
          const d = 0.16 + r() * 0.08, rr = 0.1 + r() * 0.04;
          for (const side of [-1, 1]) {
            const lx = L.cx + Math.cos(a) * d * side, ly = L.cy + Math.sin(a) * d * side;
            this.fillWhere((nx, ny, n) => Math.hypot(nx - lx, ny - ly) < rr + (n - 0.5) * 0.08);
          }
        } else if (L.layout === 'ring') {
          // A ring of water round a central isle, broken by land bridges.
          const R = 0.15 + r() * 0.04, w = 0.03 + r() * 0.015, gaps = 2 + Math.floor(r() * 3), g0 = r() * TAU;
          this.fillWhere((nx, ny, n) => {
            const d = Math.hypot(nx - L.cx, ny - L.cy);
            if (Math.abs(d - R) > w + (n - 0.5) * 0.03) return false;
            const a = Math.atan2(ny - L.cy, nx - L.cx) - g0;
            const k = ((((a / TAU) * gaps) % 1) + 1) % 1;
            return k > 0.12;
          });
        } else {
          // One great lake, of any size and stretch.
          const ra = 0.14 + r() * 0.09, rb = ra * (0.65 + r() * 0.5), rot = r() * Math.PI;
          this.fillWhere((nx, ny, n) => {
            const dx = nx - L.cx, dy = ny - L.cy;
            const u = dx * Math.cos(rot) + dy * Math.sin(rot), v = -dx * Math.sin(rot) + dy * Math.cos(rot);
            return Math.hypot(u / ra, v / rb) < 1 + (n - 0.5) * 0.5;
          });
        }
        this.addPonds(Math.round(((N * N) / 9000) * L.ponds));
        return;
      }
      case 'islands':
        return this.shapeIslands();
    }
  }

  private fillWhere(isSea: (nx: number, ny: number, noise: number) => boolean) {
    const { N } = this;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const n = this.shapeNoise.fbm(x, y, 12);
        if (isSea((x + 0.5) / N, (y + 0.5) / N, n)) this.map.terrain[this.idx(x, y)] = Terrain.Deep;
      }
  }

  /** Small lakes away from the bases. */
  private addPonds(count: number) {
    const { N } = this;
    const minStart = data.start.cityRadius + 6;
    for (let k = 0, tries = 0; k < count && tries < count * 50; tries++) {
      const r = 3 + this.rng.next() * 5;
      const cx = this.rng.int(8, N - 9), cy = this.rng.int(8, N - 9);
      if (this.minStartDist(cx, cy) < minStart + r || this.waterWithin(cx, cy, Math.ceil(r) + 6)) continue;
      this.blob(cx, cy, r, (i) => (this.map.terrain[i] = Terrain.Deep));
      k++;
    }
  }

  /** Little islands out at sea (coastal maps). */
  private addOffshoreIsles(count: number, atSea: (nx: number, ny: number) => boolean) {
    const { N } = this;
    for (let k = 0, tries = 0; k < count && tries < count * 50; tries++) {
      const r = 3 + this.rng.next() * 4;
      const cx = this.rng.int(6, N - 7), cy = this.rng.int(6, N - 7);
      if (!atSea(cx / N, cy / N) || this.landWithin(cx, cy, Math.ceil(r) + 4)) continue;
      this.blob(cx, cy, r, (i) => (this.map.terrain[i] = Terrain.Grass));
      k++;
    }
  }

  /** Applies `set` to a noisy disc of radius r. */
  private blob(cx: number, cy: number, r: number, set: (i: number) => void) {
    const R = Math.ceil(r + 2);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!this.inside(x, y)) continue;
        const wobble = (this.shapeNoise.fbm(x + 900, y + 900, 4, 2) - 0.5) * r * 0.6;
        if (Math.hypot(dx, dy) <= r + wobble) set(this.idx(x, y));
      }
  }

  /** A river between the teams: shifted `offset` tiles off the middle, `width` times as wide, with a branch, or extra winding. */
  private carveRiver(offset = 0, width = 1, fork = false, wind = 1) {
    const { N } = this;
    const p = this.opts.players;
    const centroid = (team: number) => {
      const ss = this.starts.filter((_, i) => teamOf(i, p) === team);
      return { x: ss.reduce((a, s) => a + s.x, 0) / ss.length, y: ss.reduce((a, s) => a + s.y, 0) / ss.length };
    };
    const ca = centroid(0), cb = centroid(1);
    let nx = ca.x - cb.x, ny = ca.y - cb.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const mx = (ca.x + cb.x) / 2 + nx * offset, my = (ca.y + cb.y) / 2 + ny * offset;
    const tx = -ny, ty = nx;
    const scale = N / 112;

    const fordCount = this.cfg.fords;
    const fords: number[] = [];
    for (let k = 0; k < fordCount; k++) {
      const f = fordCount === 1 ? 0 : -0.3 + (0.6 * k) / (fordCount - 1);
      fords.push((f + (this.rng.next() - 0.5) * 0.08) * N);
    }

    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - mx, dy = y + 0.5 - my;
        const t = dx * tx + dy * ty;
        const meander = (this.shapeNoise.fbm(t, offset * 7, 22 * scale, 2) - 0.5) * 18 * scale * wind;
        const d = dx * nx + dy * ny - meander;
        const halfWidth = (1.7 + this.shapeNoise.fbm(t, 50 + offset, 9, 1) * 1.3) * width;
        if (Math.abs(d) > halfWidth) continue;
        this.waterOrFord(x, y, fords.some((f) => Math.abs(t - f) < 3));
      }
    if (fork || (N >= 200 && offset === 0 && this.rng.next() < 0.6)) this.carveTributary(mx, my, nx, ny, tx, ty, scale);
  }

  /** Boggy ground: patches of walkable shallows away from the bases. */
  private addMarsh(count: number) {
    const { N } = this;
    for (let k = 0, tries = 0; k < count && tries < count * 40; tries++) {
      const cx = this.rng.int(6, N - 7), cy = this.rng.int(6, N - 7);
      if (this.minStartDist(cx, cy) < data.start.cityRadius + 4) continue;
      this.blob(cx, cy, 2 + this.rng.next() * 3, (i) => {
        if (this.map.terrain[i] !== Terrain.Deep) this.map.terrain[i] = Terrain.Shallow;
      });
      k++;
    }
  }

  /** Several lakes of about radius r, clear of the bases and of each other. */
  private addLakes(count: number, r: number) {
    const { N } = this;
    const placed: Point[] = [];
    for (let k = 0, tries = 0; k < count && tries < count * 80; tries++) {
      const rr = r * (0.7 + this.rng.next() * 0.6);
      const cx = this.rng.int(Math.ceil(rr) + 4, N - Math.ceil(rr) - 5), cy = this.rng.int(Math.ceil(rr) + 4, N - Math.ceil(rr) - 5);
      if (this.minStartDist(cx, cy) < data.start.cityRadius + rr) continue;
      if (placed.some((q) => Math.hypot(q.x - cx, q.y - cy) < rr * 2 + 10)) continue;
      this.blob(cx, cy, rr, (i) => (this.map.terrain[i] = Terrain.Deep));
      placed.push({ x: cx, y: cy });
      k++;
    }
  }

  /**
   * Random water must never cut a base off by land: walk from the first base,
   * and lay a ford straight across to any base it can't reach.
   */
  private bridgeCutOffStarts() {
    const { N } = this;
    const reach = () => {
      const seen = new Uint8Array(N * N);
      const s0 = this.starts[0];
      const stack = [this.idx(s0.x, s0.y)];
      seen[stack[0]] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of NEIGHBORS4) {
          const nx = x + dx, ny = y + dy;
          if (!this.inside(nx, ny)) continue;
          const j = this.idx(nx, ny);
          if (seen[j] || this.map.terrain[j] === Terrain.Deep) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      return seen;
    };
    for (let pass = 0; pass < this.starts.length; pass++) {
      const seen = reach();
      const cut = this.starts.find((s) => !seen[this.idx(s.x, s.y)]);
      if (!cut) return;
      let best: Point | null = null, bd = Infinity;
      for (let y = 0; y < N; y += 2)
        for (let x = 0; x < N; x += 2) {
          if (!seen[this.idx(x, y)]) continue;
          const d = Math.hypot(x - cut.x, y - cut.y);
          if (d < bd) (bd = d), (best = { x, y });
        }
      if (!best) return;
      const steps = Math.ceil(bd * 2);
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(cut.x + ((best.x - cut.x) * k) / steps), y = Math.round(cut.y + ((best.y - cut.y) * k) / steps);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!this.inside(x + dx, y + dy)) continue;
            const i = this.idx(x + dx, y + dy);
            if (this.map.terrain[i] === Terrain.Deep) {
              this.map.terrain[i] = Terrain.Shallow;
              this.reserved[i] = 1;
            }
          }
      }
    }
  }

  private waterOrFord(x: number, y: number, ford: boolean) {
    this.map.terrain[this.idx(x, y)] = ford ? Terrain.Shallow : Terrain.Deep;
    if (ford) this.reserveAround(x, y, 3);
  }

  /** A narrower branch from the main river out to a map edge, with one ford, steering clear of bases. */
  private carveTributary(mx: number, my: number, nx: number, ny: number, tx: number, ty: number, scale: number) {
    const { N } = this;
    const along = (this.rng.next() - 0.5) * 0.5 * N;
    // Find the river near this point by walking the normal until we hit water.
    let x = mx + tx * along, y = my + ty * along;
    const side = this.rng.next() < 0.5 ? 1 : -1;
    let dirX = nx * side, dirY = ny * side;
    const path: Point[] = [];
    for (let step = 0; step < N * 2; step++) {
      x += dirX;
      y += dirY;
      if (x < 0 || y < 0 || x >= N || y >= N) break;
      path.push({ x, y });
      // Wander, and turn away from any base we get close to.
      let ang = Math.atan2(dirY, dirX) + (this.shapeNoise.fbm(step, 300, 14 * scale, 2) - 0.5) * 0.25;
      for (const s of this.starts) {
        const d = Math.hypot(x - s.x, y - s.y);
        if (d < data.start.cityRadius + 10) {
          const away = Math.atan2(y - s.y, x - s.x);
          let diff = away - ang;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          ang += diff * 0.25;
        }
      }
      dirX = Math.cos(ang);
      dirY = Math.sin(ang);
    }
    const fordAt = Math.floor(path.length * (0.4 + this.rng.next() * 0.2));
    path.forEach((p, k) => {
      const w = 1.2 + this.shapeNoise.fbm(k, 400, 8, 1) * 0.8;
      const ford = Math.abs(k - fordAt) < 3;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx2 = Math.floor(p.x) + dx, ty2 = Math.floor(p.y) + dy;
          if (!this.inside(tx2, ty2) || Math.hypot(tx2 + 0.5 - p.x, ty2 + 0.5 - p.y) > w) continue;
          if (this.minStartDist(tx2, ty2) < data.start.clearRadius + 4) continue;
          const i = this.idx(tx2, ty2);
          if (this.map.terrain[i] === Terrain.Shallow) continue;
          this.waterOrFord(tx2, ty2, ford);
        }
    });
  }

  private reserveAround(x: number, y: number, r: number) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (this.inside(x + dx, y + dy)) this.reserved[this.idx(x + dx, y + dy)] = 1;
  }

  private shapeIslands() {
    const { N } = this;
    const p = this.opts.players;
    // Room for a large city, capped so huge maps stay mostly sea.
    const L = this.look;
    const big = L.layout === 'big' ? 1.12 : L.layout === 'scattered' ? 0.92 : 1;
    const playerR = Math.min(p <= 2 ? 0.21 : p === 3 ? 0.19 : 0.17, 44 / N) * big * (0.95 + this.rng.next() * 0.1);
    const islands: Array<{ x: number; y: number; r: number }> = this.starts.map((s) => ({ x: s.x / N, y: s.y / N, r: playerR }));
    if (L.layout !== 'scattered') islands.push({ x: L.cx, y: L.cy, r: L.layout === 'big' ? 0.11 : 0.06 + this.rng.next() * 0.04 });
    if (L.layout === 'chain') {
      // A chain of small isles stepping across the middle.
      const a = this.rng.next() * Math.PI;
      for (const k of [-2, -1, 1, 2]) islands.push({ x: L.cx + Math.cos(a) * k * 0.09, y: L.cy + Math.sin(a) * k * 0.09, r: 0.035 });
    }
    const angles = this.starts.map((s) => Math.atan2(s.y / N - 0.5, s.x / N - 0.5));
    for (let i = 0; i < p; i++) {
      let a1 = angles[i], a2 = angles[(i + 1) % p];
      if (a2 < a1) a2 += TAU;
      const mid = (a1 + a2) / 2;
      islands.push({ x: 0.5 + 0.4 * Math.cos(mid), y: 0.5 + 0.4 * Math.sin(mid), r: 0.055 });
    }
    // Scattered neutral isles fill the bigger seas.
    const extra = Math.round(((N * N) / 5000) * (L.layout === 'scattered' ? 1.8 : 0.6 + this.rng.next() * 0.8));
    for (let k = 0, tries = 0; k < extra && tries < extra * 60; tries++) {
      const r = (5 + this.rng.next() * 8) / N;
      const x = 0.05 + this.rng.next() * 0.9, y = 0.05 + this.rng.next() * 0.9;
      if (islands.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 8 / N)) continue;
      islands.push({ x, y, r });
      k++;
    }

    const owner = new Int16Array(N * N).fill(-1);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const nx = (x + 0.5) / N, ny = (y + 0.5) / N;
        const wobble = (this.shapeNoise.fbm(x, y, 10) - 0.5) * (0.05 + (L.hillScale / 21) * 0.05);
        let best = -1, bf = 0;
        islands.forEach((isl, k) => {
          const f = isl.r - Math.hypot(nx - isl.x, ny - isl.y) + wobble;
          if (f > bf) (bf = f), (best = k);
        });
        // Player islands always cover their base area.
        this.starts.forEach((s, k) => {
          if (Math.hypot(x - s.x, y - s.y) <= data.start.clearRadius + 2) best = k;
        });
        owner[this.idx(x, y)] = best;
      }

    // Keep at least ~3 tiles of deep water between different islands.
    const result = new Int16Array(owner);
    const gap = 2;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const o = owner[this.idx(x, y)];
        if (o < 0) continue;
        outer: for (let dy = -gap; dy <= gap; dy++)
          for (let dx = -gap; dx <= gap; dx++) {
            if (!this.inside(x + dx, y + dy)) continue;
            const o2 = owner[this.idx(x + dx, y + dy)];
            if (o2 >= 0 && o2 !== o) {
              result[this.idx(x, y)] = -1;
              break outer;
            }
          }
      }
    for (let i = 0; i < N * N; i++) if (result[i] < 0) this.map.terrain[i] = Terrain.Deep;
    this.islandOf = result;
  }

  // ---------- 3. starts, elevation, ground ----------

  private clearStartAreas() {
    const r = data.start.clearRadius;
    for (const s of this.starts)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = s.x + dx, y = s.y + dy;
          if (!this.inside(x, y) || dx * dx + dy * dy > r * r) continue;
          const i = this.idx(x, y);
          if (isWater(this.map.terrain[i])) this.map.terrain[i] = Terrain.Grass;
        }
    // Town Center footprint plus a walkable ring stays clear of resources.
    for (const s of this.starts) this.reserveAround(s.x, s.y, data.start.townRadius - 1);
  }

  private waterWithin(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (this.inside(x + dx, y + dy) && isWater(this.map.terrain[this.idx(x + dx, y + dy)])) return true;
    return false;
  }

  private shapeElevation() {
    const { N } = this;
    const el = this.map.elevation;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, y);
        if (!this.isLand(i)) continue;
        if (this.minStartDist(x, y) < data.start.clearRadius + 3 || this.waterWithin(x, y, 2)) continue;
        const h = this.hillNoise.fbm(x, y, this.look.hillScale);
        el[i] = h > this.look.hillLow + 0.1 ? 2 : h > this.look.hillLow ? 1 : 0;
      }
    // No sheer two-level cliffs.
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, y);
        if (el[i] !== 2) continue;
        for (const [dx, dy] of NEIGHBORS4)
          if (this.inside(x + dx, y + dy) && el[this.idx(x + dx, y + dy)] === 0) el[i] = 1;
      }
  }

  private paintGround() {
    const { N } = this;
    const t = this.map.terrain;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, y);
        if (!this.isLand(i)) continue;
        if (this.waterWithin(x, y, 1) && t[i] !== Terrain.Shallow) {
          // Fords keep grassy banks so they read as crossings, not beaches.
          if (!this.reserved[i] || this.opts.type !== 'heartland') t[i] = Terrain.Sand;
        } else if (this.forestNoise.fbm(x + 300, y + 300, 7) > this.look.dirt) {
          t[i] = Terrain.Dirt;
        }
      }
    // A trodden, irregular patch of dirt around each Town Center.
    const r = data.start.townRadius + 1;
    for (const s of this.starts)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = s.x + dx, y = s.y + dy;
          const edge = data.start.townRadius - 1 + this.forestNoise.fbm(x + 700, y + 700, 2, 1) * 2.2;
          if (this.inside(x, y) && Math.hypot(dx, dy) <= edge && this.isLand(this.idx(x, y)))
            t[this.idx(x, y)] = Terrain.Dirt;
        }
  }

  // ---------- 4. resources ----------

  /** Grows a compact blob of `count` tiles. Returns the placed tiles, or [] (and undoes) if short. */
  private cluster(f: FeatureId, count: number, cx: number, cy: number, amount: number, owner: number | null): Point[] {
    if (!this.okFor(cx, cy, owner)) return [];
    const placed: Point[] = [];
    const frontier: Point[] = [{ x: cx, y: cy }];
    const seen = new Set<number>([this.idx(cx, cy)]);
    while (placed.length < count && frontier.length) {
      // Grow toward the centre with a little jitter so blobs stay round, not stringy.
      let k = 0, best = Infinity;
      frontier.forEach((q, j) => {
        const score = Math.hypot(q.x - cx, q.y - cy) + this.rng.next() * 0.9;
        if (score < best) (best = score), (k = j);
      });
      const pt = frontier.splice(k, 1)[0];
      if (!this.okFor(pt.x, pt.y, owner)) continue;
      this.setFeature(pt.x, pt.y, f, amount);
      placed.push(pt);
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = pt.x + dx, ny = pt.y + dy;
        if (!this.inside(nx, ny) || seen.has(this.idx(nx, ny))) continue;
        seen.add(this.idx(nx, ny));
        frontier.push({ x: nx, y: ny });
      }
    }
    if (placed.length < count) {
      for (const pt of placed) this.setFeature(pt.x, pt.y, Feature.None, 0);
      return [];
    }
    return placed;
  }

  /** Free, and (for start resources) inside that player's own territory and island. */
  private okFor(x: number, y: number, owner: number | null): boolean {
    if (!this.free(x, y)) return false;
    if (owner === null) return true;
    if (this.nearestStart(x, y) !== owner) return false;
    if (this.islandOf && this.islandOf[this.idx(x, y)] !== owner) return false;
    return true;
  }

  /** Tries random spots in a distance ring around a start until the cluster fits. */
  private ringCluster(s: Point, owner: number, f: FeatureId, count: number, minD: number, maxD: number, amount: number) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const shrink = Math.floor(attempt / 20) * 2;
      const d = minD - shrink + this.rng.next() * (maxD - minD);
      const a = this.rng.next() * TAU;
      const x = Math.round(s.x + d * Math.cos(a)), y = Math.round(s.y + d * Math.sin(a));
      if (this.cluster(f, count, x, y, amount, owner).length) return true;
    }
    return false;
  }

  private placeAnimals(s: Point, owner: number, kind: 'sheep' | 'deer', count: number, minD: number, maxD: number, amount: number) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = minD + this.rng.next() * (maxD - minD) - Math.floor(attempt / 20) * 2;
      const a = this.rng.next() * TAU;
      const cx = Math.round(s.x + d * Math.cos(a)), cy = Math.round(s.y + d * Math.sin(a));
      const spots: Point[] = [];
      for (let k = 0; k < count * 4 && spots.length < count; k++) {
        const x = cx + this.rng.int(-2, 2), y = cy + this.rng.int(-2, 2);
        if (this.okFor(x, y, owner) && !spots.some((p) => p.x === x && p.y === y)) spots.push({ x, y });
      }
      if (spots.length === count) {
        for (const p of spots) this.map.animals.push({ kind, x: p.x + 0.5, y: p.y + 0.5, amount });
        return;
      }
    }
  }

  private placeStartResources(s: Point, owner: number) {
    const st = data.start, am = data.amounts, scale = this.cfg.resourceScale;
    // Main forest line: an arc behind the base, facing away from the map centre.
    const L = this.look;
    const away = Math.atan2(s.y - this.N / 2, s.x - this.N / 2) + L.arcTurn;
    for (let a = -1.3 * L.arcWidth; a <= 1.3 * L.arcWidth; a += 0.035)
      for (let d = L.arcR; d <= L.arcR + L.arcDepth; d += 0.7) {
        const x = Math.round(s.x + d * Math.cos(away + a)), y = Math.round(s.y + d * Math.sin(away + a));
        if (this.okFor(x, y, owner) && this.forestNoise.fbm(x, y, 3) > 0.32) this.setFeature(x, y, Feature.Tree, am.tree);
      }
    this.ringCluster(s, owner, Feature.Tree, 14, 8, 10, am.tree);
    this.ringCluster(s, owner, Feature.Berries, st.berries, 6, 7, am.berries);
    this.ringCluster(s, owner, Feature.Gold, st.gold, 8, 10, am.goldTile * scale);
    this.ringCluster(s, owner, Feature.Stone, st.stone, 9, 12, am.stoneTile * scale);
    this.ringCluster(s, owner, Feature.Gold, st.secondGold, 14, 17, am.goldTile * scale);
    this.placeAnimals(s, owner, 'sheep', st.sheep, 4, 5, am.sheep);
    this.placeAnimals(s, owner, 'deer', st.deer, 14, 18, am.deer);
    this.placeShoreFish(s, owner);
  }

  private placeShoreFish(s: Point, owner: number) {
    const candidates: Point[] = [];
    const r = 16;
    for (let y = s.y - r; y <= s.y + r; y++)
      for (let x = s.x - r; x <= s.x + r; x++) {
        if (!this.inside(x, y) || this.distToStart(x, y, s) > r) continue;
        const i = this.idx(x, y);
        if (this.map.terrain[i] !== Terrain.Deep || this.nearestStart(x, y) !== owner) continue;
        if (NEIGHBORS4.some(([dx, dy]) => this.inside(x + dx, y + dy) && this.isLand(this.idx(x + dx, y + dy))))
          candidates.push({ x, y });
      }
    for (let k = 0; k < data.start.shoreFish && candidates.length; k++) {
      const p = candidates.splice(this.rng.int(0, candidates.length - 1), 1)[0];
      if (this.map.animals.some((a) => Math.hypot(a.x - p.x - 0.5, a.y - p.y - 0.5) < 3)) continue;
      this.map.animals.push({ kind: 'fish', x: p.x + 0.5, y: p.y + 0.5, amount: data.amounts.shoreFish });
    }
  }

  private placeForests() {
    const { N } = this;
    const L = this.look;
    const threshold = (this.opts.type === 'heartland' ? 0.6 : 0.62) + L.forestBias;
    const wooded = (x: number, y: number): boolean => {
      const n = this.forestNoise.fbm(x, y, L.forestScale);
      switch (L.forest) {
        case 'belts':
          // Long belts of woodland along the noise ridges.
          return 1 - Math.abs(n * 2 - 1) > 0.9 - L.forestBias;
        case 'groves':
          // Many small woods.
          return this.forestNoise.fbm(x + 500, y + 500, L.forestScale * 0.45) > threshold + 0.05;
        case 'mixed':
          return n > threshold + 0.04 || this.forestNoise.fbm(x + 500, y + 500, L.forestScale * 0.4) > threshold + 0.1;
        default:
          return n > threshold;
      }
    };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, y);
        if (!this.free(x, y) || this.map.terrain[i] === Terrain.Sand) continue;
        if (this.minStartDist(x, y) < data.start.cityRadius) continue;
        if (wooded(x, y)) this.setFeature(x, y, Feature.Tree, data.amounts.tree);
      }
  }

  private placeContestedDeposits() {
    const p = this.opts.players;
    const scale = this.cfg.resourceScale;
    const minD = Math.max(20, this.N * 0.22);
    const placedAt: Point[] = [];
    const place = (f: FeatureId, count: number, tiles: number, amount: number) => {
      for (let k = 0; k < count; k++)
        for (let attempt = 0; attempt < 300; attempt++) {
          const x = this.rng.int(4, this.N - 5), y = this.rng.int(4, this.N - 5);
          if (this.minStartDist(x, y) < minD) continue;
          if (placedAt.some((q) => Math.hypot(q.x - x, q.y - y) < 10)) continue;
          if (this.islandOf && this.islandOf[this.idx(x, y)] < p) continue;
          // Clear a small patch of forest so deposits are never sealed inside trees.
          if (this.cluster(f, tiles, x, y, amount, null).length) {
            placedAt.push({ x, y });
            this.clearTreesAround(x, y, 2);
            break;
          }
        }
    };
    const vary = (n: number) => Math.max(1, Math.round(n * (0.7 + this.rng.next() * 0.6)));
    place(Feature.Gold, vary(this.cfg.extraGold), 4 + this.rng.int(0, 2), data.amounts.goldTile * scale);
    place(Feature.Stone, vary(this.cfg.extraStone), 3 + this.rng.int(0, 2), data.amounts.stoneTile * scale);
  }

  private clearTreesAround(x: number, y: number, r: number) {
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (this.inside(nx, ny) && this.map.feature[this.idx(nx, ny)] === Feature.Tree)
          this.setFeature(nx, ny, Feature.None, 0);
      }
  }

  private placeDeepFish() {
    const { N } = this;
    let deep = 0;
    for (let i = 0; i < N * N; i++) if (this.map.terrain[i] === Terrain.Deep) deep++;
    const target = Math.min(Math.floor((this.N * this.N) / 1500), Math.floor(deep / 150));
    const fish = this.map.animals.filter((a) => a.kind === 'fish');
    for (let attempt = 0, made = 0; attempt < target * 30 && made < target; attempt++) {
      const x = this.rng.int(0, N - 1), y = this.rng.int(0, N - 1);
      if (this.map.terrain[this.idx(x, y)] !== Terrain.Deep) continue;
      if (this.landWithin(x, y, 3)) continue;
      if (fish.some((f) => Math.hypot(f.x - x, f.y - y) < 6)) continue;
      const a = { kind: 'fish' as const, x: x + 0.5, y: y + 0.5, amount: data.amounts.deepFish };
      this.map.animals.push(a);
      fish.push(a);
      made++;
    }
  }

  private landWithin(x: number, y: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (this.inside(x + dx, y + dy) && this.isLand(this.idx(x + dx, y + dy))) return true;
    return false;
  }

  // ---------- 5. connectivity ----------

  /** 0-1 BFS where trees cost 1: clears the cheapest tree path between start 0 and any cut-off start. */
  private ensureStartsConnected() {
    const { N } = this;
    const n = N * N;
    const parent = new Int32Array(n).fill(-1);
    const src = this.idx(this.starts[0].x, this.starts[0].y);
    // Each tile relaxes at most 4 times, so 4n slots on either side of the middle suffice.
    const deque = new Int32Array(n * 9);
    let head = n * 4, tail = n * 4;
    deque[tail++] = src;
    const dist = new Int32Array(n).fill(1 << 30);
    dist[src] = 0;
    while (head < tail) {
      const i = deque[head++];
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (this.map.terrain[j] === Terrain.Deep) continue;
        const f = this.map.feature[j];
        if (f !== Feature.None && f !== Feature.Tree) continue;
        const w = f === Feature.Tree ? 1 : 0;
        if (dist[i] + w < dist[j]) {
          dist[j] = dist[i] + w;
          parent[j] = i;
          if (w === 0) deque[--head] = j;
          else deque[tail++] = j;
        }
      }
    }
    for (const s of this.starts.slice(1)) {
      let j = this.idx(s.x, s.y);
      if (dist[j] === 0 || dist[j] === 1 << 30) continue;
      while (j !== src && j >= 0) {
        if (this.map.feature[j] === Feature.Tree) {
          this.setFeature(j % N, (j / N) | 0, Feature.None, 0);
        }
        j = parent[j];
      }
    }
  }
}
