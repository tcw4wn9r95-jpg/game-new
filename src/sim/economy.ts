// Villager economy: walking to resources, gathering, carrying to the nearest valid
// drop-off and resuming; building foundations; and what to do when work runs out.
import economy from '../data/economy.json';
import { DT, type ResourceKind } from './constants';
import {
  BUILDING_DEFS,
  type Building,
  type GatherTarget,
  type Order,
  UNIT_DEFS,
  type Unit,
  distToRect,
  isShip,
  navOf,
} from './entities';
import { garrisonThink, repairThink } from './fortify';
import { buildingCost, buildingMaxHp, unitStats } from './techs';
import { boardThink, readyToMove } from './siege';
import { ferryThink, landingGoal, unloadThink } from './naval';
import { relicGoal, relicThink } from './modes';
import type { Goal } from './pathfinding';
import { Feature } from './terrain';
import type { World } from './world';

/** Carry capacity: villagers' grows with Wheelbarrow and Hand Cart; fishing ships hold their own amount. */
const capacity = (w: World, u: Unit) => UNIT_DEFS[u.type].carry ?? economy.carryCapacity + (w.players[u.owner]?.mods.carry ?? 0);
/** How close (tiles, centre to target edge) a unit must be to work a tile or building. */
const REACH = 1.05;
/** Reach for point targets such as animals and fish. */
const REACH_POINT = 1.5;
/** Path searches that fail to reach the target before an order is abandoned. */
const MAX_REPATHS = 4;

/** Gather source names: tile features and resource entities. */
export type Source = 'tree' | 'gold' | 'stone' | 'berries' | 'sheep' | 'deer' | 'fish' | 'farm' | 'fish_trap';

const FEATURE_SOURCE: Record<number, Source | undefined> = {
  [Feature.Tree]: 'tree',
  [Feature.Gold]: 'gold',
  [Feature.Stone]: 'stone',
  [Feature.Berries]: 'berries',
};
const SOURCE_FEATURE: Partial<Record<Source, number>> = { tree: Feature.Tree, gold: Feature.Gold, stone: Feature.Stone, berries: Feature.Berries };

export const SOURCE_RESOURCE: Record<Source, ResourceKind> = {
  tree: 'wood',
  gold: 'gold',
  stone: 'stone',
  berries: 'food',
  sheep: 'food',
  deer: 'food',
  fish: 'food',
  farm: 'food',
  fish_trap: 'food',
};

const RATE_KEY: Record<Source, keyof typeof economy.gatherRates> = {
  tree: 'wood',
  gold: 'gold',
  stone: 'stone',
  berries: 'berries',
  sheep: 'sheep',
  deer: 'deer',
  fish: 'fish',
  farm: 'farm',
  fish_trap: 'fishTrap',
};

/** What a drop-off building's completion sends its builders to gather. */
const CAMP_SOURCES: Partial<Record<string, Source[]>> = {
  lumber_camp: ['tree'],
  mining_camp: ['gold', 'stone'],
  mill: ['berries'],
  farm: ['farm'],
  dock: ['fish'],
};

interface ResolvedTarget {
  x: number;
  y: number;
  /** 1 for a tile target, 0 for a point target, the footprint for a farm. */
  size: number;
  amount: number;
  /** Farms are worked from inside the field. */
  inside?: boolean;
}

/** Farms and fish traps: worked from inside, replanted or restocked when they run out. */
const isFarm = (e: { kind: string; type?: string } | undefined): e is Building => e?.kind === 'building' && (e.type === 'farm' || e.type === 'fish_trap');
const fieldSource = (b: Building): Source => (b.type === 'fish_trap' ? 'fish_trap' : 'farm');

/** Source of a gather target, or null if it is gone or empty. */
export function sourceOf(w: World, t: GatherTarget): Source | null {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    return w.map.amount[i] > 0 ? (FEATURE_SOURCE[w.map.feature[i]] ?? null) : null;
  }
  const e = w.get(t.id);
  if (isFarm(e)) return e.complete && e.amount > 0 ? fieldSource(e) : null;
  return e?.kind === 'resource' && e.amount > 0 && e.type !== 'relic' ? e.type : null;
}

