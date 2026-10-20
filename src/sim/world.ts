import economy from '../data/economy.json';
import mapsData from '../data/maps.json';
import { applyCommand, type Command } from './commands';
import { combatThink, type Projectile, projectileTick } from './combat';
import { towerTick, ungarrison } from './fortify';
import { carryRiders, unload } from './siege';
import { constructionTick, goalFor, think, unreachable } from './economy';
import { type ResourceKind, TICK_RATE } from './constants';
import {
  BUILDING_DEFS,
  type Building,
  type BuildingType,
  type Entity,
  type ResourceEntity,
  UNIT_DEFS,
  type Unit,
  type UnitType,
  navOf,
} from './entities';
import { Fog, type VisionSource } from './fog';
import { NavGrid } from './grid';
import { moveUnit, separate } from './movement';
import { marketDrift, productionTick } from './production';
import { Pathfinder } from './pathfinding';
import { Rng } from './rng';
import { SpatialHash } from './spatial';
import { type PlayerMods, type TechId, baseMods, buildingMaxHp, unitStats } from './techs';
import { type GameMap, Terrain } from './terrain';
import { type GameMode, type ModeState, type VictoryReason, modeTick, newModeState, setupMode } from './modes';
import { type ScenarioDef, type ScenarioState, setupScenario } from './scenario';

export { DT, RESOURCE_KINDS, TICK_MS, TICK_RATE, type ResourceKind } from './constants';

/** Losing all of these (and every soldier) loses the match. */
const CONQUEST_BUILDINGS = new Set<BuildingType>(['town_center', 'castle', 'dock']);

/** 1v1: two teams; 1v2: the human alone against two; 2v2: slots 0-1 against 2-3. */
export function defaultTeams(players: number): number[] {
  return players === 2 ? [0, 1] : players === 3 ? [0, 1, 1] : [0, 0, 1, 1];
}

/** Path searches run per tick; the rest wait for the next tick (keeps ticks bounded). */
const PATHS_PER_TICK = 32;

export interface PlayerState {
  resources: Record<ResourceKind, number>;
  /** Totals gathered over the match. */
  gathered: Record<ResourceKind, number>;
  pop: number;
  popCap: number;
  /** 0-3: Settlement, Township, Stronghold, Dominion. */
  age: number;
  /** Replant farms automatically when they run out (costs a farm's wood). */
  autoReseed: boolean;
  /** Technologies researched, in order. */
  techs: TechId[];
  /** Effective stats after research. */
  mods: PlayerMods;
  /** Market prices (gold per 100) for buying each commodity. */
  market: { food: number; wood: number; stone: number };
  /** Team (allies share vision and never fight). */
  team: number;
  /** Gather-rate multiplier (the Hard AI's disclosed bonus). */
  gatherBonus: number;
  /** Out of the match: lost every Town Center, Castle, Dock and soldier. */
  defeated: boolean;
  /** Faction (bonuses and unique unit); empty for none. */
  faction: string;
  /** The town bell is ringing: villagers are sheltering. */
  bell?: boolean;
}

export type SimEvent =
  | { type: 'dropoff'; owner: number; x: number; y: number; res: ResourceKind; amount: number }
  | { type: 'built'; owner: number; id: number }
  | { type: 'trained'; owner: number; id: number }
  | { type: 'error'; owner: number; message: string }
  /** `owner` is the side that was hit; `by` the attacking side. */
  | { type: 'hit'; owner: number; by: number; id: number; x: number; y: number; amount: number; building: boolean; src?: UnitType }
  | { type: 'death'; owner: number; unit: UnitType; x: number; y: number; face: number; by: number }
  | { type: 'destroyed'; owner: number; building: BuildingType; x: number; y: number; size: number; by: number }
  | { type: 'converted'; owner: number; from: number; id: number; x: number; y: number }
  | { type: 'researched'; owner: number; tech: TechId }
  /** Stone, boulder or powder blast landing (dust and debris). */
  | { type: 'blast'; x: number; y: number; size: number; owner?: number }
  | { type: 'defeated'; owner: number }
  /** The match is over: this team won. */
  | { type: 'victory'; owner: number; team: number; reason: VictoryReason }
  /** A Domination site changed hands, a Wonder was finished, a relic came home... (for alerts). */
  | { type: 'mode'; owner: number; message: string; x: number; y: number }
  /** The town bell rang (villagers to shelter) or sounded the all clear. */
  | { type: 'bell'; owner: number; on: boolean }
  /** A campaign message: a story beat, or (alarm) an invasion on its way. */
  | { type: 'scenario'; owner: number; text: string; alarm?: boolean; x?: number; y?: number };

