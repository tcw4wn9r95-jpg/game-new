// Campaign scenarios: a chapter's starting setup, its objectives and ways to
// lose, scripted invasion waves and story messages. The chapter's data lives
// in campaigns.ts; this file runs it. Everything is driven from the world's
// clock, so it is deterministic and saves with the match.
import type { ResourceKind } from './constants';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit, type UnitType, distToRect } from './entities';
import { relics } from './modes';
import { type TechId, completeTech } from './techs';
import { Feature, Terrain } from './terrain';
import type { World } from './world';

export type Objective =
  /** Keep the marked building (the keep) standing until the clock reaches `seconds`. */
  | { kind: 'survive'; seconds: number; label: string }
  /** The enemy has none of these buildings left. */
  | { kind: 'destroy'; types: BuildingType[]; label: string }
  /** Gathered this much over the chapter (all resources gathered count, not the stockpile). */
  | { kind: 'gather'; amounts: Partial<Record<ResourceKind, number>>; label: string }
  | { kind: 'age'; age: number; label: string }
  | { kind: 'build'; type: BuildingType; count: number; label: string }
  | { kind: 'train'; types: UnitType[]; count: number; label: string }
  /** Relics kept in your Monasteries at once. */
  | { kind: 'relics'; count: number; label: string }
  /** Win the match outright (conquest, or the mode's own victory). */
  | { kind: 'win'; label: string };

export type LoseCondition =
  /** The keep falls. */
  | { kind: 'keep'; label: string }
  /** Every building of this type is gone. */
  | { kind: 'lose'; type: BuildingType; label: string }
  | { kind: 'villagers'; below: number; label: string }
  /** The objectives must be met before this time. */
  | { kind: 'timeout'; seconds: number; label: string };

export interface Wave {
  at: number;
  units: Partial<Record<UnitType, number>>;
  /** Spawn point index (see spawns), or -1 for all of them, split. */
  from?: number;
  text?: string;
  /** Technologies the invaders have from this wave on. */
  techs?: TechId[];
  /** Raiders go for the villagers in the fields rather than the buildings. */
  raid?: boolean;
}

export interface Plan {
  objectives: Objective[];
  lose: LoseCondition[];
  waves: Wave[];
  messages: Array<{ at: number; text: string }>;
}

type Setup = {
  resources?: Partial<Record<ResourceKind, number>>;
  /** Age to start in (0-3). */
  age?: number;
  techs?: TechId[];
  units?: Array<[UnitType, number]>;
  buildings?: Array<[BuildingType, number]>;
};

export interface ScenarioDef {
  id: string;
  campaign: string;
  title: string;
  /** "About 15 minutes". */
  length: string;
  /** Briefing paragraphs (HTML allowed). */
  briefing: string[];
  map: { type: 'heartland' | 'coastal' | 'lakes' | 'islands'; size: 'skirmish' | 'standard' | 'epic'; seed: number };
  mode?: 'standard' | 'regicide' | 'domination';
  factions: [string, string];
  player: Setup & {
    /** A building placed beside the Town Center that must survive (the keep). */
    keep?: BuildingType;
  };
  /** 'ai': a full opponent; 'horde': only the scripted waves; 'none': no enemy at all. */
  enemy: (Setup & { kind: 'ai'; difficulty: 'easy' | 'normal' | 'hard' }) | { kind: 'horde' | 'none' };
  /** Options the player picks before starting (the length of a siege, say). */
  variants?: Array<{ id: string; label: string; note?: string }>;
  plan: (variant: string) => Plan;
}

export interface ScenarioState {
  id: string;
  variant: string;
  /** Next wave and message to come. */
  wave: number;
  msg: number;
  /** The building to keep standing (0 if none). */
  keep: number;
  spawns: Array<{ x: number; y: number }>;
  /** Why the chapter was lost, or that it was won (for the end screen). */
  outcome: string | null;
  /** Gathered totals when the chapter began (gather goals count from here). */
  gathered0: Record<ResourceKind, number>;
  /** Kinds of building the player has had at some point (to tell "lost" from "never had"). */
  had: string[];
  /** The enemy is only waves (or nobody): never "conquered" between waves. */
  noConquest: boolean;
  /** Invaders that hunt villagers. */
  raiders: number[];
}

