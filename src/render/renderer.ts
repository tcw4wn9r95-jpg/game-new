// Isometric world renderer: cached terrain chunks, depth-sorted trees, decor,
// buildings and units, fog, then effects. Tile (x, y) maps to screen
// ((x - y) * Z, (x + y) * Z / 2), Z being device px per tile at the current zoom.
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit, type UnitType } from '../sim/entities';
import type { Fog } from '../sim/fog';
import { Feature, Terrain } from '../sim/terrain';
import type { World } from '../sim/world';
import { BIOMES, type Biome, pickTree } from './biome';
import { BuildingSprites, DIR8, wallVariant } from './buildingSprites';
import type { View } from './canvas';
import { type Camera, ZOOM_LEVELS } from './camera';
import { ChunkCache } from './chunks';
import type { Tool } from './figures';
import { FOG_RGB, FogLayer } from './fogLayer';
import { PLAYER_COLORS } from './palette';
import { type Sprite, SpriteSet } from './sprites';
import { TerrainTextures } from './textures';
import { tileHash } from './tiles';
import { buildingMaxHp, unitStats } from '../sim/techs';
import { UNIT_K, UPGRADE_TECH, type UnitPose, UnitSprites, lookIndex, unitHeight } from './unitSprites';
import { ZK } from './iso3d';
import { headingOf } from './shipFigures';
import { setBanners } from './buildingSprites';
import { FACTIONS, type FactionId } from '../sim/techs';
import { CAPTURE_TIME, SITE_RADIUS, type Site } from '../sim/modes';
import { drawCrownIcon, drawRelicIcon } from './icons2d';

/** Alpha channel of a sprite canvas, read once (for hit tests and occlusion). */
const masks = new WeakMap<HTMLCanvasElement, Uint8Array>();
function alphaMask(c: HTMLCanvasElement): Uint8Array | null {
  let m = masks.get(c);
  if (m) return m;
  if (!c.width || !c.height) return null;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  m = new Uint8Array(c.width * c.height);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
  masks.set(c, m);
  return m;
}