/** Game state, advanced only by step(); input and AI both act through issue(). */
export class World {
  tick = 0;
  readonly players: PlayerState[];
  /** Fog per player slot. */
  readonly fog: Fog[];
  readonly entities = new Map<number, Entity>();
  readonly grid: NavGrid;
  readonly paths: Pathfinder;
  readonly rng: Rng;
  /** Events since the last drain (drop-offs, completions, errors), for effects and HUD. */
  events: SimEvent[] = [];
  /** Builders working on each foundation this tick. */
  readonly builders = new Map<number, number>();
  /** Units by position, rebuilt each tick. */
  readonly spatial: SpatialHash;
  /** Arrows and javelins in flight. */
  projectiles: Projectile[] = [];
  /** Peace Treaty: until this match time (seconds) nobody can attack. */
  peaceUntil = 0;
  /** Winning team once the match is decided. */
  winner: number | null = null;
  /** How it was won. */
  victoryReason: VictoryReason | null = null;
  /** Standard, Regicide or Domination. */
  readonly mode: GameMode;
  /** Wonder and relic clocks, Domination sites and score. */
  modeState: ModeState;
  /** The campaign chapter being played, if any. */
  scenario: ScenarioState | null = null;
  nextProjectileId = 1;
  private nextId = 1;
  private pending: Array<{ player: number; cmd: Command }> = [];
  private pathQueue: number[] = [];
  private readonly popLimit: number;

  constructor(
    readonly map: GameMap,
    opts: { spawnStarts?: boolean; teams?: number[]; factions?: string[]; mode?: GameMode; scenario?: { def: ScenarioDef; variant: string } } = {},
  ) {
    this.mode = opts.mode ?? 'standard';
    this.modeState = newModeState(map.starts.length);
    this.rng = new Rng(map.seed ^ 0x9e3779b9);
    this.grid = new NavGrid(map);
    this.paths = new Pathfinder(this.grid);
    this.spatial = new SpatialHash(map.size);
    this.popLimit = mapsData.sizes[map.sizeName].popCap;
    this.players = map.starts.map((_, i) => ({
      resources: { ...economy.startResources },
      gathered: { food: 0, wood: 0, gold: 0, stone: 0 },
      pop: 0,
      popCap: 0,
      age: 0,
      autoReseed: true,
      techs: [],
      mods: baseMods(opts.factions?.[i]),
      market: { food: 100, wood: 100, stone: 130 },
      team: opts.teams?.[i] ?? defaultTeams(map.starts.length)[i],
      gatherBonus: 1,
      defeated: false,
      faction: opts.factions?.[i] ?? '',
    }));
    this.fog = map.starts.map((s) => {
      const fog = new Fog(map.size);
      fog.explore(s.x + 0.5, s.y + 0.5, mapsData.start.exploredRadius);
      return fog;
    });
    for (const a of map.animals) this.add<ResourceEntity>({ kind: 'resource', type: a.kind, x: a.x, y: a.y, amount: a.amount });
    if (opts.spawnStarts !== false) {
      map.starts.forEach((s, p) => this.spawnStart(p, s.x, s.y));
      setupMode(this);
      if (opts.scenario) setupScenario(this, opts.scenario.def, opts.scenario.variant);
    }
    this.updatePopulation();
    this.updateVision();
  }

  /** Players on opposing teams. */
  isEnemy(a: number, b: number): boolean {
    return a !== b && a >= 0 && b >= 0 && this.players[a]?.team !== this.players[b]?.team;
  }