function resolve(w: World, t: GatherTarget): ResolvedTarget | null {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    if (w.map.feature[i] === Feature.None || w.map.amount[i] <= 0) return null;
    return { x: t.x, y: t.y, size: 1, amount: w.map.amount[i] };
  }
  const e = w.get(t.id);
  if (isFarm(e)) return e.complete && e.amount > 0 ? { x: e.x, y: e.y, size: e.size, amount: e.amount, inside: true } : null;
  if (e?.kind !== 'resource' || e.amount <= 0) return null;
  return { x: e.x, y: e.y, size: 0, amount: e.amount };
}

/** Standing on a tile touching the target (the same rule paths aim for), or close enough by distance. */
function inReach(u: Unit, t: { x: number; y: number; size: number; inside?: boolean }): boolean {
  // Farmers work from well inside their field.
  if (t.inside) return u.x > t.x + 0.6 && u.x < t.x + t.size - 0.6 && u.y > t.y + 0.6 && u.y < t.y + t.size - 0.6;
  if (t.size === 0) return touches(u, Math.floor(t.x), Math.floor(t.y), 1) || Math.hypot(u.x - t.x, u.y - t.y) <= REACH_POINT;
  return touches(u, t.x, t.y, t.size) || distToRect(u.x, u.y, t.x, t.y, t.size) <= REACH;
}

function touches(u: Unit, x: number, y: number, size: number): boolean {
  const tx = Math.floor(u.x), ty = Math.floor(u.y);
  return tx >= x - 1 && tx <= x + size && ty >= y - 1 && ty <= y + size;
}

/** Takes one unit of resource from a target. Depleted tiles become walkable ground. */
function takeOne(w: World, t: GatherTarget): boolean {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    if (w.map.amount[i] <= 0) return false;
    w.map.amount[i]--;
    if (w.map.amount[i] === 0) {
      w.map.feature[i] = Feature.None;
      w.grid.refresh(i);
    }
    return true;
  }
  const e = w.get(t.id);
  if (isFarm(e)) {
    if (e.amount <= 0) return false;
    e.amount--;
    if (e.amount <= 0) reseed(w, e);
    return true;
  }
  if (e?.kind !== 'resource' || e.amount <= 0) return false;
  e.amount--;
  if (e.amount <= 0) w.remove(e.id);
  return true;
}

/** A harvested-out farm is replanted for its wood cost if auto-reseed is on, otherwise it goes fallow and disappears. */
function reseed(w: World, farm: Building): void {
  const p = w.players[farm.owner];
  const def = BUILDING_DEFS[farm.type];
  const wood = buildingCost(w, farm.owner, farm.type).wood ?? 0;
  if (p.autoReseed && p.resources.wood >= wood) {
    p.resources.wood -= wood;
    farm.amount = (def.food ?? 0) + (w.players[farm.owner]?.mods.farmFood ?? 0);
  } else {
    if (p.autoReseed)
      w.events.push({ type: 'error', owner: farm.owner, message: farm.type === 'farm' ? 'A farm ran out: not enough wood to replant' : 'A fish trap ran out: not enough wood to restock' });
    w.remove(farm.id);
  }
}

/**
 * Another villager has this farm: one already working it wins, otherwise the
 * earlier villager (lower id) keeps its claim, so two can never both give way.
 */
function farmTaken(w: World, farmId: number, except: Unit): boolean {
  for (const o of w.units(except.owner)) {
    if (o === except || o.order?.type !== 'gather' || o.order.target.kind !== 'entity' || o.order.target.id !== farmId) continue;
    if (except.state === 'gather' && o.state !== 'gather') continue;
    if (o.state === 'gather' || o.id < except.id) return true;
  }
  return false;
}

/** True if some walkable tile next to (x, y) lies in the unit's region. */
function accessible(w: World, u: Unit, x: number, y: number): boolean {
  const nav = navOf(u);
  const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), nav);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
      if (w.grid.isWalkable(tx, ty, nav) && (region < 0 || w.grid.component(tx, ty, nav) === region)) return true;
    }
  return false;
}