/** Every chapter, by id (filled in by campaigns.ts). */
export const SCENARIOS = new Map<string, ScenarioDef>();
export const registerScenarios = (defs: ScenarioDef[]) => defs.forEach((d) => SCENARIOS.set(d.id, d));

const ME = 0, FOE = 1;
const planCache = new Map<string, Plan>();
export function planOf(st: ScenarioState): Plan {
  const key = `${st.id}|${st.variant}`;
  let p = planCache.get(key);
  if (!p) {
    p = SCENARIOS.get(st.id)!.plan(st.variant);
    planCache.set(key, p);
  }
  return p;
}

// ---------- setup ----------

/** Applies a chapter's starting setup to a freshly made world. */
export function setupScenario(w: World, def: ScenarioDef, variant: string): void {
  const st: ScenarioState = {
    id: def.id,
    variant,
    wave: 0,
    msg: 0,
    keep: 0,
    spawns: [],
    outcome: null,
    gathered0: { ...w.players[ME].gathered },
    had: [],
    noConquest: def.enemy.kind !== 'ai',
    raiders: [],
  };
  w.scenario = st;
  applySetup(w, ME, def.player);
  if (def.player.keep) {
    const keep = placeNear(w, ME, def.player.keep, 5, 12);
    if (keep) st.keep = keep.id;
  }
  if (def.enemy.kind === 'ai') applySetup(w, FOE, def.enemy);
  else {
    // No town on the other side: the enemy is only what the script sends.
    for (const e of [...w.entities.values()]) if (e.kind !== 'resource' && e.owner === FOE) w.remove(e.id);
    st.spawns = spawnPoints(w);
  }
  w.updatePopulation();
}

function applySetup(w: World, owner: number, s: Setup): void {
  const p = w.players[owner];
  if (s.resources) Object.assign(p.resources, s.resources);
  for (let a = 1; a <= (s.age ?? 0); a++) completeTech(w, owner, (['age2', 'age3', 'age4'] as TechId[])[a - 1]);
  for (const t of s.techs ?? []) completeTech(w, owner, t);
  for (const [type, n] of s.buildings ?? []) for (let k = 0; k < n; k++) placeNear(w, owner, type, 4, BUILDING_DEFS[type].shore ? 40 : 16);
  const tc = townCenter(w, owner);
  const sx = tc ? tc.x + tc.size / 2 : w.map.starts[owner].x, sy = tc ? tc.y + tc.size + 1 : w.map.starts[owner].y + 2;
  for (const [type, n] of s.units ?? [])
    for (let k = 0; k < n; k++) {
      const spot = w.grid.nearestWalkable(sx + ((k % 6) - 2.5) * 0.9, sy + Math.floor(k / 6) * 0.9, -1, 12, owner);
      if (spot) w.spawnUnit(type, owner, spot.x + 0.5, spot.y + 0.5);
    }
}

const townCenter = (w: World, owner: number): Building | undefined => [...w.buildings(owner)].find((b) => b.type === 'town_center');

/** A finished building on open ground near the owner's Town Center, in rings outward. */
function placeNear(w: World, owner: number, type: BuildingType, minR: number, maxR: number): Building | null {
  const tc = townCenter(w, owner);
  const c = tc ? { x: tc.x + 1, y: tc.y + 1 } : w.map.starts[owner];
  const size = BUILDING_DEFS[type].size;
  const N = w.map.size;
  if (BUILDING_DEFS[type].shore) {
    // Shore spots are a thin strip: look at every tile in reach, nearest first.
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let y = Math.floor(c.y - maxR); y <= c.y + maxR; y++)
      for (let x = Math.floor(c.x - maxR); x <= c.x + maxR; x++) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < minR || d > maxR || d >= bd) continue;
        if (fits(w, x, y, size, true) && w.besideWater(x, y, size) && onIsland(w, owner, x, y)) (bd = d), (best = { x, y });
      }
    return best ? w.placeBuilding(type, owner, best.x, best.y, true) : null;
  }
  // Toward the middle of the map first: that's where trouble comes from.
  const toward = Math.atan2(N / 2 - c.y, N / 2 - c.x);
  for (let r = minR; r <= maxR; r++)
    for (let k = 0; k < 24; k++) {
      const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
      const x = Math.round(c.x + Math.cos(a) * r - size / 2), y = Math.round(c.y + Math.sin(a) * r - size / 2);
      if (fits(w, x, y, size)) return w.placeBuilding(type, owner, x, y, true);
    }
  return null;
}