  /** Enemies who may fight now (not during the Peace Treaty). */
  canFight(a: number, b: number): boolean {
    return this.isEnemy(a, b) && this.time >= this.peaceUntil;
  }

  get peace(): boolean {
    return this.time < this.peaceUntil;
  }

  /** Match time in seconds. */
  get time(): number {
    return this.tick / TICK_RATE;
  }

  // ---------- entities ----------

  /** @internal Adds an entity as is (map setup, modes). */
  add<T extends Entity>(e: Omit<T, 'id'>): T {
    const full = { ...e, id: this.nextId++ } as T;
    this.entities.set(full.id, full);
    return full;
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  unit(id: number): Unit | undefined {
    const e = this.entities.get(id);
    return e?.kind === 'unit' ? e : undefined;
  }

  building(id: number): Building | undefined {
    const e = this.entities.get(id);
    return e?.kind === 'building' ? e : undefined;
  }

  *units(owner?: number): IterableIterator<Unit> {
    for (const e of this.entities.values()) if (e.kind === 'unit' && (owner === undefined || e.owner === owner)) yield e;
  }

  *buildings(owner?: number): IterableIterator<Building> {
    for (const e of this.entities.values()) if (e.kind === 'building' && (owner === undefined || e.owner === owner)) yield e;
  }

  /** Units out on the map (not sheltering inside a building). */
  *field(owner?: number): IterableIterator<Unit> {
    for (const e of this.entities.values()) if (e.kind === 'unit' && !e.inside && (owner === undefined || e.owner === owner)) yield e;
  }

  *resources(): IterableIterator<ResourceEntity> {
    for (const e of this.entities.values()) if (e.kind === 'resource') yield e;
  }

  remove(id: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    if (e.kind === 'building') {
      ungarrison(this, e);
      this.grid.setBuilding(e.x, e.y, e.size, 0);
    }
    if (e.kind === 'unit') {
      unload(this, e);
      this.updatePopulation();
    }
    this.entities.delete(id);
  }

  spawnUnit(type: UnitType, owner: number, x: number, y: number): Unit {
    return this.add<Unit>({
      kind: 'unit',
      type,
      owner,
      x,
      y,
      px: x,
      py: y,
      hp: unitStats(this, owner, type).hp,
      face: 1,
      stance: UNIT_DEFS[type].stance,
      cooldown: 0,
      guard: null,
      flow: null,
      inside: 0,
      cargo: [],
      packed: !!UNIT_DEFS[type].packs,
      packTimer: 0,
      attackedBy: 0,
      attackedAt: -1000,
      faith: 0,
      ferry: null,
      order: null,
      path: null,
      pathIdx: 0,
      pathPending: false,
      state: 'idle',
      carry: null,
      gatherAcc: 0,
      resume: null,
      repaths: 0,
    });
  }

  /** True if a building of this type fits at (x, y) for this player. */
  canPlace(type: BuildingType, owner: number, x: number, y: number): boolean {
    const def = BUILDING_DEFS[type];
    const size = def.size;
    const { map, grid } = this;
    const fog = this.fog[owner];
    if (def.requires && ![...this.buildings(owner)].some((b) => b.type === def.requires && b.complete)) return false;
    if (this.players[owner] && def.age > this.players[owner].age) return false;
    if (this.wallUnderGate(type, owner, x, y)) return true;
    for (let ty = y; ty < y + size; ty++)
      for (let tx = x; tx < x + size; tx++) {
        if (!grid.inside(tx, ty)) return false;
        const i = ty * map.size + tx;
        const t = map.terrain[i];
        // Fish traps go on deep water; everything else on dry land.
        if (def.naval ? t !== Terrain.Deep : t === Terrain.Deep || t === Terrain.Shallow) return false;
        if (map.feature[i] !== 0 || grid.building[i] !== 0) return false;
        if (fog && !fog.explored[i]) return false;
      }
    return !def.shore || this.besideWater(x, y, size);
  }

  /** Deep water touches the footprint's edge (docks need somewhere to launch ships). */
  besideWater(x: number, y: number, size: number): boolean {
    const N = this.map.size;
    for (let k = 0; k < size; k++)
      for (const [tx, ty] of [
        [x + k, y - 1],
        [x + k, y + size],
        [x - 1, y + k],
        [x + size, y + k],
      ])
        if (this.grid.inside(tx, ty) && this.map.terrain[ty * N + tx] === Terrain.Deep) return true;
    return false;
  }

  /** A gate may be set into one of its owner's own wall segments of the same material, replacing it. */
  private wallUnderGate(type: BuildingType, owner: number, x: number, y: number): Building | null {
    const def = BUILDING_DEFS[type];
    if (!def.gate || !this.grid.inside(x, y)) return null;
    const b = this.building(this.grid.building[y * this.map.size + x]);
    if (!b || b.owner !== owner) return null;
    const bd = BUILDING_DEFS[b.type];
    return bd.wall === def.wall && !bd.gate ? b : null;
  }

  placeBuilding(type: BuildingType, owner: number, x: number, y: number, complete = false): Building {
    const def = BUILDING_DEFS[type];
    const old = this.wallUnderGate(type, owner, x, y);
    if (old) this.remove(old.id);
    const b = this.add<Building>({
      kind: 'building',
      type,
      owner,
      x,
      y,
      size: def.size,
      hp: complete ? def.hp : 1,
      progress: complete ? 1 : 0,
      complete,
      queue: [],
      rally: null,
      repeat: false,
      amount: def.food ? def.food + (this.players[owner]?.mods.farmFood ?? 0) : 0,
      housed: false,
      garrison: [],
      cooldown: 0,
      locked: false,
    });
    if (def.gate) this.grid.setGate(x, y, owner, false);
    if (complete) b.hp = buildingMaxHp(this, b);
    this.grid.setBuilding(x, y, def.size, b.id, !def.walkable);
    // Anyone standing on the new footprint steps off it.
    for (const u of this.units()) {
      if (def.walkable || this.grid.building[Math.floor(u.y) * this.map.size + Math.floor(u.x)] !== b.id) continue;
      const out = this.grid.nearestWalkable(u.x, u.y, -1, def.size + 4, navOf(u));
      if (out) {
        u.x = u.px = out.x + 0.5;
        u.y = u.py = out.y + 0.5;
      }
      u.path = null;
    }
    if (complete) this.updatePopulation();
    return b;
  }

  /** Town Center, three villagers and a scout around a start tile. */
  private spawnStart(owner: number, sx: number, sy: number): void {
    const tc = this.placeBuilding('town_center', owner, sx - 1, sy - 1, true);
    const below = tc.y + tc.size + 0.6;
    for (let k = 0; k < 3; k++) this.spawnUnit('villager', owner, tc.x + 0.8 + k * 1.2, below);
    this.spawnUnit('scout', owner, tc.x + tc.size + 0.8, tc.y + 1.5);
  }

  // ---------- commands & paths ----------

  issue(player: number, cmd: Command): void {
    this.pending.push({ player, cmd });
  }

  /** Queues a path search for a unit; the goal is read from its order when the search runs. */
  requestPath(u: Unit): void {
    if (u.pathPending) return;
    u.pathPending = true;
    this.pathQueue.push(u.id);
  }

  private processPaths(): void {
    let done = 0;
    while (this.pathQueue.length && done < PATHS_PER_TICK) {
      const id = this.pathQueue.shift()!;
      const u = this.unit(id);
      if (!u || !u.pathPending) continue;
      u.pathPending = false;
      const goal = goalFor(this, u);
      if (!goal) {
        // Nowhere to go (an unreachable spot, a vanished target): give the order up rather than walk on the spot.
        if (u.order?.type === 'move') unreachable(this, u);
        continue;
      }
      done++;
      let sx = Math.floor(u.x), sy = Math.floor(u.y);
      const nav = navOf(u);
      if (!this.grid.isWalkable(sx, sy, nav)) {
        const near = this.grid.nearestWalkable(u.x, u.y, -1, 3, nav);
        if (near) (sx = near.x), (sy = near.y);
      }
      const path = this.paths.find(sx, sy, goal, nav);
      if (path === null) {
        unreachable(this, u);
        continue;
      }
      u.path = path;
      u.pathIdx = 0;
    }
  }

  // ---------- simulation ----------

  step(): void {
    for (const { player, cmd } of this.pending) applyCommand(this, player, cmd);
    this.pending = [];

    this.builders.clear();
    this.spatial.rebuild(this.field());
    for (const u of this.field()) {
      u.px = u.x;
      u.py = u.y;
      if (!combatThink(this, u)) think(this, u);
    }
    this.processPaths();
    for (const u of this.field()) moveUnit(this, u);
    separate(this);
    carryRiders(this);
    towerTick(this);
    projectileTick(this);
    constructionTick(this);
    productionTick(this);
    marketDrift(this);
    this.updatePopulation();
    if (this.tick % 2 === 0) this.updateVision();
    modeTick(this);
    if (this.tick % TICK_RATE === 0) this.checkConquest();
    this.tick++;
  }

  /** A player concedes: out of the match at once (the AI does when beaten; so can the human). */
  resign(player: number): void {
    this.defeat(player);
  }

  /**
   * Conquest: a side with no Town Center, Castle or Dock and no soldiers or
   * warships left is out; when only one team remains, it has won.
   */
  checkConquest(reason: VictoryReason = 'conquest'): void {
    if (this.winner !== null) return;
    const alive = this.players.map(() => false);
    for (const b of this.buildings()) if (CONQUEST_BUILDINGS.has(b.type) && b.complete) alive[b.owner] = true;
    for (const u of this.units()) if (!UNIT_DEFS[u.type].gatherer) alive[u.owner] = true;
    this.players.forEach((p, i) => {
      // A campaign's invaders aren't conquered just because a wave has been beaten.
      if (p.defeated || alive[i] || (this.scenario?.noConquest && i !== 0)) return;
      p.defeated = true;
      this.events.push({ type: 'defeated', owner: i });
    });
    const teams = new Set(this.players.filter((p) => !p.defeated).map((p) => p.team));
    if (teams.size <= 1) this.declareWinner([...teams][0] ?? -1, reason);
  }

  /** The match is over: this team has won. */
  declareWinner(team: number, reason: VictoryReason): void {
    if (this.winner !== null) return;
    this.winner = team;
    this.victoryReason = reason;
    // Everyone else is out.
    this.players.forEach((p, i) => {
      if (p.team === team || p.defeated) return;
      p.defeated = true;
      this.events.push({ type: 'defeated', owner: i });
    });
    this.events.push({ type: 'victory', owner: this.players.findIndex((p) => p.team === team), team, reason });
  }

  /** A player is out of the match (their King fell, they resigned...). */
  defeat(player: number, reason: VictoryReason = 'conquest'): void {
    const p = this.players[player];
    if (!p || p.defeated) return;
    p.defeated = true;
    this.events.push({ type: 'defeated', owner: player });
    this.checkConquest(reason);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  updatePopulation(): void {
    for (const p of this.players) (p.pop = 0), (p.popCap = 0);
    for (const u of this.units()) if (this.players[u.owner]) this.players[u.owner].pop += UNIT_DEFS[u.type].pop;
    for (const b of this.buildings())
      if (b.complete && this.players[b.owner]) this.players[b.owner].popCap += BUILDING_DEFS[b.type].pop;
    for (const p of this.players) p.popCap = Math.min(p.popCap, this.popLimit);
  }

  private updateVision(): void {
    const sources: VisionSource[][] = this.players.map(() => []);
    for (const u of this.field()) sources[u.owner]?.push({ x: u.x, y: u.y, r: unitStats(this, u.owner, u.type).los });
    for (const b of this.buildings())
      sources[b.owner]?.push({ x: b.x + b.size / 2, y: b.y + b.size / 2, r: BUILDING_DEFS[b.type].los + b.size / 2 + (this.players[b.owner]?.mods.building.los ?? 0) });
    // Allies see what each other sees.
    this.fog.forEach((f, i) => f.update(this.players.flatMap((p, j) => (p.team === this.players[i].team ? sources[j] : []))));
  }
}
