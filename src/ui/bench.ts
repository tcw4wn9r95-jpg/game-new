import { type Camera, ZOOM_LEVELS } from '../render/camera';

const DURATION_S = 15;

/**
 * Panning benchmark (?bench=1): sweeps the camera across the whole map through all
 * zoom levels and reports average fps and frame-time spikes.
 */
export class Bench {
  private t = 0;
  private frames: number[] = [];
  private byLevel: number[][] = ZOOM_LEVELS.map(() => []);
  done = false;

  constructor(
    private readonly camera: Camera,
    private readonly mapSize: number,
    private readonly out: HTMLElement,
  ) {
    out.hidden = false;
    out.textContent = 'bench running…';
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t > 0.5) {
      // skip warm-up
      this.frames.push(dt * 1000);
      this.byLevel[this.camera.level].push(dt * 1000);
    }
    const N = this.mapSize;
    const level = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, Math.floor((this.t / DURATION_S) * ZOOM_LEVELS.length)));
    while (this.camera.level < level) this.camera.zoomStep(1);
    while (this.camera.level > level) this.camera.zoomStep(-1);
    this.camera.centerOn(N / 2 + (N / 2) * Math.sin(this.t * 0.9), N / 2 + (N / 2) * Math.sin(this.t * 0.67 + 1));
    if (this.t >= DURATION_S) this.finish();
  }

  private finish(): void {
    this.done = true;
    const f = [...this.frames].sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const p99 = f[Math.floor(f.length * 0.99)];
    const slow = f.filter((ms) => ms > 20).length;
    this.out.textContent = `bench: ${(1000 / avg).toFixed(1)} fps avg · p99 ${p99.toFixed(1)} ms · ${slow}/${f.length} frames >20 ms · per zoom ${this.byLevel.map((l) => (1000 / (l.reduce((a, b) => a + b, 0) / l.length)).toFixed(0)).join('/')} fps`;
  }
}