/** Open, dry land with a one-tile clear margin (so nothing walls itself in); on the shore, water may border it. */
function fits(w: World, x: number, y: number, size: number, shore = false): boolean {
  const { map, grid } = w;
  for (let ty = y - 1; ty <= y + size; ty++)
    for (let tx = x - 1; tx <= x + size; tx++) {
      if (!grid.inside(tx, ty)) return false;
      const i = ty * map.size + tx;
      const rim = tx < x || ty < y || tx >= x + size || ty >= y + size;
      const wet = map.terrain[i] === Terrain.Deep || map.terrain[i] === Terrain.Shallow;
      if (grid.building[i] || map.feature[i] !== Feature.None) return false;
      if (wet && !(shore && rim)) return false;
    }
  return true;
}

/** On the same landmass as the owner's Town Center (a Dock for another island is no use). */
function onIsland(w: World, owner: number, x: number, y: number): boolean {
  const tc = townCenter(w, owner);
  if (!tc) return true;
  const home = w.grid.component(tc.x + 1, tc.y + tc.size, owner);
  for (let ty = y - 1; ty <= y + 3; ty++) for (let tx = x - 1; tx <= x + 3; tx++) if (w.grid.isWalkable(tx, ty, owner) && w.grid.component(tx, ty, owner) === home) return true;
  return false;
}

/** Where invaders come from: the empty enemy start and two far edges of the map, all reachable on foot. */
function spawnPoints(w: World): Array<{ x: number; y: number }> {
  const N = w.map.size;
  const home = w.map.starts[ME];
  const region = w.grid.component(home.x + 2, home.y + 3, FOE);
  const ok = (x: number, y: number) => w.grid.isWalkable(x, y, FOE) && w.grid.component(x, y, FOE) === region;
  const out: Array<{ x: number; y: number }> = [];
  const foe = w.map.starts[FOE];
  if (foe) {
    const s = w.grid.nearestWalkable(foe.x + 0.5, foe.y + 0.5, region, 12, FOE);
    if (s) out.push(s);
  }
  const edge: Array<{ x: number; y: number; d: number }> = [];
  for (let k = 0; k < 96; k++) {
    const t = (k / 96) * 4, m = 4;
    const p = t < 1 ? { x: m + t * (N - 2 * m), y: m } : t < 2 ? { x: N - m, y: m + (t - 1) * (N - 2 * m) } : t < 3 ? { x: N - m - (t - 2) * (N - 2 * m), y: N - m } : { x: m, y: N - m - (t - 3) * (N - 2 * m) };
    const x = Math.round(p.x), y = Math.round(p.y);
    if (ok(x, y)) edge.push({ x, y, d: Math.hypot(x - home.x, y - home.y) });
  }
  edge.sort((a, b) => b.d - a.d);
  for (const e of edge) {
    if (out.length >= 3) break;
    if (e.d < N * 0.45) break;
    if (out.some((o) => Math.hypot(o.x - e.x, o.y - e.y) < N / 3)) continue;
    out.push({ x: e.x, y: e.y });
  }
  if (!out.length) out.push({ x: N - home.x, y: N - home.y });
  return out;
}

// ---------- per second ----------