/** Nearest reachable target of one of these sources around (cx, cy), excluding `skip`. */
export function findResource(
  w: World,
  u: Unit,
  sources: Source[],
  cx: number,
  cy: number,
  radius = economy.searchRadius,
  skip?: GatherTarget,
): GatherTarget | null {
  let best: GatherTarget | null = null;
  let bd = Infinity;
  const features = sources.map((s) => SOURCE_FEATURE[s]).filter((f): f is number => f !== undefined);
  if (features.length) {
    const N = w.map.size;
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(N - 1, Math.floor(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(N - 1, Math.floor(cy + radius));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        if (!features.includes(w.map.feature[i]) || w.map.amount[i] <= 0) continue;
        if (skip?.kind === 'tile' && skip.x === x && skip.y === y) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > radius || d >= bd || !accessible(w, u, x, y)) continue;
        bd = d;
        best = { kind: 'tile', x, y };
      }
  }
  if (sources.includes('farm') || sources.includes('fish_trap'))
    for (const b of w.buildings(u.owner)) {
      if (!isFarm(b) || !sources.includes(fieldSource(b)) || !b.complete || b.amount <= 0 || farmTaken(w, b.id, u)) continue;
      if (skip?.kind === 'entity' && skip.id === b.id) continue;
      const d = Math.hypot(b.x + b.size / 2 - cx, b.y + b.size / 2 - cy);
      if (d > radius || d >= bd) continue;
      bd = d;
      best = { kind: 'entity', id: b.id };
    }
  for (const r of w.resources()) {
    if (r.type === 'relic' || !sources.includes(r.type) || r.amount <= 0) continue;
    if (skip?.kind === 'entity' && skip.id === r.id) continue;
    const d = Math.hypot(r.x - cx, r.y - cy);
    if (d > radius || d >= bd || !accessible(w, u, r.x, r.y)) continue;
    bd = d;
    best = { kind: 'entity', id: r.id };
  }
  return best;
}

/** Nearest complete drop-off of the unit's owner that accepts this resource (ships unload only at docks). */
export function findDropoff(w: World, u: Unit, res: ResourceKind): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  const ship = isShip(u);
  for (const b of w.buildings(u.owner)) {
    if (!b.complete || !(BUILDING_DEFS[b.type].dropoff as string[]).includes(res)) continue;
    if (ship && !BUILDING_DEFS[b.type].shore) continue;
    const d = distToRect(u.x, u.y, b.x, b.y, b.size);
    if (d < bd) (bd = d), (best = b);
  }
  return best;
}

export function gatherOrder(w: World, t: GatherTarget): Order | null {
  const source = sourceOf(w, t);
  return source ? { type: 'gather', target: t, res: SOURCE_RESOURCE[source], source } : null;
}

/** Sets a new order and resets per-order movement state. */
export function setOrder(u: Unit, order: Order | null): void {
  u.order = order;
  u.path = null;
  u.pathPending = false;
  u.repaths = 0;
  u.flow = null;
  u.faith = 0;
}

function walkTo(w: World, u: Unit): void {
  u.state = 'walk';
  if (u.path || u.pathPending) return;
  // Paths keep ending short of the target (crowding, odd geometry): treat it as unreachable.
  if (u.repaths > MAX_REPATHS * 2) return unreachable(w, u);
  w.requestPath(u);
}

// ---------- per-tick behaviour ----------

export function think(w: World, u: Unit): void {
  if (u.ferry) ferryThink(w, u);
  const o = u.order;
  if (!o) {
    u.state = 'idle';
    return;
  }
  switch (o.type) {
    case 'move':
      if (!readyToMove(u)) return;
      if (u.flow) {
        u.state = 'walk';
        return;
      }
      if (!u.path && !u.pathPending && Math.hypot(u.x - o.x, u.y - o.y) < 0.6) {
        setOrder(u, null);
        u.state = 'idle';
        u.guard = { x: u.x, y: u.y };
      } else walkTo(w, u);
      return;
    case 'attack':
    case 'heal':
    case 'convert':
      return; // handled by combat
    case 'garrison': {
      const carrier = w.unit(o.id);
      if (carrier) return boardThink(w, u, carrier, () => walkTo(w, u));
      return garrisonThink(w, u, o, inReach, () => walkTo(w, u));
    }
    case 'attackGround':
      return; // handled by combat
    case 'repair':
      return repairThink(w, u, o, inReach, () => walkTo(w, u));
    case 'unload':
      return unloadThink(w, u, o, () => walkTo(w, u));
    case 'relic':
      return relicThink(w, u, o, () => walkTo(w, u));
    case 'gather':
      return gather(w, u, o);
    case 'dropoff':
      return dropoff(w, u, o);
    case 'build':
      return build(w, u, o);
  }
}

