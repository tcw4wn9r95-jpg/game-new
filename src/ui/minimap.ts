import type { Camera } from '../render/camera';
import { PLAYER_COLORS } from '../render/palette';
import type { Fog } from '../sim/fog';
import type { World } from '../sim/world';
import { mapImage } from './mapImage';
import { drawCrownIcon, drawRelicIcon } from '../render/icons2d';

const REDRAW_MS = 120;
const BASE_REFRESH_MS = 3000;

/**
 * Minimap in the HUD corner: terrain and resources under the player's fog, the
 * camera viewport, and the player's start. Tap or drag to move the camera.
 */
/**
 * Diamond minimap, as in AoE: the square map turned 45° and halved in height,
 * matching the isometric view.
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private baseAt = 0;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImg: ImageData;
  private fogVersion = -1;
  private lastDraw = 0;
  private dirty = true;
  /** Alert pings: where and when (seconds). */
  private pings: Array<{ x: number; y: number; at: number }> = [];

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly fog: Fog,
    private readonly camera: Camera,
    private readonly player: number,
  ) {
    const map = world.map;
    const N = map.size;
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    parent.appendChild(this.el);

    this.base = mapImage(map);

    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = N;
    this.fogImg = this.fogCanvas.getContext('2d')!.createImageData(N, N);

    const jump = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      // Invert the diamond mapping: u = x - y and v = x + y in minimap fractions.
      const u = ((e.clientX - r.left) / r.width) * 2 - 1, v = ((e.clientY - r.top) / r.height) * 2;
      camera.centerOn(((u + v) / 2) * N, ((v - u) / 2) * N);
      this.dirty = true;
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.el.hasPointerCapture(e.pointerId)) jump(e);
    });
  }

  destroy(): void {
    this.el.remove();
  }

  /** Flashes an expanding ring at a spot (an attack) for a few seconds. */
  ping(x: number, y: number, _now?: number): void {
    // One clock for stamping and drawing (frame timestamps can trail performance.now()).
    this.pings.push({ x, y, at: performance.now() / 1000 });
    this.dirty = true;
  }

  draw(now: number): void {
    if (now - this.lastDraw < REDRAW_MS && !this.dirty) return;
    this.lastDraw = now;
    this.dirty = false;
    const N = this.world.map.size;
    // Felled trees and mined-out deposits: refresh the terrain picture now and then.
    if (now - this.baseAt > BASE_REFRESH_MS) {
      this.base = mapImage(this.world.map);
      this.baseAt = now;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(this.el.clientWidth * dpr), H = Math.round(this.el.clientHeight * dpr);
    if (this.el.width !== W || this.el.height !== H) {
      this.el.width = W;
      this.el.height = H;
    }
    const g = this.el.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);

    if (this.fogVersion !== this.fog.version) {
      this.fogVersion = this.fog.version;
      const d = this.fogImg.data;
      for (let i = 0; i < N * N; i++) d[i * 4 + 3] = this.fog.visible[i] ? 0 : this.fog.explored[i] ? 110 : 255;
      this.fogCanvas.getContext('2d')!.putImageData(this.fogImg, 0, 0);
    }

    // Tile (x, y) -> minimap ((x - y) * W / 2N + W / 2, (x + y) * H / 2N).
    const ax = W / (2 * N), ay = H / (2 * N);
    const at = (x: number, y: number) => [(x - y) * ax + W / 2, (x + y) * ay] as const;
    g.setTransform(ax, ay, -ax, ay, W / 2, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0);
    g.drawImage(this.fogCanvas, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);

    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 1;
    for (const b of this.world.buildings()) {
      if (b.owner !== this.player && !this.fog.isExplored(b.x + b.size / 2, b.y + b.size / 2)) continue;
      const [cx, cy] = at(b.x + b.size / 2, b.y + b.size / 2);
      const r = Math.max(2.5, b.size * ax);
      g.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
      g.beginPath();
      g.moveTo(cx, cy - r / 2);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r / 2);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.fill();
      g.stroke();
    }
    const dot = Math.max(2, ax * 1.4);
    for (const u of this.world.field()) {
      if (u.owner !== this.player && !this.fog.isVisible(u.x, u.y)) continue;
      const [x, y] = at(u.x, u.y);
      g.fillStyle = PLAYER_COLORS[u.owner % PLAYER_COLORS.length];
      g.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }

    // Domination sites in their holder's colour; relics lying about as gold specks.
    for (const st of this.world.modeState.sites) {
      if (!this.fog.isExplored(st.x, st.y)) continue;
      const [x, y] = at(st.x, st.y);
      g.fillStyle = st.owner >= 0 ? PLAYER_COLORS[st.owner % PLAYER_COLORS.length] : '#efe7d2';
      g.strokeStyle = '#1a1208';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, Math.max(3.5, ax * 3), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const r of this.world.resources()) {
      if (r.type !== 'relic' || r.holder || !this.fog.isExplored(r.x, r.y)) continue;
      const [x, y] = at(r.x, r.y);
      drawRelicIcon(g, x, y, Math.max(2.5, ax * 2));
    }
    // Your King: a pulsing crown (an enemy King only while in sight).
    for (const u of this.world.units()) {
      if (u.type !== 'king') continue;
      const holder = u.inside ? this.world.building(u.inside) : undefined;
      const px = holder ? holder.x + holder.size / 2 : u.x, py = holder ? holder.y + holder.size / 2 : u.y;
      if (u.owner !== this.player && (holder || !this.fog.isVisible(px, py))) continue;
      const [x, y] = at(px, py);
      const pulse = 1 + 0.2 * Math.sin((now / 1000) * 5);
      drawCrownIcon(g, x, y - 2, Math.max(4, ax * 3) * (u.owner === this.player ? pulse : 1));
    }

    // Alert pings: red rings pulsing outward.
    const t = performance.now() / 1000;
    this.pings = this.pings.filter((p) => t - p.at < 4);
    for (const p of this.pings) {
      const [x, y] = at(p.x, p.y);
      const k = Math.max(0, (t - p.at) % 1);
      g.strokeStyle = `rgba(255,70,50,${1 - k})`;
      g.lineWidth = Math.max(1.5, W / 120);
      g.beginPath();
      g.ellipse(x, y, 4 + k * W * 0.06, (4 + k * W * 0.06) / 2, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (this.pings.length) this.dirty = true;

    // The camera's view: the four screen corners mapped back onto the ground.
    const cam = this.camera;
    const corners = [
      cam.screenToTile(0, 0),
      cam.screenToTile(cam.viewW, 0),
      cam.screenToTile(cam.viewW, cam.viewH),
      cam.screenToTile(0, cam.viewH),
    ];
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, W / 160);
    g.beginPath();
    corners.forEach((c, i) => {
      const [x, y] = at(c.x, c.y);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.stroke();
  }
}