export function scenarioTick(w: World): void {
  const st = w.scenario;
  if (!st || w.winner !== null) return;
  const def = SCENARIOS.get(st.id);
  if (!def) return;
  const plan = planOf(st);
  const t = w.time;
  // Story beats.
  while (st.msg < plan.messages.length && plan.messages[st.msg].at <= t) {
    w.events.push({ type: 'scenario', owner: ME, text: plan.messages[st.msg].text });
    st.msg++;
  }
  // Invasion waves.
  while (st.wave < plan.waves.length && plan.waves[st.wave].at <= t) {
    spawnWave(w, st, plan.waves[st.wave]);
    st.wave++;
  }
  if (def.enemy.kind === 'horde' && w.tick % 20 === 0) hordeThink(w, st);
  for (const b of w.buildings(ME)) if (b.complete && !st.had.includes(b.type)) st.had.push(b.type);
  // Ways to lose.
  for (const l of plan.lose) {
    const lost =
      l.kind === 'keep'
        ? st.keep > 0 && !w.building(st.keep)
        : l.kind === 'lose'
          ? st.had.includes(l.type) && ![...w.buildings(ME)].some((b) => b.type === l.type)
          : l.kind === 'timeout'
            ? t >= l.seconds
            : [...w.units(ME)].filter((u) => UNIT_DEFS[u.type].gatherer && !UNIT_DEFS[u.type].naval).length < l.below;
    if (lost) {
      st.outcome = l.label;
      w.declareWinner(w.players[FOE].team, 'objectives');
      return;
    }
  }
  // Objectives: all of them (but "win" is left to the match's own victory).
  const goals = plan.objectives.filter((o) => o.kind !== 'win');
  if (goals.length && goals.every((o) => objectiveDone(w, st, o))) {
    st.outcome = 'All objectives complete';
    w.declareWinner(w.players[ME].team, 'objectives');
  }
}

export function objectiveDone(w: World, st: ScenarioState, o: Objective): boolean {
  const p = w.players[ME];
  switch (o.kind) {
    case 'survive':
      return w.time >= o.seconds && (st.keep === 0 || !!w.building(st.keep));
    case 'destroy':
      return ![...w.buildings()].some((b) => w.isEnemy(ME, b.owner) && o.types.includes(b.type));
    case 'gather':
      return Object.entries(o.amounts).every(([k, v]) => p.gathered[k as ResourceKind] - st.gathered0[k as ResourceKind] >= (v ?? 0));
    case 'age':
      return p.age >= o.age;
    case 'build':
      return [...w.buildings(ME)].filter((b) => b.type === o.type && b.complete).length >= o.count;
    case 'train':
      return [...w.units(ME)].filter((u) => o.types.includes(u.type)).length >= o.count;
    case 'relics': {
      let n = 0;
      for (const r of relics(w)) if (r.holder && w.building(r.holder)?.owner === ME) n++;
      return n >= o.count;
    }
    case 'win':
      return w.winner === p.team;
  }
}

/** "12:30 left", "3 of 5"... for the objectives card. */
export function objectiveProgress(w: World, st: ScenarioState, o: Objective): string {
  const p = w.players[ME];
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  switch (o.kind) {
    case 'survive':
      return w.time >= o.seconds ? 'held' : `${clock(o.seconds - w.time)} to go`;
    case 'gather':
      return Object.entries(o.amounts)
        .map(([k, v]) => `${Math.min(v ?? 0, Math.floor(p.gathered[k as ResourceKind] - st.gathered0[k as ResourceKind]))}/${v} ${k}`)
        .join(' · ');
    case 'build':
      return `${Math.min(o.count, [...w.buildings(ME)].filter((b) => b.type === o.type && b.complete).length)} of ${o.count}`;
    case 'train':
      return `${Math.min(o.count, [...w.units(ME)].filter((u) => o.types.includes(u.type)).length)} of ${o.count}`;
    case 'relics': {
      let n = 0;
      for (const r of relics(w)) if (r.holder && w.building(r.holder)?.owner === ME) n++;
      return `${n} of ${o.count}`;
    }
    case 'destroy':
      return `${[...w.buildings()].filter((b) => w.isEnemy(ME, b.owner) && o.types.includes(b.type)).length} left`;
    default:
      return '';
  }
}