function gather(w: World, u: Unit, o: Extract<Order, { type: 'gather' }>): void {
  if (u.carry && u.carry.res !== o.res) u.carry = null; // switching jobs drops the load
  const cap = capacity(w, u);
  if (u.carry && u.carry.amount >= cap) return goDropoff(w, u, o);

  let t = resolve(w, o.target);
  if (t?.inside && o.target.kind === 'entity' && farmTaken(w, o.target.id, u)) {
    // Someone else is farming here: find a free field nearby.
    const next = findResource(w, u, ['farm'], t.x + 1.5, t.y + 1.5, economy.searchRadius, o.target);
    if (!next) return finishWork(w, u);
    o.target = next;
    u.path = null;
    t = resolve(w, next);
  }
  if (!t) {
    const old = o.target;
    const ox = old.kind === 'tile' ? old.x + 0.5 : u.x, oy = old.kind === 'tile' ? old.y + 0.5 : u.y;
    if (o.source === 'farm') return finishWork(w, u); // the field is gone; don't wander to another one
    // Woodcutters and miners walk on to the next stand or seam; foragers stay close.
    const meat = o.source === 'sheep' || o.source === 'deer';
    const reach = o.source === 'tree' ? 20 : o.source === 'gold' || o.source === 'stone' || meat ? 16 : economy.searchRadius;
    // Shepherds who run out of sheep go hunting.
    const next = findResource(w, u, meat ? ['sheep', 'deer'] : [o.source as Source], ox, oy, reach);
    if (!next) return finishWork(w, u);
    o.target = next;
    u.path = null;
    u.repaths = 0;
    t = resolve(w, next)!;
  }

  if (!inReach(u, t)) return walkTo(w, u);
  u.path = null;
  u.state = 'gather';
  u.repaths = 0;
  if (t.x + t.size / 2 !== u.x) u.face = t.x + t.size / 2 > u.x ? 1 : -1;
  const p = w.players[u.owner];
  u.gatherAcc += economy.gatherRates[RATE_KEY[o.source as Source]] * (p?.mods.gather[o.source] ?? 1) * (p?.gatherBonus ?? 1) * DT;
  while (u.gatherAcc >= 1) {
    u.gatherAcc -= 1;
    if (!takeOne(w, o.target)) break;
    if (!u.carry) u.carry = { res: o.res, amount: 0 };
    u.carry.amount++;
    if (u.carry.amount >= cap) break;
  }
}

