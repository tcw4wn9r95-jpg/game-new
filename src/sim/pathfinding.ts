// Grid A* for land units: 8-directional, no corner cutting, octile heuristic.
// Goals are tile rectangles, optionally "within reach" (any tile touching the rect),
// so units can walk up to trees, mines and buildings that block their own tiles.
import type { NavGrid } from './grid';

export interface Goal {
  /** Inclusive tile rectangle. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0: stand inside the rect; 1: stand on a tile touching it (Chebyshev distance 1). */
  reach: 0 | 1;
}

export interface Waypoint {
  x: number;
  y: number;
}

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

/** Reusable search state so a pathfinder never allocates per query. */
export class Pathfinder {
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private heapIdx: Int32Array;
  private heapF: Float32Array;
  private heapSize = 0;
  /** Nodes expanded by the last query (for budgeting). */
  lastExpanded = 0;
  /** Whose gates are open during the current query. */
  private player = -1;

  constructor(private readonly grid: NavGrid) {
    const n = grid.N * grid.N;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heapIdx = new Int32Array(n * 2);
    this.heapF = new Float32Array(n * 2);
  }

  /** Tiles that satisfy the goal. */
  goalTiles(goal: Goal): Waypoint[] {
    const out: Waypoint[] = [];
    const r = goal.reach;
    for (let y = goal.y0 - r; y <= goal.y1 + r; y++)
      for (let x = goal.x0 - r; x <= goal.x1 + r; x++) if (this.grid.isWalkable(x, y, this.player)) out.push({ x, y });
    return out;
  }

  /**
   * Path from tile (sx, sy) to the goal, as smoothed waypoints at tile centres
   * (excluding the start). Returns [] if already there, null if unreachable.
   */
  find(sx: number, sy: number, goal: Goal, player = -1): Waypoint[] | null {
    const { grid } = this;
    this.player = player;
    const N = grid.N;
    this.lastExpanded = 0;
    const region = grid.component(sx, sy, player);
    if (region < 0) return null;
    const targets = this.goalTiles(goal).filter((t) => grid.component(t.x, t.y, player) === region);
    if (!targets.length) return null;
    const r = goal.reach;
    const gx0 = goal.x0 - r, gy0 = goal.y0 - r, gx1 = goal.x1 + r, gy1 = goal.y1 + r;
    const isGoal = (x: number, y: number) => x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1;
    if (isGoal(sx, sy)) return [];
    const h = (x: number, y: number) => {
      const dx = Math.max(gx0 - x, 0, x - gx1), dy = Math.max(gy0 - y, 0, y - gy1);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };

    this.gen++;
    if (this.gen === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
    const gen = this.gen;
    const start = sy * N + sx;
    this.heapSize = 0;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.seen[start] = gen;
    this.push(start, h(sx, sy));

    while (this.heapSize) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      this.lastExpanded++;
      const x = cur % N, y = (cur / N) | 0;
      if (isGoal(x, y)) return this.reconstruct(cur);
      for (const [dx, dy, cost] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!grid.isWalkable(nx, ny, player)) continue;
        // No squeezing diagonally between two blocked tiles or around a corner.
        if (dx && dy && (!grid.isWalkable(x + dx, y, player) || !grid.isWalkable(x, y + dy, player))) continue;
        const ni = ny * N + nx;
        if (this.closed[ni] === gen) continue;
        const ng = this.g[cur] + cost;
        if (this.seen[ni] === gen && ng >= this.g[ni]) continue;
        this.seen[ni] = gen;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        this.push(ni, ng + h(nx, ny) * 1.001);
      }
    }
    return null;
  }

  private reconstruct(end: number): Waypoint[] {
    const N = this.grid.N;
    const tiles: Waypoint[] = [];
    for (let i = end; i >= 0; i = this.parent[i]) tiles.push({ x: i % N, y: (i / N) | 0 });
    tiles.reverse();
    return this.smooth(tiles).slice(1).map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  }

  /** String-pulling: drop waypoints that have a clear straight line past them. */
  private smooth(tiles: Waypoint[]): Waypoint[] {
    if (tiles.length <= 2) return tiles;
    const out = [tiles[0]];
    let anchor = 0;
    for (let i = 2; i < tiles.length; i++) {
      if (!this.clearLine(tiles[anchor], tiles[i])) {
        out.push(tiles[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(tiles[tiles.length - 1]);
    return out;
  }

  /** True if a unit can walk the straight line between two tile centres (with clearance). */
  clearLine(a: Waypoint, b: Waypoint): boolean {
    const ax = a.x + 0.5, ay = a.y + 0.5, bx = b.x + 0.5, by = b.y + 0.5;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len * 4);
    const pad = 0.3;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      for (const [ox, oy] of [[-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]])
        if (!this.grid.isWalkable(Math.floor(x + ox), Math.floor(y + oy), this.player)) return false;
    }
    return true;
  }

  private push(i: number, f: number): void {
    if (this.heapSize >= this.heapIdx.length) {
      // Duplicate entries (re-opened nodes) can outgrow the initial capacity.
      const idx = new Int32Array(this.heapIdx.length * 2), fs = new Float32Array(this.heapF.length * 2);
      idx.set(this.heapIdx);
      fs.set(this.heapF);
      this.heapIdx = idx;
      this.heapF = fs;
    }
    let k = this.heapSize++;
    const hi = this.heapIdx, hf = this.heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hi[k] = hi[p];
      hf[k] = hf[p];
      k = p;
    }
    hi[k] = i;
    hf[k] = f;
  }

  private pop(): number {
    const hi = this.heapIdx, hf = this.heapF;
    const top = hi[0];
    const n = --this.heapSize;
    const li = hi[n], lf = hf[n];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lf) break;
      hi[k] = hi[c];
      hf[k] = hf[c];
      k = c;
    }
    hi[k] = li;
    hf[k] = lf;
    return top;
  }
}