/** Seconds to the next wave (or null when none are left). */
export function nextWaveIn(w: World): number | null {
  const st = w.scenario;
  if (!st) return null;
  const plan = planOf(st);
  const next = plan.waves[st.wave];
  return next ? Math.max(0, next.at - w.time) : null;
}

// ---------- the horde ----------

/** Most invaders on the field at once (later waves wait for room). */
const HORDE_CAP = 140;

function spawnWave(w: World, st: ScenarioState, wave: Wave): void {
  for (const t of wave.techs ?? []) completeTech(w, FOE, t);
  const on = [...w.units(FOE)].length;
  let room = HORDE_CAP - on;
  const points = wave.from === undefined || wave.from < 0 ? st.spawns : [st.spawns[wave.from % st.spawns.length]];
  let k = 0;
  for (const [type, n] of Object.entries(wave.units) as Array<[UnitType, number]>)
    for (let i = 0; i < n && room > 0; i++, k++, room--) {
      const sp = points[k % points.length];
      const spot = w.grid.nearestWalkable(sp.x + ((k % 5) - 2) * 0.8, sp.y + ((Math.floor(k / 5) % 5) - 2) * 0.8, -1, 8, FOE);
      if (!spot) continue;
      const u = w.spawnUnit(type, FOE, spot.x + 0.5, spot.y + 0.5);
      u.stance = 'aggressive';
      if (wave.raid) st.raiders.push(u.id);
    }
  if (wave.text) w.events.push({ type: 'scenario', owner: ME, text: wave.text, alarm: true, x: points[0].x, y: points[0].y });
  hordeThink(w, st);
}

/**
 * Invaders with nothing to do march on the keep (or the nearest building of
 * the player's). Walled out, they batter the nearest wall or gate instead.
 */
function hordeThink(w: World, st: ScenarioState): void {
  const keep = st.keep ? w.building(st.keep) : undefined;
  const mine = [...w.buildings(ME)];
  if (!mine.length) return;
  const groups = new Map<number, number[]>();
  st.raiders = st.raiders.filter((id) => w.unit(id));
  const villagers = [...w.field(ME)].filter((u) => UNIT_DEFS[u.type].gatherer && !UNIT_DEFS[u.type].naval);
  for (const u of w.field(FOE)) {
    if (u.order) continue;
    if (st.raiders.includes(u.id) && villagers.length) {
      // Raiders hunt the nearest villager outside the walls.
      let prey = villagers[0], pd = Infinity;
      for (const v of villagers) {
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d < pd) (pd = d), (prey = v);
      }
      w.issue(FOE, { type: 'attack', ids: [u.id], id: prey.id });
      continue;
    }
    const goal = keep ?? nearest(mine.filter((b) => !BUILDING_DEFS[b.type].wall), u) ?? nearest(mine, u)!;
    const target = reaches(w, u, goal) ? goal : (nearest(mine.filter((b) => BUILDING_DEFS[b.type].wall), u) ?? goal);
    const list = groups.get(target.id) ?? [];
    list.push(u.id);
    groups.set(target.id, list);
  }
  for (const [id, ids] of groups) w.issue(FOE, { type: 'attack', ids, id });
}

const nearest = (bs: Building[], u: Unit): Building | undefined => {
  let best: Building | undefined, bd = Infinity;
  for (const b of bs) {
    const d = distToRect(u.x, u.y, b.x, b.y, b.size);
    if (d < bd) (bd = d), (best = b);
  }
  return best;
};

/** Is there ground beside the building in the unit's region (no wall in the way)? */
function reaches(w: World, u: Unit, b: Building): boolean {
  const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), u.owner);
  if (region < 0 || UNIT_DEFS[u.type].range >= 6) return true;
  for (let ty = b.y - 1; ty <= b.y + b.size; ty++)
    for (let tx = b.x - 1; tx <= b.x + b.size; tx++) if (w.grid.isWalkable(tx, ty, u.owner) && w.grid.component(tx, ty, u.owner) === region) return true;
  return false;
}