/** A sprite filled flat with a colour (its shape only), cached. */
const silhouetteCache = new WeakMap<HTMLCanvasElement, { color: string; s: Sprite }>();
function silhouette(s: Sprite, color: string): Sprite {
  const hit = silhouetteCache.get(s.c);
  if (hit && hit.color === color) return hit.s;
  const c = document.createElement('canvas');
  c.width = s.c.width;
  c.height = s.c.height;
  const g = c.getContext('2d')!;
  g.drawImage(s.c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  const out = { c, ax: s.ax, ay: s.ay, k: s.k };
  silhouetteCache.set(s.c, { color, s: out });
  return out;
}

/** Time (ms) per frame spent building chunks after the first frame; at least one is built.
 * Chunks still missing draw from another zoom level meanwhile. */
const CHUNK_BUILD_MS = 4;
const BG = `rgb(${FOG_RGB.join(',')})`;
const EFFECT_S = 1.3;
/** Square texture px per tile, relative to Z, so the 45° projection keeps full detail. */
const TEXTURE_K = Math.SQRT2;
/** Sprite px per 32-unit tile, relative to Z: a tree is about one diamond wide. */
const SPRITE_K = 1.6;

/** Weapon each unit swings in its attack animation. */
const ATTACK_TOOL: Record<string, Tool> = { villager: 'axe', militia: 'sword', spearman: 'spear', archer: 'bow', skirmisher: 'javelin', scout: 'spear', knight: 'spear', monk: 'staff', claymore: 'sword', horse_archer: 'bow', arbalest_guard: 'bow', iron_bear: 'spear', king: 'sword' };
/** How long the fallen stay on the field, and rubble after a building falls (seconds). */
const CORPSE_S = 14;
const RUIN_S = 45;

const TOOL_FOR: Record<string, Tool> = { tree: 'axe', gold: 'pick', stone: 'pick', berries: 'basket', sheep: 'knife', deer: 'knife', fish: 'spear', farm: 'hoe' };

interface LevelArt {
  /** Device px per tile (Z) at this level. */
  z: number;
  tiles: TerrainTextures;
  sprites: SpriteSet;
  units: UnitSprites;
  buildings: BuildingSprites;
}

export interface Overlay {
  selection: ReadonlySet<number>;
  /** Building being placed, at its north-corner tile; for walls, the planned segments. */
  ghost: { type: BuildingType; x: number; y: number; valid: boolean; wall?: Array<{ x: number; y: number; gate: boolean; valid: boolean }> } | null;
}

export interface Effect {
  kind: 'text' | 'ring' | 'blast';
  size?: number;
  x: number;
  y: number;
  text?: string;
  color: string;
  born: number;
}

interface Drawable {
  /** Depth: x + y of the ground point (larger is nearer the viewer). */
  d: number;
  draw: () => void;
}

interface FrameView {
  art: LevelArt;
  /** Device px per tile now (animated while zooming). */
  S: number;
  /** Scale from cached art to now. */
  k: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
  exact: boolean;
  alpha: number;
  now: number;
  overlay: Overlay;
}

export class Renderer {
  private levels: Array<LevelArt | null> = ZOOM_LEVELS.map(() => null);
  private artDpr = 0;
  private readonly chunks: ChunkCache;
  private readonly fogLayer: FogLayer;
  private firstFrame = true;
  private readonly biome: Biome;
  private readonly items: Drawable[] = [];
  readonly effects: Effect[] = [];
  private readonly corpses: Array<{ x: number; y: number; type: UnitType; owner: number; look: number; left: boolean; born: number }> = [];
  private readonly ruins: Array<{ x: number; y: number; size: number; born: number; seed: number }> = [];
  /** Last drawn position and facing per unit, to pick a view from movement. */
  private readonly lastPos = new Map<number, { x: number; y: number }>();
  private readonly lastView = new Map<number, { view: 'front' | 'side' | 'back'; left: boolean }>();
  /** Ships' headings (0-7), kept while they lie still. */
  private readonly heading = new Map<number, number>();
  /** The last frame's view, for hit-testing taps against what was drawn. */
  private lastFrame: FrameView | null = null;
  /** Own units drawn this frame, checked afterwards for being hidden behind buildings. */
  private readonly ownDrawn: Array<{ u: Unit; s: Sprite; x: number; y: number }> = [];

  constructor(
    private readonly view: View,
    private readonly world: World,
    private readonly fog: Fog,
    private readonly player = 0,
  ) {
    this.biome = BIOMES[world.map.type];
    this.chunks = new ChunkCache(world.map, this.biome);
    this.fogLayer = new FogLayer(fog);
    setBanners(world.players.map((p) => FACTIONS[p.faction as FactionId]?.banner));
  }

  private art(level: number): LevelArt {
    if (this.artDpr !== this.view.dpr) {
      this.artDpr = this.view.dpr;
      this.levels = ZOOM_LEVELS.map(() => null);
      this.chunks.clear();
      this.firstFrame = true;
    }
    let a = this.levels[level];
    if (!a) {
      const z = Math.round(ZOOM_LEVELS[level] * this.view.dpr);
      const sprite = Math.round(z * SPRITE_K);
      a = {
        z,
        tiles: new TerrainTextures(Math.round(z * TEXTURE_K), this.biome),
        sprites: new SpriteSet(sprite),
        units: new UnitSprites(Math.round(z * UNIT_K)),
        buildings: new BuildingSprites(z * 2),
      };
      this.levels[level] = a;
      // Free the art of zoom levels well away from this one; it is rebuilt if needed.
      this.levels.forEach((o, i) => {
        if (!o || Math.abs(i - level) <= 1) return;
        o.units.dispose();
        o.buildings.dispose();
        this.levels[i] = null;
      });
    }
    return a;
  }

  dispose(): void {
    this.chunks.dispose();
  }

  /** A unit fell: leave its body on the field for a while. */
  addDeath(e: { x: number; y: number; unit: UnitType; owner: number; face: number }, id: number, now: number): void {
    this.corpses.push({ x: e.x, y: e.y, type: e.unit, owner: e.owner, look: lookIndex(id), left: e.face < 0, born: now });
    if (this.corpses.length > 200) this.corpses.shift();
  }

  /** A building fell: scorched ground and rubble. */
  addRuin(e: { x: number; y: number; size: number }, now: number): void {
    this.ruins.push({ x: e.x, y: e.y, size: e.size, born: now, seed: (e.x * 73 + e.y * 151) | 0 });
  }

  /** alpha: fraction of the way from the last tick to the next; now: seconds, for animation. */
  draw(cam: Camera, alpha = 1, now = 0, overlay: Overlay = { selection: new Set(), ghost: null }): void {
    const { ctx, dpr } = this.view;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const level = cam.level;
    const art = this.art(level);
    // At rest, draw 1:1 from the cached art; while zooming, scale it.
    const exact = !cam.animating;
    const S = exact ? art.z : cam.scale * dpr;
    let ox = (cam.x - cam.y) * S - W / 2, oy = ((cam.x + cam.y) * S) / 2 - H / 2;
    if (exact) (ox = Math.round(ox)), (oy = Math.round(oy));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const v: FrameView = { art, S, k: S / art.z, ox, oy, W, H, exact, alpha, now, overlay };
    this.lastFrame = v;
    this.drawChunks(level, v);
    this.drawObjects(v);
    this.fogLayer.refresh();
    this.drawFog(v);
    this.drawEffects(v);
    this.firstFrame = false;
  }

  /** Screen position (device px) of a tile-space point. */
  private sx(v: FrameView, x: number, y: number): number {
    return (x - y) * v.S - v.ox;
  }

  private sy(v: FrameView, x: number, y: number): number {
    return ((x + y) * v.S) / 2 - v.oy;
  }

  /** Tile-space bounds covering the screen, with a margin for tall sprites. */
  private visibleTiles(v: FrameView, margin: number) {
    const N = this.world.map.size;
    const corners = [
      [0, 0],
      [v.W, 0],
      [0, v.H],
      [v.W, v.H],
    ].map(([px, py]) => {
      const a = (px + v.ox) / v.S, b = (2 * (py + v.oy)) / v.S;
      return { x: (a + b) / 2, y: (b - a) / 2 };
    });
    const clamp = (n: number) => Math.max(0, Math.min(N - 1, n));
    return {
      x0: clamp(Math.floor(Math.min(...corners.map((c) => c.x))) - margin),
      x1: clamp(Math.ceil(Math.max(...corners.map((c) => c.x))) + margin),
      y0: clamp(Math.floor(Math.min(...corners.map((c) => c.y))) - margin),
      y1: clamp(Math.ceil(Math.max(...corners.map((c) => c.y))) + margin),
    };
  }

  private drawChunks(level: number, v: FrameView) {
    const { ctx } = this.view;
    const { art, S } = v;
    const C = ChunkCache.tilesPerChunk(art.z * 2);
    const n = Math.ceil(this.world.map.size / C);
    const t = this.visibleTiles(v, 1);
    const deadline = this.firstFrame ? Infinity : performance.now() + CHUNK_BUILD_MS;
    let built = 0;
    const cw = C * 2 * S, ch = C * S;
    ctx.imageSmoothingEnabled = !v.exact;
    for (let cy = Math.floor(t.y0 / C); cy <= Math.min(n - 1, Math.floor(t.y1 / C)); cy++)
      for (let cx = Math.floor(t.x0 / C); cx <= Math.min(n - 1, Math.floor(t.x1 / C)); cx++) {
        const dx = this.sx(v, cx * C, cy * C) - C * S, dy = this.sy(v, cx * C, cy * C);
        if (dx > v.W || dy > v.H || dx + cw < 0 || dy + ch < 0) continue;
        let c = this.chunks.get(level, cx, cy);
        if (!c && (built === 0 || performance.now() < deadline)) {
          built++;
          c = this.chunks.build(level, cx, cy, art.tiles, art.z * 2, art.z, C);
        }
        if (c && v.exact && c.width === Math.round(cw)) {
          ctx.drawImage(c, dx, dy);
          continue;
        }
        c ??= this.chunks.anyLevel(cx, cy, ZOOM_LEVELS.length, C);
        if (c) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(c, dx, dy, cw + 1, ch + 1);
          ctx.imageSmoothingEnabled = !v.exact;
        }
      }
  }

  private drawObjects(v: FrameView) {
    const { ctx } = this.view;
    const { world, fog } = this;
    const { map } = world;
    const N = map.size;
    const sp = v.art.sprites;
    const t = this.visibleTiles(v, 3);
    ctx.imageSmoothingEnabled = !v.exact;
    const put = (s: Sprite, wx: number, wy: number) => this.put(v, s, wx, wy);
    const onScreen = (x: number, y: number, pad: number) => {
      const X = this.sx(v, x, y), Y = this.sy(v, x, y);
      return X > -pad && X < v.W + pad && Y > -pad * 0.5 && Y < v.H + pad * 2.5;
    };
    const pad = v.S * 3;

    const items = this.items;
    items.length = 0;
    // Trees, mines, bushes and ground decor.
    for (let y = t.y0; y <= t.y1; y++)
      for (let x = t.x0; x <= t.x1; x++) {
        const i = y * N + x;
        if (!fog.explored[i] || !onScreen(x + 0.5, y + 0.5, pad)) continue;
        const f = map.feature[i];
        const h = tileHash(x, y);
        if (f === Feature.Tree) {
          const jx = ((h >>> 8) % 100) / 100 - 0.5, jy = ((h >>> 16) % 100) / 100 - 0.5;
          const kind = sp.trees[pickTree(this.biome, h & 1023)];
          const s = kind[(h >>> 24) % kind.length];
          const wx = x + 0.5 + jx * 0.3, wy = y + 0.5 + jy * 0.3;
          items.push({ d: wx + wy, draw: () => put(s, wx, wy) });
        } else if (f !== Feature.None) {
          const s = f === Feature.Gold ? sp.gold : f === Feature.Stone ? sp.stone : sp.berries;
          items.push({ d: x + y + 1, draw: () => put(s, x + 0.5, y + 0.5) });
        } else if (map.terrain[i] === Terrain.Grass && world.grid.building[i] === 0) {
          // Scattered grass tufts and the odd bush, as on AoE meadows.
          const r = h % 97;
          if (r < 9) {
            const s = sp.decor[(h >>> 7) % sp.decor.length];
            const wx = x + 0.2 + ((h >>> 12) % 60) / 100, wy = y + 0.2 + ((h >>> 18) % 60) / 100;
            items.push({ d: wx + wy - 0.3, draw: () => put(s, wx, wy) });
          }
        }
      }
    for (const e of world.entities.values()) {
      if (e.kind === 'unit') {
        if (e.inside) continue;
        const x = e.px + (e.x - e.px) * v.alpha, y = e.py + (e.y - e.py) * v.alpha;
        if (!onScreen(x, y, pad)) continue;
        if (e.owner !== this.player && !fog.isVisible(x, y)) continue;
        items.push({ d: x + y, draw: () => this.drawUnit(v, e, x, y) });
      } else if (e.kind === 'building') {
        if (!onScreen(e.x + e.size / 2, e.y + e.size / 2, pad + e.size * v.S * 2)) continue;
        if (e.owner !== this.player && !fog.isExplored(e.x + e.size / 2, e.y + e.size / 2)) continue;
        // Fields lie flat: draw them before anything standing on or around them.
        const flat = BUILDING_DEFS[e.type].walkable;
        items.push({ d: flat ? e.x + e.y - 1 : e.x + e.y + e.size, draw: () => this.drawBuilding(v, e) });
      } else if (e.type === 'relic') {
        if (e.holder || !onScreen(e.x, e.y, pad)) continue;
        // Lying relics are remembered once seen; carried ones show with their monk.
        const carrier = e.carrier ? world.unit(e.carrier) : undefined;
        if (carrier ? carrier.owner !== this.player && !fog.isVisible(e.x, e.y) : !fog.isExplored(e.x, e.y)) continue;
        if (carrier?.inside) continue;
        const x = carrier ? carrier.px + (carrier.x - carrier.px) * v.alpha : e.x, y = carrier ? carrier.py + (carrier.y - carrier.py) * v.alpha : e.y;
        items.push({ d: x + y + 0.05, draw: () => this.drawRelic(v, x, y, carrier ? v.S * 0.75 : 0) });
      } else {
        if (!onScreen(e.x, e.y, pad) || !fog.isVisible(e.x, e.y)) continue;
        const s = e.type === 'sheep' ? sp.sheep : e.type === 'deer' ? sp.deer : sp.fish;
        items.push({ d: e.x + e.y, draw: () => put(s, e.x, e.y) });
      }
    }
    for (const st of world.modeState.sites) {
      if (!onScreen(st.x, st.y, pad + v.S * 4) || !fog.isExplored(st.x, st.y)) continue;
      items.push({ d: st.x + st.y - 3, draw: () => this.drawSiteRing(v, st) });
      items.push({ d: st.x + st.y, draw: () => this.drawSitePole(v, st) });
    }
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const r = this.ruins[i];
      if (v.now - r.born > RUIN_S) {
        this.ruins.splice(i, 1);
        continue;
      }
      if (!onScreen(r.x + r.size / 2, r.y + r.size / 2, pad + r.size * v.S) || !fog.isExplored(r.x + r.size / 2, r.y + r.size / 2)) continue;
      items.push({ d: r.x + r.y - 1, draw: () => this.drawRuin(v, r) });
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (v.now - c.born > CORPSE_S) {
        this.corpses.splice(i, 1);
        continue;
      }
      if (!onScreen(c.x, c.y, pad) || !fog.isVisible(c.x, c.y)) continue;
      items.push({ d: c.x + c.y - 0.4, draw: () => this.drawCorpse(v, c) });
    }
    for (const p of world.projectiles) {
      const t = Math.min(1, p.t + p.dt * v.alpha);
      const x = p.sx + (p.tx - p.sx) * t, y = p.sy + (p.ty - p.sy) * t;
      if (!onScreen(x, y, pad) || !fog.isVisible(x, y)) continue;
      items.push({ d: x + y + 0.6, draw: () => this.drawProjectile(v, p, t) });
    }
    const gh = v.overlay.ghost;
    if (gh) items.push({ d: gh.x + gh.y + BUILDING_DEFS[gh.type].size, draw: () => this.drawGhost(v, gh) });
    items.sort((a, b) => a.d - b.d);
    this.ownDrawn.length = 0;
    for (const it of items) it.draw();
    this.silhouettes(v);
  }

  /** Own units hidden behind a building show through it as a team-coloured silhouette, as in AoE. */
  private silhouettes(v: FrameView): void {
    const { grid } = this.world;
    const N = this.world.map.size;
    for (const { u, s, x, y } of this.ownDrawn) {
      const tx = Math.floor(x), ty = Math.floor(y);
      const mx = this.sx(v, x, y), my = this.sy(v, x, y) - v.S * UNIT_K * unitHeight(u.type) * 0.45;
      let hidden = false;
      const seen = new Set<number>();
      for (let dy = 0; dy <= 5 && !hidden; dy++)
        for (let dx = 0; dx <= 5 && !hidden; dx++) {
          const bx = tx + dx, by = ty + dy;
          if (bx >= N || by >= N) continue;
          const id = grid.building[by * N + bx];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const b = this.world.building(id);
          if (!b || BUILDING_DEFS[b.type].walkable || b.x + b.y + b.size <= x + y) continue;
          if (this.onSprite(v, this.buildingSprite(v, b), this.sx(v, b.x, b.y), this.sy(v, b.x, b.y), mx, my)) hidden = true;
        }
      if (hidden) this.put(v, silhouette(s, PLAYER_COLORS[u.owner % PLAYER_COLORS.length]), x, y, 0.6);
    }
  }

  private put(v: FrameView, s: Sprite, wx: number, wy: number, alpha = 1): void {
    const { ctx } = this.view;
    const px = this.sx(v, wx, wy), py = this.sy(v, wx, wy);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const sk = s.k ?? 1;
    if (v.exact && sk === 1) ctx.drawImage(s.c, Math.round(px - s.ax), Math.round(py - s.ay));
    else {
      const k = (v.exact ? 1 : v.k) * sk;
      ctx.drawImage(s.c, px - s.ax * k, py - s.ay * k, s.c.width * k, s.c.height * k);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** The footprint diamond of a square of tiles, as a path. */
  private diamond(v: FrameView, x: number, y: number, size: number): void {
    const { ctx } = this.view;
    ctx.beginPath();
    ctx.moveTo(this.sx(v, x, y), this.sy(v, x, y));
    ctx.lineTo(this.sx(v, x + size, y), this.sy(v, x + size, y));
    ctx.lineTo(this.sx(v, x + size, y + size), this.sy(v, x + size, y + size));
    ctx.lineTo(this.sx(v, x, y + size), this.sy(v, x, y + size));
    ctx.closePath();
  }

  private drawUnit(v: FrameView, u: Unit, x: number, y: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const selected = v.overlay.selection.has(u.id);
    const px = this.sx(v, x, y), py = this.sy(v, x, y);
    if (selected) {
      ctx.strokeStyle = u.owner === this.player ? 'rgba(255,255,255,0.95)' : 'rgba(255,90,80,0.95)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      const ship = UNIT_DEFS[u.type].naval;
      const r = S * (ship ? (u.type === 'demolition_raft' || u.type === 'fishing_ship' ? 1.0 : 1.5) : UNIT_DEFS[u.type].classes.includes('cavalry') || UNIT_DEFS[u.type].classes.includes('siege') ? 0.55 : 0.36);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stagger animation phase per unit so crowds don't move in lockstep.
    const t = v.now + (u.id % 7) * 0.13;
    const p = this.poseFor(u, x, y, t);
    const up = UPGRADE_TECH[u.type];
    const elite = !!up && (this.world.players[u.owner]?.techs as string[] | undefined)?.includes(up) === true;
    if (UNIT_DEFS[u.type].naval) {
      this.wake(v, u, x, y);
      // Riding the swell.
      const bob = Math.sin(t * 1.7) * 0.04;
      this.put(v, v.art.units.get(u.type, u.owner, 0, p, elite), x + bob, y + bob);
      if (u.cargo.length) this.cargoBadge(v, px, py - S * UNIT_K * (unitHeight(u.type) + 0.45), u.cargo.length);
    } else {
      const s = v.art.units.get(u.type, u.owner, lookIndex(u.id), p, elite);
      this.put(v, s, x, y);
      if (u.owner === this.player) this.ownDrawn.push({ u, s, x, y });
    }
    // Health shows on selection, and for a few seconds after any hit.
    const maxHp = unitStats(this.world, u.owner, u.type).hp;
    const hurt = u.attackedAt > this.world.tick - 50 && u.hp < maxHp;
    if (selected || hurt) this.hpBar(v, px, py - S * UNIT_K * (unitHeight(u.type) + 0.15), S * 0.7, u.hp / maxHp, u.owner);
    // The King wears a floating crown so he is easy to find in a crowd.
    if (u.type === 'king') drawCrownIcon(this.view.ctx, px, py - S * UNIT_K * (unitHeight(u.type) + 0.45), Math.max(5, S * 0.18));
  }

  /** How many are aboard a transport. */
  private cargoBadge(v: FrameView, x: number, y: number, n: number): void {
    const { ctx } = this.view;
    const r = Math.max(7, v.S * 0.2);
    ctx.fillStyle = 'rgba(20,16,10,0.75)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8d6a0';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#f4ead0';
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + r * 0.05);
  }

  /** A fallen soldier lying on its side, fading out. */
  private drawCorpse(v: FrameView, c: Renderer['corpses'][number]): void {
    const { ctx } = this.view;
    const age = v.now - c.born;
    if (UNIT_DEFS[c.type].naval) return this.drawWreck(v, c, age);
    const sp = v.art.units.get(c.type, c.owner, c.look, { view: 'side', left: c.left, anim: 'idle', frame: 0, tool: 'none', carry: null });
    const px = this.sx(v, c.x, c.y), py = this.sy(v, c.x, c.y);
    const k = v.exact ? 1 : v.k;
    // Topples over in the first half second, then lies still and fades.
    const fall = Math.min(1, age / 0.5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (CORPSE_S - age) / 4));
    ctx.translate(px, py);
    if (UNIT_DEFS[c.type].classes.includes('cavalry') || UNIT_DEFS[c.type].classes.includes('siege')) {
      // A horse goes down on its side: it sinks and flattens rather than toppling end over end.
      ctx.rotate((c.left ? 1 : -1) * fall * 0.18);
      ctx.scale(k, k * (1 - fall * 0.55));
    } else {
      ctx.rotate((c.left ? 1 : -1) * fall * Math.PI * 0.47);
      ctx.scale(k, k * (1 - fall * 0.35));
    }
    ctx.drawImage(sp.c, -sp.ax, -sp.ay);
    ctx.restore();
  }

  /** A ship going down: it lists, settles and slips under, leaving flotsam and foam. */
  private drawWreck(v: FrameView, c: Renderer['corpses'][number], age: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const px = this.sx(v, c.x, c.y), py = this.sy(v, c.x, c.y);
    const sink = Math.min(1, age / 6);
    if (sink < 1) {
      const sp = v.art.units.get(c.type, c.owner, 0, { view: 'side', left: false, anim: 'idle', frame: 0, tool: 'none', carry: null, dir: c.look % 8 });
      const k = (v.exact ? 1 : v.k) * (sp.k ?? 1);
      ctx.save();
      // Clip at the waterline as it sinks.
      ctx.beginPath();
      ctx.rect(px - sp.c.width * k, py - sp.c.height * k * 2, sp.c.width * k * 2, sp.c.height * k * 2 + S * 0.15);
      ctx.clip();
      ctx.globalAlpha = 1 - sink * 0.6;
      ctx.translate(px, py + sink * S * 0.9);
      ctx.rotate((c.left ? 1 : -1) * sink * 0.35);
      ctx.scale(k, k);
      ctx.drawImage(sp.c, -sp.ax, -sp.ay);
      ctx.restore();
    }
    // Foam and floating planks.
    const fade = Math.max(0, 1 - age / CORPSE_S);
    ctx.strokeStyle = `rgba(235,245,250,${0.6 * fade})`;
    ctx.lineWidth = Math.max(1, S * 0.03);
    for (let k = 0; k < 3; k++) {
      const r = S * (0.3 + ((age * 0.25 + k / 3) % 1) * 0.6);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(110,74,42,${fade})`;
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + c.look;
      const d = S * (0.2 + 0.1 * k + Math.min(age, 10) * 0.02);
      ctx.save();
      ctx.translate(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.5);
      ctx.rotate(a);
      ctx.fillRect(-S * 0.12, -S * 0.025, S * 0.24, S * 0.05);
      ctx.restore();
    }
  }

  /** Scorched footprint with heaped rubble and charred beams, fading over time. */
  private drawRuin(v: FrameView, r: Renderer['ruins'][number]): void {
    const { ctx } = this.view;
    const { S } = v;
    const age = v.now - r.born;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (RUIN_S - age) / 8));
    this.diamond(v, r.x - 0.1, r.y - 0.1, r.size + 0.2);
    ctx.fillStyle = 'rgba(30,22,14,0.55)';
    ctx.fill();
    let s = r.seed * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = 10 + r.size * 8;
    for (let i = 0; i < n; i++) {
      const x = r.x + 0.2 + rnd() * (r.size - 0.4), y = r.y + 0.2 + rnd() * (r.size - 0.4);
      const X = this.sx(v, x, y), Y = this.sy(v, x, y);
      if (rnd() < 0.3) {
        // Charred beam.
        ctx.strokeStyle = '#2a1a10';
        ctx.lineWidth = Math.max(1, S * 0.08);
        ctx.beginPath();
        const a = rnd() * Math.PI;
        ctx.moveTo(X - Math.cos(a) * S * 0.3, Y - Math.sin(a) * S * 0.12);
        ctx.lineTo(X + Math.cos(a) * S * 0.3, Y + Math.sin(a) * S * 0.12);
        ctx.stroke();
      } else {
        const rr = S * (0.08 + rnd() * 0.12);
        const g = ctx.createRadialGradient(X - rr * 0.3, Y - rr * 0.6, rr * 0.1, X, Y - rr * 0.3, rr * 1.2);
        g.addColorStop(0, '#b8b0a2');
        g.addColorStop(1, '#4a443c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(X, Y - rr * 0.3, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Smoke still rising for the first while.
    if (age < 20) this.smoke(v, r.x + r.size / 2, r.y + r.size / 2, 0, 1 - age / 20, r.seed);
    ctx.restore();
  }

  /** Rising, drifting smoke puffs above a point (z in device px). */
  private smoke(v: FrameView, x: number, y: number, z: number, strength: number, seed: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const X = this.sx(v, x, y), Y = this.sy(v, x, y) - z;
    for (let k = 0; k < 5; k++) {
      const t = (v.now * 0.35 + k / 5 + (seed % 7) * 0.13) % 1;
      const r = S * (0.25 + t * 0.6);
      const px = X + t * S * 0.8 + Math.sin(v.now + k) * S * 0.1, py = Y - t * S * 2.4;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(60,58,56,${0.35 * (1 - t) * strength})`);
      g.addColorStop(1, 'rgba(60,58,56,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  /** Licking flames at a point (z in device px). */
  private flames(v: FrameView, x: number, y: number, z: number, size: number, seed: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const X = this.sx(v, x, y), Y = this.sy(v, x, y) - z;
    for (let k = 0; k < 4; k++) {
      const f = Math.sin(v.now * 9 + k * 1.7 + seed) * 0.5 + 0.5;
      const h = S * size * (0.5 + f * 0.5);
      const w = S * size * 0.22;
      const dx = (k - 1.5) * w * 0.7;
      const g = ctx.createLinearGradient(0, Y, 0, Y - h);
      g.addColorStop(0, 'rgba(255,90,20,0.9)');
      g.addColorStop(0.5, 'rgba(255,190,60,0.8)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(X + dx - w, Y);
      ctx.quadraticCurveTo(X + dx - w * 0.6, Y - h * 0.6, X + dx + Math.sin(v.now * 5 + k) * w * 0.4, Y - h);
      ctx.quadraticCurveTo(X + dx + w * 0.6, Y - h * 0.6, X + dx + w, Y);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(X, Y - S * size * 0.3, 0, X, Y - S * size * 0.3, S * size);
    glow.addColorStop(0, 'rgba(255,160,60,0.25)');
    glow.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(X - S * size, Y - S * size * 1.3, S * size * 2, S * size * 2);
  }

  /** An arrow (or javelin) on its arc, with its shadow on the ground. */
  private drawProjectile(v: FrameView, p: World['projectiles'][number], t: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const at = (q: number) => {
      const x = p.sx + (p.tx - p.sx) * q, y = p.sy + (p.ty - p.sy) * q;
      const z = p.arc * 4 * q * (1 - q) + (p.height !== undefined ? p.height * ZK : 0.4) * (1 - q) + 0.2 * q;
      return { X: this.sx(v, x, y), Y: this.sy(v, x, y), Z: z * S };
    };
    const a = at(t), b = at(Math.min(1, t + 0.04));
    let dx = b.X - a.X, dy = b.Y - b.Z - (a.Y - a.Z);
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    if (p.from === 'fire_ship') {
      // A gout of burning pitch.
      const sy = a.Y - a.Z, r = S * 0.16;
      const fire = ctx.createRadialGradient(a.X, sy, 0, a.X, sy, r * 1.6);
      fire.addColorStop(0, 'rgba(255,250,210,0.95)');
      fire.addColorStop(0.35, 'rgba(255,160,40,0.85)');
      fire.addColorStop(1, 'rgba(180,40,10,0)');
      ctx.fillStyle = fire;
      ctx.beginPath();
      ctx.arc(a.X, sy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (p.splash) {
      // A stone or boulder tumbling on its arc, with its shadow racing along the ground.
      const r = S * (p.from === 'trebuchet' ? 0.2 : p.from === 'siege_barge' ? 0.15 : 0.13);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(a.X, a.Y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      const sy = a.Y - a.Z;
      const rock = ctx.createRadialGradient(a.X - r * 0.35, sy - r * 0.4, r * 0.1, a.X, sy, r);
      rock.addColorStop(0, '#c9c4b8');
      rock.addColorStop(1, '#4e4a44');
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.arc(a.X, sy, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const javelin = p.from === 'skirmisher' || p.from === 'scorpion';
    const len = S * (p.from === 'scorpion' ? 0.75 : javelin ? 0.55 : 0.4);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(a.X, a.Y, len * 0.35, len * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const hx = a.X + dx * len * 0.5, hy = a.Y - a.Z + dy * len * 0.5;
    const tx = a.X - dx * len * 0.5, ty = a.Y - a.Z - dy * len * 0.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.lineWidth = Math.max(1.2, S * (javelin ? 0.06 : 0.04));
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = p.from === 'scorpion' ? '#3a2614' : javelin ? '#8a6038' : '#c9a46a';
    ctx.lineWidth = Math.max(0.8, S * (javelin ? 0.035 : 0.022));
    ctx.stroke();
    // Steel head and (for arrows) pale fletching.
    ctx.fillStyle = '#d4dadd';
    ctx.beginPath();
    ctx.moveTo(hx + dx * S * 0.08, hy + dy * S * 0.08);
    ctx.lineTo(hx - dy * S * 0.03, hy + dx * S * 0.03);
    ctx.lineTo(hx + dy * S * 0.03, hy - dx * S * 0.03);
    ctx.closePath();
    ctx.fill();
    if (!javelin) {
      ctx.strokeStyle = '#f0ebe0';
      ctx.lineWidth = Math.max(1, S * 0.04);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + dx * S * 0.08, ty + dy * S * 0.08);
      ctx.stroke();
    }
  }

  /** Where a working unit's job is, to face it. */
  private jobPoint(u: Unit): { x: number; y: number } | null {
    const o = u.order;
    if (o?.type === 'gather') {
      if (o.target.kind === 'tile') return { x: o.target.x + 0.5, y: o.target.y + 0.5 };
      const e = this.world.get(o.target.id);
      if (!e) return null;
      return e.kind === 'building' ? { x: e.x + e.size / 2, y: e.y + e.size / 2 } : { x: e.x, y: e.y };
    }
    if (o?.type === 'build' || o?.type === 'attack' || o?.type === 'heal' || o?.type === 'convert') {
      const e = this.world.get(o.id);
      if (!e) return null;
      return e.kind === 'building' ? { x: e.x + e.size / 2, y: e.y + e.size / 2 } : { x: e.x, y: e.y };
    }
    return null;
  }

  /** Chooses view, animation frame, tool and load for a unit this frame. */
  private poseFor(u: Unit, x: number, y: number, t: number): UnitPose {
    if (UNIT_DEFS[u.type].naval) return this.shipPose(u, x, y, t);
    const prev = this.lastPos.get(u.id);
    // Side-on reads best for a unit that hasn't moved yet.
    let view = this.lastView.get(u.id) ?? { view: 'side' as const, left: u.face < 0 };
    const moving = u.state === 'walk' && (u.x !== u.px || u.y !== u.py);
    if (prev && moving) {
      // Direction on screen: isometric x is (dx - dy), y is (dx + dy) / 2.
      const dx = x - prev.x, dy = y - prev.y;
      const sdx = dx - dy, sdy = (dx + dy) / 2;
      if (Math.abs(sdx) + Math.abs(sdy) > 1e-4)
        view = Math.abs(sdy) > Math.abs(sdx) * 1.1 ? { view: sdy > 0 ? 'front' : 'back', left: false } : { view: 'side', left: sdx < 0 };
    }
    this.lastPos.set(u.id, { x, y });
    const fighting = u.state === 'attack' || u.state === 'heal' || u.state === 'convert';
    const working = u.state === 'gather' || u.state === 'build' || u.state === 'repair' || fighting;
    // Engines are only ever drawn side-on.
    if (UNIT_DEFS[u.type].classes.includes('siege') && view.view !== 'side') view = { view: 'side', left: u.face < 0 };
    if (working) {
      // Work plays side-on, facing the job.
      const j = this.jobPoint(u);
      const sdx = j ? j.x - x - (j.y - y) : u.face;
      view = { view: 'side', left: sdx < 0 };
    }
    this.lastView.set(u.id, view);
    let tool: Tool = 'none';
    if (u.state === 'build' || u.state === 'repair') tool = 'hammer';
    else if (u.state === 'gather' && u.order?.type === 'gather') tool = TOOL_FOR[u.order.source] ?? 'none';
    else if (fighting) tool = ATTACK_TOOL[u.type] ?? 'none';
    const fps = UNIT_DEFS[u.type].classes.includes('cavalry') ? 12 : 10;
    let frame = working ? Math.floor(t * 5) % 4 : moving ? Math.floor(t * fps) % 6 : 0;
    if (u.state === 'attack') {
      // Time the swing to the reload: the blow lands (or the arrow looses) as the cooldown restarts.
      const reload = UNIT_DEFS[u.type].reload * 10;
      const q = 1 - u.cooldown / reload;
      const seq = tool === 'bow' ? [3, 0, 1, 2] : [2, 3, 0, 1];
      frame = seq[q < 0.15 ? 0 : q < 0.35 ? 1 : q < 0.7 ? 2 : 3];
    }
    return {
      ...view,
      anim: working ? 'work' : moving ? 'walk' : 'idle',
      frame,
      tool,
      carry: u.carry && u.carry.amount > 0 && !working ? u.carry.res : null,
      packed: UNIT_DEFS[u.type].packs ? u.packed : undefined,
    };
  }

  /** Ships turn to face where they're going (or what they're shooting at) and ride the swell. */
  private shipPose(u: Unit, x: number, y: number, t: number): UnitPose {
    const prev = this.lastPos.get(u.id);
    let dir = this.heading.get(u.id) ?? 1;
    const moving = u.state === 'walk' && (u.x !== u.px || u.y !== u.py);
    if (prev && moving && Math.hypot(x - prev.x, y - prev.y) > 1e-4) dir = headingOf(x - prev.x, y - prev.y);
    const fighting = u.state === 'attack';
    if (fighting || u.state === 'gather' || u.state === 'build') {
      const j = this.jobPoint(u);
      // Broadside on to the target: warships and fishing boats work over the side.
      if (j) dir = headingOf(j.x - x, j.y - y);
      if (j && u.type !== 'fire_ship' && u.type !== 'demolition_raft' && u.type !== 'siege_barge') dir = (dir + 2) % 8;
    }
    this.heading.set(u.id, dir);
    this.lastPos.set(u.id, { x, y });
    const firing = fighting && u.cooldown > UNIT_DEFS[u.type].reload * 10 * 0.6;
    return {
      view: 'side',
      left: false,
      dir,
      anim: u.state === 'gather' || u.state === 'build' ? 'work' : moving ? 'walk' : 'idle',
      frame: Math.floor(t * (moving ? 2.4 : 1.2)) % 4,
      tool: 'none',
      carry: null,
      attack: firing || (u.type === 'fire_ship' && fighting),
    };
  }

  /** Foam curling off the bow and a widening wake astern. */
  private wake(v: FrameView, u: Unit, x: number, y: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const dir = this.heading.get(u.id) ?? 1;
    const a = (dir * Math.PI) / 4;
    const fx = Math.cos(a), fy = Math.sin(a);
    const len = u.type === 'demolition_raft' ? 0.75 : u.type === 'fishing_ship' ? 0.95 : 1.4;
    const moving = u.state === 'walk' && (u.x !== u.px || u.y !== u.py);
    const pt = (du: number, dv: number) => [this.sx(v, x + du * fx - dv * fy, y + du * fy + dv * fx), this.sy(v, x + du * fx - dv * fy, y + du * fy + dv * fx)] as const;
    if (!moving) {
      // Lapping ripples around a ship at rest.
      const r = S * len * (1 + 0.08 * Math.sin(v.now * 2 + u.id));
      const [cx, cy] = pt(0, 0);
      ctx.strokeStyle = 'rgba(230,242,248,0.25)';
      ctx.lineWidth = Math.max(1, S * 0.025);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const ph = (v.now * 1.4 + k / 4 + u.id * 0.17) % 1;
      const back = -len - ph * 1.6, spread = 0.25 + ph * 0.7;
      const alpha = 0.55 * (1 - ph);
      ctx.strokeStyle = `rgba(240,248,252,${alpha})`;
      ctx.lineWidth = Math.max(1, S * 0.05 * (1 - ph * 0.5));
      for (const side of [-1, 1]) {
        const [x0, y0] = pt(back + 0.25, side * spread * 0.6), [x1, y1] = pt(back, side * spread);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    // Bow wave.
    const [bx, by] = pt(len * 0.95, 0);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, S * 0.3);
    g.addColorStop(0, 'rgba(250,252,255,0.55)');
    g.addColorStop(1, 'rgba(250,252,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx, by, S * 0.3, S * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Which side of a dock's footprint the water is on (0 +x, 1 +y, 2 -x, 3 -y):
   * the side with the most deep water along it, looking a little further out
   * if none touches (so a ghost not yet on the shore still points its jetty at the sea).
   */
  private waterSide(x0: number, y0: number, size: number): number {
    const N = this.world.map.size;
    const deep = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && this.world.map.terrain[y * N + x] === Terrain.Deep;
    for (let reach = 1; reach <= 4; reach++) {
      const count = [0, 0, 0, 0];
      for (let k = 0; k < size; k++)
        for (let r = 1; r <= reach; r++) {
          if (deep(x0 + size - 1 + r, y0 + k)) count[0]++;
          if (deep(x0 + k, y0 + size - 1 + r)) count[1]++;
          if (deep(x0 - r, y0 + k)) count[2]++;
          if (deep(x0 + k, y0 - r)) count[3]++;
        }
      let best = 0;
      for (let k = 1; k < 4; k++) if (count[k] > count[best]) best = k;
      if (count[best]) return best;
    }
    return 0;
  }

  /** The sprite a building is drawn with now. */
  private buildingSprite(v: FrameView, b: Building): Sprite {
    const def = BUILDING_DEFS[b.type];
    // Farms show how much crop is left; walls how they join up and how battered they are.
    const variant =
      (b.type === 'farm' || b.type === 'fish_trap') && b.complete
        ? Math.max(1, Math.min(3, Math.ceil((b.amount / (def.food ?? 1)) * 3)))
        : def.shore
          ? this.waterSide(b.x, b.y, b.size)
          : def.wall || def.classes.includes('tower')
            ? this.wallVariant(b)
            : 0;
    return v.art.buildings.get(b.type, b.size, b.owner, variant, this.world.players[b.owner]?.age ?? 0);
  }

  /** Is a device-px point on a painted pixel of a sprite drawn at anchor (px, py)? `r` widens the test (device px). */
  private onSprite(v: FrameView, s: Sprite, px: number, py: number, dx: number, dy: number, r = 0): boolean {
    const k = (v.exact ? 1 : v.k) * (s.k ?? 1);
    const lx = (dx - px) / k + s.ax, ly = (dy - py) / k + s.ay;
    const rr = r / k;
    const mask = alphaMask(s.c);
    if (!mask) return false;
    for (const [ox, oy] of [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr]]) {
      const x = Math.round(lx + ox), y = Math.round(ly + oy);
      if (x >= 0 && y >= 0 && x < s.c.width && y < s.c.height && mask[y * s.c.width + x] > 40) return true;
    }
    return false;
  }

  /**
   * Did a tap (CSS px) land on the building's picture as last drawn? Only its
   * painted pixels count, with a little slack for a fingertip, so a tall Town
   * Center no longer swallows taps meant for what stands around it.
   */
  hitBuilding(b: Building, cssX: number, cssY: number, slackCss = 4): boolean {
    const v = this.lastFrame;
    if (!v || BUILDING_DEFS[b.type].walkable) return false;
    const dpr = this.view.dpr;
    const s = this.buildingSprite(v, b);
    return this.onSprite(v, s, this.sx(v, b.x, b.y), this.sy(v, b.x, b.y), cssX * dpr, cssY * dpr, slackCss * dpr);
  }

  private drawBuilding(v: FrameView, b: Building): void {
    const { ctx } = this.view;
    const { S } = v;
    const def = BUILDING_DEFS[b.type];
    const sprite = this.buildingSprite(v, b);
    const selected = v.overlay.selection.has(b.id);
    const ny = this.sy(v, b.x, b.y);
    const k = v.exact ? 1 : v.k;
    if (selected) {
      // Selection ring on the ground, so the building stands over it.
      this.diamond(v, b.x - 0.15, b.y - 0.15, b.size + 0.3);
      ctx.strokeStyle = b.owner === this.player ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,80,0.9)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      ctx.stroke();
    }
    if (b.complete) {
      this.put(v, sprite, b.x, b.y);
    } else {
      // Foundation: staked-out plot, the building rising from the ground, scaffolding.
      this.diamond(v, b.x, b.y, b.size);
      ctx.fillStyle = 'rgba(110,82,48,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,210,160,0.8)';
      ctx.lineWidth = Math.max(1, S / 24);
      ctx.stroke();
      const p = Math.max(0.04, b.progress);
      const sh = sprite.c.height;
      const shown = Math.max(1, Math.round(sh * p));
      const nx = this.sx(v, b.x, b.y);
      ctx.drawImage(sprite.c, 0, sh - shown, sprite.c.width, shown, nx - sprite.ax * k, ny - sprite.ay * k + (sh - shown) * k, sprite.c.width * k, shown * k);
      // Scaffolding poles at the visible corners, as tall as the work so far.
      const pole = S * b.size * 1.6 * p;
      ctx.strokeStyle = 'rgba(92,62,30,0.9)';
      ctx.lineWidth = Math.max(1, S / 14);
      ctx.beginPath();
      for (const [cx, cy] of [[b.x, b.y + b.size], [b.x + b.size, b.y + b.size], [b.x + b.size, b.y], [b.x + b.size / 2, b.y + b.size]]) {
        const X = this.sx(v, cx, cy), Y = this.sy(v, cx, cy);
        ctx.moveTo(X, Y);
        ctx.lineTo(X, Y - pole);
      }
      ctx.stroke();
    }
    if (selected && b.rally && b.owner === this.player) this.drawRally(v, b);
    const maxHp = buildingMaxHp(this.world, b);
    if (b.complete && b.hp < maxHp * 0.6 && !def.walkable && !def.wall) {
      // Burning: smoke from the start, flames once badly hurt.
      const frac = b.hp / maxHp;
      const top = S * b.size * 0.55 * ZK;
      this.smoke(v, b.x + b.size * 0.5, b.y + b.size * 0.5, top, 1.2 - frac, b.id);
      if (frac < 0.45) this.flames(v, b.x + b.size * 0.35, b.y + b.size * 0.7, top * 0.5, 0.5 + b.size * 0.12, b.id);
      if (frac < 0.25) this.flames(v, b.x + b.size * 0.75, b.y + b.size * 0.4, top * 0.7, 0.45 + b.size * 0.1, b.id + 3);
    }
    if (selected || !b.complete || (b.hp < maxHp - 0.5 && !def.walkable)) {
      const cx = this.sx(v, b.x + b.size / 2, b.y + b.size / 2);
      const top = def.walkable ? this.sy(v, b.x, b.y) - S * 0.6 : ny - S * (0.4 + b.size * 0.55) * ZK;
      this.hpBar(v, cx, top, Math.min(b.size * S * 1.2, S * 3), b.complete ? b.hp / maxHp : b.progress, b.owner, !b.complete);
    }
    if (b.garrison.length && (b.owner === this.player || selected)) {
      // Garrison badge: a shield with the count.
      const bx = this.sx(v, b.x + b.size / 2, b.y + b.size / 2), by = this.sy(v, b.x, b.y) - S * (0.6 + b.size * 0.55) * ZK;
      const r = Math.max(7, S * 0.28);
      ctx.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
      ctx.strokeStyle = '#f1d48a';
      ctx.lineWidth = Math.max(1, S / 24);
      ctx.beginPath();
      ctx.moveTo(bx - r, by - r);
      ctx.lineTo(bx + r, by - r);
      ctx.lineTo(bx + r, by + r * 0.3);
      ctx.quadraticCurveTo(bx, by + r * 1.4, bx - r, by + r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff6d8';
      ctx.font = `700 ${Math.round(r * 1.2)}px 'Alegreya Sans', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.garrison.length), bx, by - r * 0.1);
      ctx.textBaseline = 'alphabetic';
      // The King is inside: a crown over the badge.
      if (b.owner === this.player && b.garrison.some((id) => this.world.unit(id)?.type === 'king')) drawCrownIcon(ctx, bx, by - r * 1.9, r * 0.9);
    }
    if (b.type === 'monastery' && b.complete) {
      let n = 0;
      for (const r of this.world.resources()) if (r.type === 'relic' && r.holder === b.id) n++;
      const S2 = Math.max(6, S * 0.22);
      for (let k = 0; k < n; k++) {
        const X = this.sx(v, b.x + b.size / 2, b.y + b.size / 2) + (k - (n - 1) / 2) * S2 * 2.2;
        drawRelicIcon(ctx, X, ny - S * (0.3 + b.size * 0.5) * ZK, S2);
      }
    }
  }

  /** A relic: a small gilded casket, on the ground or held up by its monk. */
  private drawRelic(v: FrameView, x: number, y: number, lift: number): void {
    const r = Math.max(4, v.S * 0.2);
    const X = this.sx(v, x, y), Y = this.sy(v, x, y) - lift;
    const { ctx } = this.view;
    if (!lift) {
      // A soft glow so it can be spotted.
      const glow = ctx.createRadialGradient(X, Y - r, 1, X, Y - r, r * 3.5);
      glow.addColorStop(0, 'rgba(255,230,140,0.55)');
      glow.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(X - r * 3.5, Y - r * 4.5, r * 7, r * 7);
    }
    drawRelicIcon(ctx, X, Y - r, r);
  }

  /** The capture circle of a Domination site, in the holder's colour. */
  private drawSiteRing(v: FrameView, st: Site): void {
    const { ctx } = this.view;
    const X = this.sx(v, st.x, st.y), Y = this.sy(v, st.x, st.y);
    const R = SITE_RADIUS * v.S;
    const col = st.owner >= 0 ? PLAYER_COLORS[st.owner % PLAYER_COLORS.length] : '#f2ead8';
    ctx.save();
    ctx.setLineDash([R * 0.08, R * 0.06]);
    ctx.lineWidth = Math.max(1.5, v.S / 12);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(X, Y, R * 1.414, R * 0.707, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (st.capture > 0 && st.by >= 0) {
      // Capture progress as an arc in the capturer's colour.
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(3, v.S / 6);
      ctx.strokeStyle = PLAYER_COLORS[st.by % PLAYER_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(X, Y, R * 1.414, R * 0.707, 0, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * st.capture) / CAPTURE_TIME);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The site's banner pole: a tall staff with a flag in the holder's colour. */
  private drawSitePole(v: FrameView, st: Site): void {
    const { ctx } = this.view;
    const X = this.sx(v, st.x, st.y), Y = this.sy(v, st.x, st.y);
    const h = v.S * 2.2;
    const col = st.owner >= 0 ? PLAYER_COLORS[st.owner % PLAYER_COLORS.length] : '#e8e2d2';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(X, Y, v.S * 0.35, v.S * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stone base, pole and gilt finial.
    ctx.fillStyle = '#8e897e';
    ctx.fillRect(X - v.S * 0.18, Y - v.S * 0.18, v.S * 0.36, v.S * 0.2);
    ctx.fillStyle = '#4a3019';
    ctx.fillRect(X - Math.max(1, v.S * 0.03), Y - h, Math.max(2, v.S * 0.06), h);
    ctx.fillStyle = '#e0b54a';
    ctx.beginPath();
    ctx.arc(X, Y - h, Math.max(2, v.S * 0.07), 0, Math.PI * 2);
    ctx.fill();
    const wave = Math.sin(v.now * 3 + st.x) * v.S * 0.06;
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X, Y - h * 0.95);
    ctx.quadraticCurveTo(X + v.S * 0.4, Y - h * 0.95 - wave, X + v.S * 0.8, Y - h * 0.93);
    ctx.lineTo(X + v.S * 0.8, Y - h * 0.68);
    ctx.quadraticCurveTo(X + v.S * 0.4, Y - h * 0.7 + wave, X, Y - h * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /** Neighbour joins, damage, gate state and tower level for a fortification sprite. */
  private wallVariant(b: Building): number {
    const def = BUILDING_DEFS[b.type];
    const { grid } = this.world;
    const N = this.world.map.size;
    let mask = 0;
    if (def.wall)
      DIR8.forEach(([dx, dy], k) => {
        const x = b.x + dx, y = b.y + dy;
        if (x < 0 || y < 0 || x >= N || y >= N) return;
        const o = this.world.building(grid.building[y * N + x]);
        if (o && o.owner === b.owner && (BUILDING_DEFS[o.type].wall || BUILDING_DEFS[o.type].classes.includes('tower'))) mask |= 1 << k;
      });
    const frac = b.complete ? b.hp / buildingMaxHp(this.world, b) : 1;
    const damage = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
    let open = false;
    if (def.gate && !b.locked)
      this.world.spatial.query(b.x + 0.5, b.y + 0.5, 1.6, (u) => {
        if (u.owner === b.owner) open = true;
      });
    const techs = (this.world.players[b.owner]?.techs ?? []) as string[];
    const level = techs.includes('keep') ? 2 : techs.includes('guard_tower') ? 1 : 0;
    return wallVariant(mask, damage, open, b.locked, level);
  }

  /** Dashed line from a building to its rally flag. */
  private drawRally(v: FrameView, b: Building): void {
    const { ctx } = this.view;
    const { S } = v;
    const r = b.rally!;
    const bx = this.sx(v, b.x + b.size / 2, b.y + b.size / 2), by = this.sy(v, b.x + b.size / 2, b.y + b.size / 2);
    const fx = this.sx(v, r.x, r.y), fy = this.sy(v, r.x, r.y);
    ctx.save();
    ctx.setLineDash([S * 0.3, S * 0.2]);
    ctx.strokeStyle = 'rgba(255,240,200,0.75)';
    ctx.lineWidth = Math.max(1, S / 20);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#3a2614';
    ctx.lineWidth = Math.max(1.5, S / 14);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - S * 1.3);
    ctx.stroke();
    const wave = Math.sin(v.now * 4) * S * 0.06;
    ctx.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy - S * 1.3);
    ctx.quadraticCurveTo(fx + S * 0.35, fy - S * 1.25 + wave, fx + S * 0.7, fy - S * 1.15);
    ctx.lineTo(fx, fy - S * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawGhost(v: FrameView, gh: NonNullable<Overlay['ghost']>): void {
    const { ctx } = this.view;
    if (gh.wall) {
      // Planned wall: each segment tinted by whether it can go there, joined to its planned neighbours.
      const plan = [...gh.wall].sort((a, b) => a.x + a.y - (b.x + b.y));
      const has = (x: number, y: number) => plan.some((t) => t.x === x && t.y === y);
      const def = BUILDING_DEFS[gh.type];
      const kind = def.wall!;
      for (const t of plan) {
        this.diamond(v, t.x, t.y, 1);
        ctx.fillStyle = !t.valid ? 'rgba(230,60,50,0.45)' : t.gate ? 'rgba(255,200,60,0.45)' : 'rgba(90,220,110,0.35)';
        ctx.fill();
        let mask = 0;
        DIR8.forEach(([dx, dy], k) => {
          if (has(t.x + dx, t.y + dy)) mask |= 1 << k;
        });
        const type: BuildingType = t.gate ? (kind === 'stone' ? 'gate' : 'palisade_gate') : gh.type;
        this.put(v, v.art.buildings.get(type, 1, this.player, wallVariant(mask, 0), this.world.players[this.player]?.age ?? 0), t.x, t.y, 0.65);
      }
      return;
    }
    const size = BUILDING_DEFS[gh.type].size;
    this.diamond(v, gh.x, gh.y, size);
    ctx.fillStyle = gh.valid ? 'rgba(90,220,110,0.35)' : 'rgba(230,60,50,0.4)';
    ctx.fill();
    ctx.strokeStyle = gh.valid ? 'rgba(170,255,180,0.95)' : 'rgba(255,140,130,0.95)';
    ctx.lineWidth = Math.max(1.5, v.S / 14);
    ctx.stroke();
    const def = BUILDING_DEFS[gh.type];
    // A field shows ripe; a dock turns its jetty toward the water it would stand by.
    const variant = gh.type === 'farm' || gh.type === 'fish_trap' ? 3 : def.shore ? this.waterSide(gh.x, gh.y, size) : 0;
    this.put(v, v.art.buildings.get(gh.type, size, this.player, variant, this.world.players[this.player]?.age ?? 0), gh.x, gh.y, 0.6);
  }

  /** AoE-style health bar in the owner's colour (gold while under construction). */
  private hpBar(v: FrameView, cx: number, y: number, w: number, frac: number, owner: number, building = false): void {
    const { ctx } = this.view;
    const h = Math.max(3, v.S / 7);
    const f = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(10,6,2,0.85)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(70,20,15,0.9)';
    ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = building ? '#e8c25a' : PLAYER_COLORS[owner % PLAYER_COLORS.length];
    ctx.fillRect(cx - w / 2, y, w * f, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - w / 2, y, w * f, Math.max(1, h * 0.35));
  }

  private drawFog(v: FrameView): void {
    if (this.fog.revealed) return;
    const { ctx } = this.view;
    // The fog texture has one texel per tile; draw it through the isometric projection.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(v.S, v.S / 2, -v.S, v.S / 2, -v.ox, -v.oy);
    ctx.drawImage(this.fogLayer.canvas, 0, 0);
    ctx.restore();
  }

  private drawEffects(v: FrameView): void {
    const { ctx } = this.view;
    const { S } = v;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const age = v.now - e.born;
      if (age > EFFECT_S) {
        this.effects.splice(i, 1);
        continue;
      }
      if (!this.fog.isVisible(e.x, e.y)) continue;
      const t = age / EFFECT_S;
      const px = this.sx(v, e.x, e.y), py = this.sy(v, e.x, e.y);
      ctx.globalAlpha = 1 - t * t;
      if (e.kind === 'blast') {
        // Dust and debris thrown up where a stone lands or a petard blows.
        const r = S * (e.size ?? 0.8) * (0.6 + t * 1.2);
        const dust = ctx.createRadialGradient(px, py - r * 0.3, 0, px, py - r * 0.3, r);
        dust.addColorStop(0, `rgba(150,130,100,${0.7 * (1 - t)})`);
        dust.addColorStop(1, 'rgba(150,130,100,0)');
        ctx.fillStyle = dust;
        ctx.beginPath();
        ctx.ellipse(px, py - r * 0.3, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        if (t < 0.3) {
          ctx.fillStyle = `rgba(255,200,90,${1 - t / 0.3})`;
          ctx.beginPath();
          ctx.arc(px, py - S * 0.2, S * 0.25 * (e.size ?? 1), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#4a3c2c';
        for (let k = 0; k < 6; k++) {
          const a2 = k * 1.05;
          ctx.fillRect(px + Math.cos(a2) * r * t * 1.2, py - S * 0.4 - Math.sin(a2) * r * 0.8 * (1 - t) + t * t * S, Math.max(1, S * 0.06), Math.max(1, S * 0.06));
        }
      } else if (e.kind === 'text') {
        ctx.font = `700 ${Math.round(Math.max(11, S * 0.55))}px 'Alegreya Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, S / 10);
        ctx.strokeStyle = 'rgba(10,6,2,0.85)';
        const ty = py - S * (1.6 + t * 1.2);
        ctx.strokeText(e.text!, px, ty);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text!, px, ty);
      } else {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(1.5, S / 14);
        ctx.beginPath();
        const r = S * (0.3 + t * 0.8);
        ctx.ellipse(px, py, r, r / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}
