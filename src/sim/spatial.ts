// Uniform-grid spatial hash over units, rebuilt once per tick, for range queries
// (target acquisition, healing, alerts) without scanning every unit.
import type { Unit } from './entities';

const CELL = 4;

export class SpatialHash {
  private readonly cols: number;
  private cells = new Map<number, Unit[]>();

  constructor(size: number) {
    this.cols = Math.ceil(size / CELL);
  }

  rebuild(units: Iterable<Unit>): void {
    this.cells.clear();
    for (const u of units) {
      const k = Math.floor(u.y / CELL) * this.cols + Math.floor(u.x / CELL);
      let b = this.cells.get(k);
      if (!b) this.cells.set(k, (b = []));
      b.push(u);
    }
  }

  /** Calls fn for each unit within r tiles of (x, y). */
  query(x: number, y: number, r: number, fn: (u: Unit, d: number) => void): void {
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
    const r0 = Math.floor((y - r) / CELL), r1 = Math.floor((y + r) / CELL);
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cx >= this.cols) continue;
        const b = this.cells.get(cy * this.cols + cx);
        if (!b) continue;
        for (const u of b) {
          const d = Math.hypot(u.x - x, u.y - y);
          if (d <= r) fn(u, d);
        }
      }
  }
}