function goDropoff(w: World, u: Unit, resume: Order | null): void {
  const b = u.carry && findDropoff(w, u, u.carry.res);
  if (!b) {
    // Nowhere to unload: wait here with the load.
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  u.resume = resume;
  setOrder(u, { type: 'dropoff', id: b.id });
  walkTo(w, u);
}

function dropoff(w: World, u: Unit, o: Extract<Order, { type: 'dropoff' }>): void {
  if (!u.carry) {
    const next = u.resume;
    u.resume = null;
    return setOrder(u, next);
  }
  let b = w.building(o.id);
  if (!b || !b.complete || b.owner !== u.owner || !(BUILDING_DEFS[b.type].dropoff as string[]).includes(u.carry.res)) {
    b = findDropoff(w, u, u.carry.res) ?? undefined;
    if (!b) return finishWork(w, u);
    o.id = b.id;
    u.path = null;
  }
  if (!inReach(u, b)) return walkTo(w, u);
  const p = w.players[u.owner];
  p.resources[u.carry.res] += u.carry.amount;
  p.gathered[u.carry.res] += u.carry.amount;
  w.events.push({ type: 'dropoff', owner: u.owner, x: u.x, y: u.y, res: u.carry.res, amount: u.carry.amount });
  u.carry = null;
  const next = u.resume;
  u.resume = null;
  setOrder(u, next);
}

function build(w: World, u: Unit, o: Extract<Order, { type: 'build' }>): void {
  const b = w.building(o.id);
  if (!b || b.owner !== u.owner) return finishWork(w, u);
  if (b.complete) return afterBuild(w, u, b);
  if (!inReach(u, b)) return walkTo(w, u);
  u.path = null;
  u.repaths = 0;
  u.state = 'build';
  u.face = b.x + b.size / 2 > u.x ? 1 : -1;
  w.builders.set(b.id, (w.builders.get(b.id) ?? 0) + 1);
}

/** After finishing a building: work the camp's resource, help another foundation, or idle. */
function afterBuild(w: World, u: Unit, b: Building): void {
  const sources = CAMP_SOURCES[b.type];
  const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
  if (isFarm(b) && !farmTaken(w, b.id, u)) {
    const order = gatherOrder(w, { kind: 'entity', id: b.id });
    if (order) return setOrder(u, order);
  }
  if (sources && !isFarm(b)) {
    const t = findResource(w, u, sources, cx, cy, 8);
    const order = t && gatherOrder(w, t);
    if (order) return setOrder(u, order);
  }
  let next: Building | null = null;
  let bd = 10;
  for (const f of w.buildings(u.owner)) {
    if (f.complete || !canBuild(u, f.type)) continue;
    const d = distToRect(cx, cy, f.x, f.y, f.size);
    if (d < bd) (bd = d), (next = f);
  }
  setOrder(u, next ? { type: 'build', id: next.id } : null);
}

/** No more work for this order: unload anything carried, then stand idle. */
function finishWork(w: World, u: Unit): void {
  if (u.carry && u.carry.amount > 0 && u.order?.type !== 'dropoff') return goDropoff(w, u, null);
  setOrder(u, null);
  u.state = 'idle';
}

// ---------- path goals ----------

/** Where the unit's current order wants it to stand, as a path goal. */
export function goalFor(w: World, u: Unit): Goal | null {
  const o = u.order;
  if (!o) return null;
  switch (o.type) {
    case 'move': {
      let tx = Math.floor(o.x), ty = Math.floor(o.y);
      const nav = navOf(u);
      const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), nav);
      if (!w.grid.isWalkable(tx, ty, nav) || w.grid.component(tx, ty, nav) !== region) {
        const near = w.grid.nearestWalkable(o.x, o.y, region, 24, nav);
        if (!near) return null;
        tx = near.x;
        ty = near.y;
        o.x = tx + 0.5;
        o.y = ty + 0.5;
      }
      return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 0 };
    }
    case 'gather': {
      const t = resolve(w, o.target);
      if (!t) return null;
      // Farmers stand in the middle of their field.
      if (t.inside) return { x0: t.x + 1, y0: t.y + 1, x1: t.x + t.size - 2, y1: t.y + t.size - 2, reach: 0 };
      const tx = Math.floor(t.x), ty = Math.floor(t.y);
      return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 1 };
    }
    case 'attackGround': {
      const spot = firingSpot(w, u, o.x, o.y);
      if (!spot) return null;
      return { x0: spot.x, y0: spot.y, x1: spot.x, y1: spot.y, reach: 0 };
    }
    case 'unload':
      return landingGoal(w, u, o.x, o.y);
    case 'relic':
      return relicGoal(w, u, o);
    case 'garrison': {
      const c = w.unit(o.id);
      if (c && isShip(c)) {
        // Wait on the shore where the transport comes in.
        const at = c.ferry?.pickup ?? c;
        const spot = w.grid.nearestWalkable(at.x, at.y, w.grid.component(Math.floor(u.x), Math.floor(u.y), u.owner), 5, u.owner);
        return spot ? { x0: spot.x, y0: spot.y, x1: spot.x, y1: spot.y, reach: 0 } : null;
      }
      if (c) {
        const tx = Math.floor(c.x), ty = Math.floor(c.y);
        return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 1 };
      }
      const b = w.building(o.id);
      if (!b) return null;
      return { x0: b.x, y0: b.y, x1: b.x + b.size - 1, y1: b.y + b.size - 1, reach: 1 };
    }
    case 'build':
    case 'dropoff':
    case 'repair': {
      const b = w.building(o.id);
      if (!b) return null;
      return { x0: b.x, y0: b.y, x1: b.x + b.size - 1, y1: b.y + b.size - 1, reach: 1 };
    }
    case 'attack':
    case 'heal':
    case 'convert': {
      const t = w.get(o.id);
      if (!t || t.kind === 'resource') return null;
      // Ranged units only need to get within range (over walls, across water).
      if (o.type === 'attack' && unitStats(w, u.owner, u.type).range >= 2) {
        const cx = t.kind === 'building' ? t.x + t.size / 2 : t.x, cy = t.kind === 'building' ? t.y + t.size / 2 : t.y;
        const spot = firingSpot(w, u, cx, cy, t.kind === 'building' ? t.size / 2 : 0);
        if (spot) return { x0: spot.x, y0: spot.y, x1: spot.x, y1: spot.y, reach: 0 };
      }
      if (t.kind === 'building') return { x0: t.x, y0: t.y, x1: t.x + t.size - 1, y1: t.y + t.size - 1, reach: 1 };
      const tx = Math.floor(t.x), ty = Math.floor(t.y);
      return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 1 };
    }
  }
}

