/**
 * Zoom levels: Z is CSS px per tile in the isometric view, where a tile is a
 * diamond 2Z wide and Z tall (same on-screen area as a Z x Z square).
 */
export const ZOOM_LEVELS = [14, 22, 32, 48] as const;
const DEFAULT_LEVEL = 1;
const ZOOM_ANIM_S = 0.18;
/** Fling velocity decay per second (exponential). */
const FRICTION = 5;

/**
 * Isometric camera over the tile grid. Tile axes run diagonally on screen: +x
 * toward the lower right, +y toward the lower left. Position is the tile at the
 * view centre; input deltas are CSS pixels.
 */
export class Camera {
  x = 0;
  y = 0;
  level = DEFAULT_LEVEL;
  /** Current Z, CSS px per tile (animates between zoom levels). */
  scale: number = ZOOM_LEVELS[DEFAULT_LEVEL];
  viewW = 1;
  viewH = 1;
  private vx = 0;
  private vy = 0;
  private anim: { from: number; to: number; t: number; tx: number; ty: number; fx: number; fy: number } | null = null;

  constructor(private readonly mapSize: number) {}

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  centerOn(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
    this.vx = this.vy = 0;
    this.clamp();
  }

  /** Tile-space offset for a screen-space offset (CSS px) at the current zoom. */
  private unproject(dx: number, dy: number): { x: number; y: number } {
    const a = dx / this.scale, b = (2 * dy) / this.scale; // a = x - y, b = x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  panBy(dx: number, dy: number): void {
    const d = this.unproject(dx, dy);
    this.x -= d.x;
    this.y -= d.y;
    this.clamp();
  }

  /** Starts inertial scrolling at the given CSS px/s. */
  fling(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
  }

  stop(): void {
    this.vx = this.vy = 0;
  }

  /** Moves one zoom level in (dir > 0) or out, keeping the tile under (fx, fy) fixed. */
  zoomStep(dir: number, fx = this.viewW / 2, fy = this.viewH / 2): void {
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.level + Math.sign(dir)));
    if (next === this.level) return;
    const { x: tx, y: ty } = this.screenToTile(fx, fy);
    this.level = next;
    this.anim = { from: this.scale, to: ZOOM_LEVELS[next], t: 0, tx, ty, fx, fy };
  }

  update(dt: number): void {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / ZOOM_ANIM_S);
      const e = 1 - (1 - a.t) ** 3;
      this.scale = a.from + (a.to - a.from) * e;
      const d = this.unproject(a.fx - this.viewW / 2, a.fy - this.viewH / 2);
      this.x = a.tx - d.x;
      this.y = a.ty - d.y;
      if (a.t >= 1) {
        this.scale = a.to;
        this.anim = null;
      }
      this.clamp();
    }
    if (this.vx || this.vy) {
      this.panBy(this.vx * dt, this.vy * dt);
      const k = Math.exp(-FRICTION * dt);
      this.vx *= k;
      this.vy *= k;
      if (Math.hypot(this.vx, this.vy) < 8) this.vx = this.vy = 0;
    }
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const d = this.unproject(sx - this.viewW / 2, sy - this.viewH / 2);
    return { x: this.x + d.x, y: this.y + d.y };
  }

  tileToScreen(tx: number, ty: number): { x: number; y: number } {
    const dx = tx - this.x, dy = ty - this.y;
    return { x: this.viewW / 2 + (dx - dy) * this.scale, y: this.viewH / 2 + ((dx + dy) * this.scale) / 2 };
  }

  private clamp(): void {
    const N = this.mapSize;
    const x = Math.max(0, Math.min(N, this.x)), y = Math.max(0, Math.min(N, this.y));
    if (x !== this.x) this.vx = 0;
    if (y !== this.y) this.vy = 0;
    this.x = x;
    this.y = y;
  }
}
