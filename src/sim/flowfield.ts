// Flow fields for group movement: one Dijkstra search from the destination
// over a bounded window of the land grid, which every unit in the group then
// descends. A big army costs one search instead of one A* per soldier, and the
// units stream along a shared route instead of each hugging its own line.
import type { NavGrid } from './grid';

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
/** Tiles of slack around the group and its goal when sizing the search window. */
const MARGIN = 24;

export class FlowField {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  /** Walking distance (tiles) to the goal per window cell; Infinity = unreachable. */
  readonly dist: Float64Array;

  /**
   * Builds the field toward the goal tiles. `from` are the group's positions;
   * the window covers them and the goal with a margin so detours fit.
   */
  constructor(
    private readonly grid: NavGrid,
    goals: Array<{ x: number; y: number }>,
    from: Array<{ x: number; y: number }>,
    private readonly player = -1,
    margin = MARGIN,
  ) {
    const xs = [...goals.map((g) => g.x), ...from.map((p) => Math.floor(p.x))];
    const ys = [...goals.map((g) => g.y), ...from.map((p) => Math.floor(p.y))];
    this.x0 = Math.max(0, Math.min(...xs) - margin);
    this.y0 = Math.max(0, Math.min(...ys) - margin);
    const x1 = Math.min(grid.N - 1, Math.max(...xs) + margin);
    const y1 = Math.min(grid.N - 1, Math.max(...ys) + margin);
    this.w = x1 - this.x0 + 1;
    this.h = y1 - this.y0 + 1;
    this.dist = new Float64Array(this.w * this.h).fill(Infinity);
    this.search(goals);
  }

  /** Distance to the goal from a tile, Infinity if outside the window or cut off. */
  at(x: number, y: number): number {
    const lx = x - this.x0, ly = y - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return Infinity;
    return this.dist[ly * this.w + lx];
  }

  /** The neighbouring tile that descends the field fastest (no corner cutting), or null at a minimum. */
  next(x: number, y: number): { x: number; y: number } | null {
    const here = this.at(x, y);
    let best: { x: number; y: number } | null = null;
    let bd = here;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (dx && dy && (!this.grid.isWalkable(x + dx, y, this.player) || !this.grid.isWalkable(x, y + dy, this.player))) continue;
      const d = this.at(nx, ny);
      if (d < bd) (bd = d), (best = { x: nx, y: ny });
    }
    return best;
  }

  /**
   * Dijkstra over the window with integer step costs (10 straight, 14 diagonal)
   * and a circular bucket queue (Dial's algorithm): linear time, no heap.
   */
  private search(goals: Array<{ x: number; y: number }>): void {
    const { w, h, x0, y0, dist, grid } = this;
    const cost = new Int32Array(w * h).fill(0x7fffffff);
    const B = 16; // > max step cost
    const buckets: number[][] = Array.from({ length: B }, () => []);
    let pending = 0;
    for (const g of goals) {
      const lx = g.x - x0, ly = g.y - y0;
      if (lx < 0 || ly < 0 || lx >= w || ly >= h || !grid.isWalkable(g.x, g.y, this.player)) continue;
      const i = ly * w + lx;
      if (cost[i] === 0) continue;
      cost[i] = 0;
      buckets[0].push(i);
      pending++;
    }
    // Walkability of the window with a one-cell blocked border, so the inner loop needs no bounds checks.
    const W2 = w + 2;
    const open = new Uint8Array(W2 * (h + 2));
    const walk = grid.walkOf(this.player);
    for (let ly = 0; ly < h; ly++) {
      const row = (ly + y0) * grid.N + x0;
      for (let lx = 0; lx < w; lx++) open[(ly + 1) * W2 + lx + 1] = walk[row + lx];
    }
    const steps = DIRS.map(([dx, dy, c]) => [dx, dy, c === 1 ? 10 : 14] as const);
    for (let d = 0; pending > 0; d++) {
      const bucket = buckets[d % B];
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        pending--;
        if (cost[i] !== d) continue; // superseded by a shorter route
        const lx = i % w, ly = (i / w) | 0;
        const o = (ly + 1) * W2 + lx + 1;
        for (const [dx, dy, c] of steps) {
          if (!open[o + dy * W2 + dx]) continue;
          if (dx && dy && (!open[o + dx] || !open[o + dy * W2])) continue;
          const j = (ly + dy) * w + lx + dx;
          const nd = d + c;
          if (nd < cost[j]) {
            cost[j] = nd;
            buckets[nd % B].push(j);
            pending++;
          }
        }
      }
      bucket.length = 0;
    }
    for (let i = 0; i < cost.length; i++) dist[i] = cost[i] === 0x7fffffff ? Infinity : cost[i] / 10;
  }
}
