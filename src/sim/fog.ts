export interface VisionSource {
  x: number;
  y: number;
  /** Line of sight in tiles. */
  r: number;
}

const circleCache = new Map<number, Int16Array>();

/** Tile offsets (dx, dy pairs) inside a circle of radius r. */
function circle(r: number): Int16Array {
  let c = circleCache.get(r);
  if (!c) {
    const pts: number[] = [];
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) if (dx * dx + dy * dy <= r * r + r) pts.push(dx, dy);
    c = Int16Array.from(pts);
    circleCache.set(r, c);
  }
  return c;
}

/** Per-player fog of war: unexplored (never seen), explored (seen before) and visible (seen now). */
export class Fog {
  readonly explored: Uint8Array;
  readonly visible: Uint8Array;
  /** Bumped on every change so renderers know when to refresh. */
  version = 0;
  revealed = false;

  constructor(readonly size: number) {
    this.explored = new Uint8Array(size * size);
    this.visible = new Uint8Array(size * size);
  }

  update(sources: VisionSource[]): void {
    if (this.revealed) return;
    const { size, visible, explored } = this;
    visible.fill(0);
    for (const s of sources) {
      const cx = Math.floor(s.x), cy = Math.floor(s.y);
      const offs = circle(s.r);
      for (let k = 0; k < offs.length; k += 2) {
        const x = cx + offs[k], y = cy + offs[k + 1];
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        visible[i] = 1;
        explored[i] = 1;
      }
    }
    this.version++;
  }

  /** Marks a circle as explored (seen before) without making it visible. */
  explore(x: number, y: number, r: number): void {
    const cx = Math.floor(x), cy = Math.floor(y);
    const offs = circle(r);
    for (let k = 0; k < offs.length; k += 2) {
      const tx = cx + offs[k], ty = cy + offs[k + 1];
      if (tx >= 0 && ty >= 0 && tx < this.size && ty < this.size) this.explored[ty * this.size + tx] = 1;
    }
    this.version++;
  }

  revealAll(): void {
    this.revealed = true;
    this.explored.fill(1);
    this.visible.fill(1);
    this.version++;
  }

  isVisible(x: number, y: number): boolean {
    return this.visible[Math.floor(y) * this.size + Math.floor(x)] === 1;
  }

  isExplored(x: number, y: number): boolean {
    return this.explored[Math.floor(y) * this.size + Math.floor(x)] === 1;
  }
}