/** The order's goal can't be reached: try another target of the same kind, else give up. */
export function unreachable(w: World, u: Unit): void {
  const o = u.order;
  u.repaths++;
  if (o?.type === 'gather' && u.repaths <= MAX_REPATHS) {
    const ox = o.target.kind === 'tile' ? o.target.x + 0.5 : u.x, oy = o.target.kind === 'tile' ? o.target.y + 0.5 : u.y;
    const next = findResource(w, u, [o.source as Source], ox, oy, economy.searchRadius, o.target);
    if (next) {
      o.target = next;
      return;
    }
  }
  if (o?.type === 'dropoff' && u.carry) {
    // Try any other drop-off before giving up.
    const b = findDropoff(w, u, u.carry.res);
    if (b && b.id !== o.id && u.repaths <= MAX_REPATHS) {
      o.id = b.id;
      return;
    }
  }
  finishWork(w, u);
  if (u.order?.type === 'dropoff' && u.repaths > MAX_REPATHS) setOrder(u, null);
}

// ---------- construction ----------

/** Advances foundations by the builders working on them this tick. */
export function constructionTick(w: World): void {
  for (const [id, n] of w.builders) {
    const b = w.building(id);
    if (!b || b.complete) continue;
    const def = BUILDING_DEFS[b.type];
    // Extra builders help with diminishing returns: 1 builder = 1x, 4 builders = 2x.
    const before = b.progress;
    const speed = w.players[b.owner]?.mods.buildSpeed ?? 1;
    b.progress = Math.min(1, b.progress + (DT / def.buildTime) * ((n + 2) / 3) * speed);
    // Grows toward its real maximum (faction bonus, Masonry, tower upgrades), not the base HP,
    // or a new building would stand finished but looking damaged.
    const max = buildingMaxHp(w, b);
    b.hp = Math.min(max, b.hp + (b.progress - before) * max);
    if (b.progress >= 1) {
      b.complete = true;
      w.events.push({ type: 'built', owner: b.owner, id: b.id });
    }
  }
}

export const isGatherer = (u: Unit) => !!UNIT_DEFS[u.type].gatherer;
export const isBuilder = (u: Unit) => !!UNIT_DEFS[u.type].builder;
/** Villagers raise buildings on land; fishing ships the ones on water. */
export const canBuild = (u: Unit, type: keyof typeof BUILDING_DEFS) => isBuilder(u) && !!UNIT_DEFS[u.type].naval === !!BUILDING_DEFS[type].naval;

/**
 * A tile the unit can reach from which a point is within its range: on the
 * line from the point back toward the unit, a little inside maximum range
 * (and outside minimum range), snapped to the unit's own walkable region.
 */
function firingSpot(w: World, u: Unit, x: number, y: number, pad = 0): { x: number; y: number } | null {
  const def = unitStats(w, u.owner, u.type);
  const d = Math.hypot(u.x - x, u.y - y) || 1;
  const want = Math.max((def.minRange ?? 0) + 0.8, Math.min(d, def.range + pad - 0.7));
  const sx = x + ((u.x - x) / d) * want, sy = y + ((u.y - y) / d) * want;
  const nav = navOf(u);
  const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), nav);
  return w.grid.nearestWalkable(sx, sy, region, 6, nav);
}
