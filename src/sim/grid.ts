import { Feature, type GameMap, Terrain } from './terrain';

/** Pass as the player to navigate the water layer (ships): deep water not covered by a solid building. */
export const WATER = -2;

/** Connected regions of one walkability array, rebuilt lazily after changes. */
interface Layer {
  walk: Uint8Array;
  comp: Int32Array;
  walkDirty: boolean;
  compDirty: boolean;
}

/**
 * Land navigation layer: which tiles land units can stand on, which building
 * occupies each tile, and connected regions so unreachable goals are rejected
 * without a search.
 *
 * Gates are solid for everyone in the base layer; each player has its own
 * layer in which its own unlocked gates are open. Pass the player to the
 * queries that should see through its gates (paths, movement); omit it (-1)
 * for questions about the ground itself (placement, spawning).
 */
export class NavGrid {
  readonly N: number;
  /** 1 = walkable by land units (gates closed). */
  readonly walk: Uint8Array;
  /** Building id occupying each tile (0 = none), including walkable ones like farms. */
  readonly building: Int32Array;
  /** 1 where a building blocks movement. */
  private readonly solid: Uint8Array;
  /** Gate tiles: owner, and whether it is locked. */
  private readonly gates = new Map<number, { owner: number; locked: boolean }>();
  private readonly base: Layer;
  private readonly layers: Layer[] = [];
  /** Ships: 1 on deep water clear of solid buildings (fish traps are open water). */
  private readonly water: Layer;

  constructor(private readonly map: GameMap) {
    this.N = map.size;
    const n = this.N * this.N;
    this.walk = new Uint8Array(n);
    this.building = new Int32Array(n);
    this.solid = new Uint8Array(n);
    this.base = { walk: this.walk, comp: new Int32Array(n), walkDirty: false, compDirty: true };
    this.water = { walk: new Uint8Array(n), comp: new Int32Array(n), walkDirty: false, compDirty: true };
    for (let i = 0; i < n; i++) this.refresh(i);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.N && y < this.N;
  }

  /** Walkability array for a player (its own unlocked gates open), the base one for -1, ships' for WATER. */
  walkOf(player = -1): Uint8Array {
    return this.layer(player).walk;
  }

  isWalkable(x: number, y: number, player = -1): boolean {
    return this.inside(x, y) && this.layer(player).walk[y * this.N + x] === 1;
  }

  /** Recomputes walkability of one tile from terrain, features and buildings. */
  refresh(i: number): void {
    const wet = this.map.terrain[i] === Terrain.Deep && this.solid[i] === 0 ? 1 : 0;
    if (this.water.walk[i] !== wet) {
      this.water.walk[i] = wet;
      this.water.compDirty = true;
    }
    const was = this.walk[i];
    const now = this.map.terrain[i] !== Terrain.Deep && this.map.feature[i] === Feature.None && this.solid[i] === 0 ? 1 : 0;
    if (was !== now) {
      this.walk[i] = now;
      this.dirty();
    }
  }

  private dirty(): void {
    this.base.compDirty = true;
    for (const l of this.layers) if (l) (l.walkDirty = true), (l.compDirty = true);
  }

  /** Marks (id > 0) or clears (id = 0) a footprint; `solid` buildings block movement. */
  setBuilding(x: number, y: number, size: number, id: number, solid = true): void {
    for (let ty = y; ty < y + size; ty++)
      for (let tx = x; tx < x + size; tx++) {
        const i = ty * this.N + tx;
        this.building[i] = id;
        this.solid[i] = id && solid ? 1 : 0;
        if (!id && this.gates.delete(i)) this.dirty();
        this.refresh(i);
      }
  }

  /** Registers a gate tile: open to its owner unless locked. */
  setGate(x: number, y: number, owner: number, locked: boolean): void {
    this.gates.set(y * this.N + x, { owner, locked });
    this.dirty();
  }

  gateAt(x: number, y: number): { owner: number; locked: boolean } | undefined {
    return this.gates.get(y * this.N + x);
  }

  private layer(player: number): Layer {
    if (player === WATER) return this.water;
    if (player < 0) return this.base;
    let l = this.layers[player];
    if (!l) {
      const n = this.N * this.N;
      l = this.layers[player] = { walk: new Uint8Array(n), comp: new Int32Array(n), walkDirty: true, compDirty: true };
    }
    if (l.walkDirty) {
      l.walk.set(this.walk);
      for (const [i, g] of this.gates) if (g.owner === player && !g.locked) l.walk[i] = 1;
      l.walkDirty = false;
    }
    return l;
  }

  /** Connected-region id of a tile for a player (-1 if blocked). */
  component(x: number, y: number, player = -1): number {
    if (!this.inside(x, y)) return -1;
    const l = this.layer(player);
    if (l.compDirty) this.rebuildComponents(l);
    return l.comp[y * this.N + x];
  }

  private rebuildComponents(l: Layer): void {
    const { N } = this;
    const { walk, comp } = l;
    comp.fill(-1);
    const stack = new Int32Array(N * N);
    let next = 0;
    for (let i = 0; i < N * N; i++) {
      if (!walk[i] || comp[i] >= 0) continue;
      let sp = 0;
      stack[sp++] = i;
      comp[i] = next;
      while (sp) {
        const j = stack[--sp];
        const x = j % N, y = (j / N) | 0;
        if (x > 0 && walk[j - 1] && comp[j - 1] < 0) (comp[j - 1] = next), (stack[sp++] = j - 1);
        if (x < N - 1 && walk[j + 1] && comp[j + 1] < 0) (comp[j + 1] = next), (stack[sp++] = j + 1);
        if (y > 0 && walk[j - N] && comp[j - N] < 0) (comp[j - N] = next), (stack[sp++] = j - N);
        if (y < N - 1 && walk[j + N] && comp[j + N] < 0) (comp[j + N] = next), (stack[sp++] = j + N);
      }
      next++;
    }
    l.compDirty = false;
  }

  /** Nearest walkable tile to (x, y) in the given region (for that player's layer), searching outward in rings. */
  nearestWalkable(x: number, y: number, region: number, maxR = 24, player = -1): { x: number; y: number } | null {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let r = 0; r <= maxR; r++) {
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx, ty = cy + dy;
          if (!this.isWalkable(tx, ty, player) || (region >= 0 && this.component(tx, ty, player) !== region)) continue;
          const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
          if (d < bd) (bd = d), (best = { x: tx, y: ty });
        }
      if (best) return best;
    }
    return null;
  }
}
