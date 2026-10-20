// Combat: attack orders and chasing, stances and target acquisition, melee
// blows and projectiles, counters and armour, monks healing and converting,
// deaths and destroyed buildings. Damage = max(1, attack x counter - armour).
import { DT, TICK_RATE } from './constants';
import { setOrder } from './economy';
import {
  BUILDING_DEFS,
  type Building,
  type Entity,
  type Order,
  type Stance,
  UNIT_DEFS,
  type Unit,
  type UnitClass,
  type UnitDef,
  type UnitType,
  distToRect,
  isShip,
  navOf,
} from './entities';
import { backOff, boltVictims, packTick, setPacked, splash } from './siege';
import { buildingArmor, unitStats } from './techs';
import { canEngage } from './naval';
import type { World } from './world';

/** Contact distance (edge to edge, tiles) for a melee blow. */
const MELEE_REACH = 0.35;
/** How far a defensive unit will be drawn from its guard point. */
const LEASH = 7;
/** Hit radius of an arrow arriving at its aim point. */
const HIT_RADIUS = 0.55;
const HEAL_RATE = 1.6; // hp per second
const HEAL_RANGE = 4;
/** Conversion: guaranteed after this long, possible (per-second chance) after the minimum. */
const CONVERT_MIN_S = 4;
const CONVERT_MAX_S = 10;
const CONVERT_CHANCE = 0.22;
/** Rest after a conversion before the monk can convert again. */
const CONVERT_REST_S = 6;

export interface Projectile {
  id: number;
  /** Shooter's unit type (sets damage and bonuses) and side. */
  from: UnitType;
  owner: number;
  shooter: number;
  target: number;
  sx: number;
  sy: number;
  /** Aim point: where the target stood when the shot was loosed. */
  tx: number;
  ty: number;
  /** Progress 0..1 and per-tick increment. */
  t: number;
  dt: number;
  /** Peak height in tiles, for the arc. */
  arc: number;
  /** Fixed pierce damage (arrows from buildings); otherwise the shooter's stats apply. */
  damage?: number;
  /** Launch height in tiles (arrows from tower tops). */
  height?: number;
  /** Lands as area damage of this radius (stones, boulders). */
  splash?: number;
  /** A bolt that hits every enemy along its line. */
  pierce?: boolean;
}

const isCombatOrder = (o: Order | null): o is Extract<Order, { type: 'attack' | 'heal' | 'convert' | 'attackGround' }> =>
  !!o && (o.type === 'attack' || o.type === 'heal' || o.type === 'convert' || o.type === 'attackGround');

export const isMilitary = (u: Unit) => !UNIT_DEFS[u.type].gatherer;

function classesOf(e: Unit | Building): UnitClass[] {
  return e.kind === 'unit' ? UNIT_DEFS[e.type].classes : BUILDING_DEFS[e.type].classes;
}

/** Damage one blow or arrow does to `target`, from an attacker with stats `a` (after research). */
export function damageOf(a: UnitDef, target: Unit | Building, w?: World): number {
  // Strongest bonus that applies, times the worst penalty (a unit hesitant against pikes, say).
  let up = 1, down = 1;
  for (const c of classesOf(target)) {
    const m = a.bonus[c] ?? 1;
    up = Math.max(up, m);
    down = Math.min(down, m);
  }
  const mult = up * down;
  let melee: number, pierce: number;
  if (target.kind === 'unit') {
    const d = w ? unitStats(w, target.owner, target.type) : UNIT_DEFS[target.type];
    (melee = d.meleeArmor), (pierce = d.pierceArmor);
  } else if (w) ({ melee, pierce } = buildingArmor(w, target));
  else (melee = BUILDING_DEFS[target.type].meleeArmor), (pierce = BUILDING_DEFS[target.type].pierceArmor);
  const armor = a.attackType === 'melee' ? melee : pierce;
  // Counter bonuses multiply the unit's own weapon, not the Blacksmith's improvements to it:
  // otherwise every upgrade would also make counters (spears on horses, arrows on infantry)
  // hit harder still, and late-game matchups turn into one-sided wipes.
  const base = Math.min(a.baseAttack ?? a.attack, a.attack);
  const hit = base * mult + (a.attack - base);
  // Against buildings: Siege Engineers' multiplier and Sappers' flat bonus.
  const vsBuilding = target.kind === 'building' ? (hit + (a.buildingAttack ?? 0)) * (a.buildingMult ?? 1) : hit;
  return Math.max(1, vsBuilding - armor);
}

/** Edge-to-edge distance from a unit to a target. */
function gap(u: Unit, t: Unit | Building): number {
  const r = UNIT_DEFS[u.type].radius;
  if (t.kind === 'building') return Math.max(0, distToRect(u.x, u.y, t.x, t.y, t.size) - r);
  return Math.max(0, Math.hypot(t.x - u.x, t.y - u.y) - r - UNIT_DEFS[t.type].radius);
}

function centre(t: Unit | Building): { x: number; y: number } {
  return t.kind === 'building' ? { x: t.x + t.size / 2, y: t.y + t.size / 2 } : { x: t.x, y: t.y };
}

const hostile = (w: World, a: { owner: number }, b: Entity): b is Unit | Building => b.kind !== 'resource' && w.canFight(a.owner, b.owner);

/** Reach for this unit's attack (tiles, edge to edge). */
function reach(w: World, u: Unit, o: Extract<Order, { type: 'attack' | 'heal' | 'convert' }>): number {
  const def = unitStats(w, u.owner, u.type);
  if (o.type === 'heal') return HEAL_RANGE;
  return def.range > 0 ? def.range : MELEE_REACH;
}

// ---------- per-tick ----------

/**
 * Runs combat for a unit this tick. Returns true when combat owns the unit's
 * behaviour (an attack, heal or conversion is under way), so the economy
 * logic should not run.
 */
export function combatThink(w: World, u: Unit): boolean {
  if (u.cooldown > 0) u.cooldown--;
  if (packTick(u)) return true;
  if (u.order?.type === 'attackGround') return groundThink(w, u, u.order);
  if (!isCombatOrder(u.order)) {
    if (u.order) return false;
    // Idle: look for something to fight, heal or return to post.
    if ((w.tick + u.id) % 3 === 0 || u.attackedAt >= w.tick - 1) acquire(w, u);
    if (!u.order) returnToGuard(u);
    return isCombatOrder(u.order);
  }
  const o = u.order as Extract<Order, { type: 'attack' | 'heal' | 'convert' }>;
  const t = w.get(o.id);
  const valid =
    t &&
    t.kind !== 'resource' &&
    !(UNIT_DEFS[u.type].buildingsOnly && t.kind === 'unit') &&
    !(t.kind === 'unit' && t.inside) &&
    (o.type === 'heal' ? t.kind === 'unit' && t.owner === u.owner && t.hp < unitStats(w, t.owner, t.type).hp : w.canFight(u.owner, t.owner)) &&
    (o.type !== 'convert' || t.kind === 'unit') &&
    // Self-picked targets are dropped once out of sight; ordered ones are followed.
    (!(o.type === 'attack' && o.auto) || t.kind === 'building' || w.fog[u.owner]?.isVisible(t.x, t.y) !== false);
  if (!valid) return endCombat(w, u);
  const target = t as Unit | Building;

  // Leashes: stand-ground units never move; defensive ones break off a long chase.
  if (o.type === 'attack' && o.auto && u.guard) {
    const far = Math.hypot(u.x - u.guard.x, u.y - u.guard.y);
    if ((u.stance === 'defensive' && far > LEASH) || (u.stance === 'stand' && gap(u, target) > reach(w, u, o) + 0.05)) return endCombat(w, u);
  }

  const g = gap(u, target);
  const stats = unitStats(w, u.owner, u.type);
  if (g > reach(w, u, o)) {
    // Out of reach across the water's edge: give up rather than pace the shore.
    if (u.repaths > 3 && o.type === 'attack' && !canEngage(w, u, target, stats.range)) return endCombat(w, u);
    // Trebuchets pack up before they can move.
    if (stats.packs && !u.packed) {
      setPacked(u, true);
      return true;
    }
    chase(w, u, target);
    return true;
  }
  if (stats.minRange && g < stats.minRange) {
    // Too close to fire: back away (stand-ground and packed engines just give up).
    if (o.type === 'attack' && o.auto) return endCombat(w, u);
    const c0 = centre(target);
    backOff(w, u, c0.x, c0.y, stats.minRange);
    return true;
  }
  if (stats.packs && u.packed) {
    u.path = null;
    setPacked(u, false);
    return true;
  }
  // In range: stop and act.
  u.path = null;
  u.flow = null;
  const c = centre(target);
  if (Math.abs(c.x - u.x) > 0.05) u.face = c.x > u.x ? 1 : -1;
  if (o.type === 'heal') return heal(w, u, target as Unit);
  if (o.type === 'convert') return convert(w, u, target as Unit);
  u.state = 'attack';
  if (u.cooldown > 0) return true;
  const def = unitStats(w, u.owner, u.type);
  u.cooldown = Math.round(def.reload * TICK_RATE);
  if (def.range > 0) shoot(w, u, target);
  else if (def.splash) {
    // A petard goes off: the target takes the full blast, everything near it the spread.
    applyDamage(w, target, damageOf(def, target, w), u);
    const c1 = centre(target);
    splash(w, c1.x, c1.y, def.splash, (v) => damageOf(def, v, w) * 0.5, (v, amount) => applyDamage(w, v, amount, null, u.owner), u.id, target.id);
  } else applyDamage(w, target, damageOf(def, target, w), u);
  if (def.selfDestruct && w.get(u.id)) {
    w.events.push({ type: 'blast', x: u.x, y: u.y, size: 1.2 });
    applyDamage(w, u, u.hp, null, u.owner);
  }
  return true;
}

/** Bombarding a spot: in range, set up and fire at it until told otherwise. */
function groundThink(w: World, u: Unit, o: { x: number; y: number }): boolean {
  const def = unitStats(w, u.owner, u.type);
  const d = Math.hypot(o.x - u.x, o.y - u.y);
  if (d > def.range) {
    if (def.packs && !u.packed) return setPacked(u, true), true;
    u.state = 'walk';
    if (!u.path && !u.pathPending) w.requestPath(u);
    return true;
  }
  if (def.minRange && d < def.minRange) {
    backOff(w, u, o.x, o.y, def.minRange);
    return true;
  }
  u.path = null;
  if (def.packs && u.packed) return setPacked(u, false), true;
  u.face = o.x > u.x ? 1 : -1;
  u.state = 'attack';
  if (u.cooldown > 0) return true;
  u.cooldown = Math.round(def.reload * TICK_RATE);
  launch(w, u, 0, o.x, o.y);
  return true;
}

function endCombat(w: World, u: Unit): boolean {
  setOrder(u, null);
  u.state = 'idle';
  // Pick the next fight straight away rather than standing about for a beat.
  acquire(w, u);
  if (!u.order) returnToGuard(u);
  return isCombatOrder(u.order);
}

function returnToGuard(u: Unit): void {
  if (!u.guard) {
    u.guard = { x: u.x, y: u.y };
    return;
  }
  if (u.stance === 'aggressive' || u.stance === 'passive') {
    u.guard = { x: u.x, y: u.y };
    return;
  }
  if (Math.hypot(u.x - u.guard.x, u.y - u.guard.y) > 1.2) setOrder(u, { type: 'move', x: u.guard.x, y: u.guard.y });
}

function chase(w: World, u: Unit, t: Unit | Building): void {
  u.state = 'walk';
  const c = centre(t);
  const d = Math.hypot(c.x - u.x, c.y - u.y);
  // Close and in the open: run straight at it.
  if (t.kind === 'unit' && d < 3 && clearLine(w, u.x, u.y, t.x, t.y, navOf(u))) {
    u.path = [{ x: t.x, y: t.y }];
    u.pathIdx = 0;
    return;
  }
  if (u.pathPending) return;
  // Re-plan when the target has moved well away from where the path leads.
  const end = u.path?.[u.path.length - 1];
  // (Ranged units path to a firing spot at range, so allow for that.)
  const slack = Math.max(1.5, unitStats(w, u.owner, u.type).range + 1);
  const stale = !end || (t.kind === 'unit' && Math.hypot(end.x - t.x, end.y - t.y) > slack && (w.tick + u.id) % 4 === 0);
  if (stale) {
    if (end) u.path = null;
    w.requestPath(u);
  }
}

/** True if a straight walk between two points crosses only walkable tiles. */
function clearLine(w: World, x0: number, y0: number, x1: number, y1: number, player: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    if (!w.grid.isWalkable(Math.floor(x0 + (x1 - x0) * f), Math.floor(y0 + (y1 - y0) * f), player)) return false;
  }
  return true;
}

function heal(w: World, u: Unit, t: Unit): boolean {
  u.state = 'heal';
  const max = unitStats(w, t.owner, t.type).hp;
  t.hp = Math.min(max, t.hp + HEAL_RATE * DT);
  return true;
}

function convert(w: World, u: Unit, t: Unit): boolean {
  if (u.cooldown > 0) {
    u.state = 'idle';
    return true;
  }
  u.state = 'convert';
  u.faith += DT;
  // Each second past the minimum has a chance to succeed; the maximum always does.
  const whole = Math.floor(u.faith) !== Math.floor(u.faith - DT);
  if (u.faith >= CONVERT_MAX_S || (u.faith >= CONVERT_MIN_S && whole && w.rng.next() < CONVERT_CHANCE)) {
    const from = t.owner;
    t.owner = u.owner;
    setOrder(t, null);
    t.state = 'idle';
    t.resume = null;
    t.guard = null;
    t.attackedBy = 0;
    u.faith = 0;
    u.cooldown = CONVERT_REST_S * TICK_RATE;
    w.events.push({ type: 'converted', owner: u.owner, from, id: t.id, x: t.x, y: t.y });
    w.updatePopulation();
    setOrder(u, null);
    u.state = 'idle';
  }
  return true;
}

// ---------- acquisition ----------

/** Finds work for an idle unit according to its stance: retaliate, engage, or heal. */
function acquire(w: World, u: Unit): void {
  const def = unitStats(w, u.owner, u.type);
  if (def.healer) {
    let best: Unit | null = null;
    let bd = Infinity;
    w.spatial.query(u.x, u.y, def.los, (o, d) => {
      if (o.owner !== u.owner || o.id === u.id || o.hp >= unitStats(w, o.owner, o.type).hp) return;
      if (d < bd) (bd = d), (best = o);
    });
    if (best) setOrder(u, { type: 'heal', id: (best as Unit).id, auto: true });
    return;
  }
  if (u.stance === 'passive' || def.attack <= 0) return;
  if (def.buildingsOnly || def.packs) {
    // Rams and petards go for the nearest enemy building they can see; trebuchets for one in range.
    let bb: Building | null = null;
    let bd = def.packs ? def.range : def.los + 2;
    for (const b of w.buildings()) {
      if (!w.canFight(u.owner, b.owner) || !w.fog[u.owner]?.isExplored(b.x + b.size / 2, b.y + b.size / 2)) continue;
      const d = distToRect(u.x, u.y, b.x, b.y, b.size);
      if (d < bd && canEngage(w, u, b, def.range)) (bd = d), (bb = b);
    }
    if (bb) setOrder(u, { type: 'attack', id: (bb as Building).id, auto: true });
    return;
  }
  // Hit back first, if the attacker is still near.
  const radius = u.stance === 'stand' ? (def.range > 0 ? def.range + 0.5 : 1) : u.stance === 'defensive' ? Math.min(def.los, 6) : def.los;
  if (u.attackedAt >= w.tick - TICK_RATE * 2) {
    const a = w.get(u.attackedBy);
    if (a && hostile(w, u, a) && a.kind === 'unit' && Math.hypot(a.x - u.x, a.y - u.y) <= radius + 2) {
      setOrder(u, { type: 'attack', id: a.id, auto: true });
      return;
    }
  }
  const fog = w.fog[u.owner];
  let best: Unit | null = null;
  let bs = Infinity;
  const ship = isShip(u);
  w.spatial.query(u.x, u.y, radius, (o, d) => {
    if (!w.canFight(u.owner, o.owner) || (fog && !fog.isVisible(o.x, o.y))) return;
    if (def.minRange && d < def.minRange + 0.5) return;
    // Across the water's edge only if something can actually be done about it.
    if (isShip(o) !== ship && !canEngage(w, u, o, def.range)) return;
    // Prefer armed enemies and those we counter; villagers last.
    const threat = UNIT_DEFS[o.type].gatherer ? 3 : 0;
    const counter = (def.bonus[UNIT_DEFS[o.type].classes[0]] ?? 1) > 1 ? -1.5 : 0;
    const score = d + threat + counter;
    if (score < bs) (bs = score), (best = o);
  });
  if (best) {
    setOrder(u, { type: 'attack', id: (best as Unit).id, auto: true });
    return;
  }
  // Warships with nothing to fight bombard buildings along the shore within range.
  if (ship && def.range >= 2) {
    let bb: Building | null = null;
    let bd = def.range + 0.5;
    for (const b of w.buildings()) {
      if (!w.canFight(u.owner, b.owner) || !b.complete || !fog?.isVisible(b.x + b.size / 2, b.y + b.size / 2)) continue;
      const d = distToRect(u.x, u.y, b.x, b.y, b.size);
      if (d < bd && (!def.minRange || d >= def.minRange)) (bd = d), (bb = b);
    }
    if (bb) setOrder(u, { type: 'attack', id: (bb as Building).id, auto: true });
  }
}

// ---------- damage ----------

function shoot(w: World, u: Unit, t: Unit | Building): void {
  const c = centre(t);
  // Aim at a random point inside a building; at a unit, where it stands now
  // (or, with Ballistics, where it will be when the shot lands).
  let tx = t.kind === 'building' ? t.x + 0.3 + w.rng.next() * (t.size - 0.6) : c.x;
  let ty = t.kind === 'building' ? t.y + 0.3 + w.rng.next() * (t.size - 0.6) : c.y;
  if (t.kind === 'unit' && w.players[u.owner]?.mods.ballistics) {
    const def = unitStats(w, u.owner, u.type);
    const ticks = (Math.hypot(tx - u.x, ty - u.y) / (def.projectileSpeed ?? 7)) * TICK_RATE;
    tx += (t.x - t.px) * ticks;
    ty += (t.y - t.py) * ticks;
  }
  launch(w, u, t.id, tx, ty);
}

/** Looses a projectile at a point (target 0 for a ground shot). */
function launch(w: World, u: Unit, target: number, tx: number, ty: number): void {
  const def = unitStats(w, u.owner, u.type);
  const dist = Math.hypot(tx - u.x, ty - u.y);
  const ticks = Math.max(1, Math.round((dist / (def.projectileSpeed ?? 7)) * TICK_RATE));
  const t = { id: target };
  w.projectiles.push({
    id: w.nextProjectileId++,
    from: u.type,
    owner: u.owner,
    shooter: u.id,
    target: t.id,
    sx: u.x,
    sy: u.y,
    tx,
    ty,
    t: 0,
    dt: 1 / ticks,
    arc: def.splash ? 0.6 + dist * 0.18 : def.pierce ? 0.1 + dist * 0.02 : 0.25 + dist * 0.08,
    splash: def.splash,
    pierce: def.pierce,
    height: def.packs ? 1.6 : def.splash ? 0.9 : undefined,
  });
}

/** Advances arrows and javelins; on arrival they hit the target only if it is still near the aim point. */
export function projectileTick(w: World): void {
  const keep: Projectile[] = [];
  for (const p of w.projectiles) {
    p.t += p.dt;
    if (p.t < 1) {
      keep.push(p);
      continue;
    }
    if (p.splash || p.pierce) {
      impact(w, p);
      continue;
    }
    const t = w.get(p.target);
    if (!t || t.kind === 'resource') continue;
    const hit = t.kind === 'building' ? distToRect(p.tx, p.ty, t.x, t.y, t.size) < 0.1 : Math.hypot(t.x - p.tx, t.y - p.ty) <= HIT_RADIUS + UNIT_DEFS[t.type].radius;
    if (!hit) continue;
    if (p.damage !== undefined) {
      const armor = t.kind === 'unit' ? unitStats(w, t.owner, t.type).pierceArmor : buildingArmor(w, t).pierce;
      applyDamage(w, t, Math.max(1, p.damage - armor), null, p.owner);
    } else applyDamage(w, t, damageOf(unitStats(w, p.owner, p.from), t, w), w.unit(p.shooter) ?? null, p.owner);
  }
  w.projectiles = keep;
}

/** Stones and boulders crush an area; bolts run through a line. */
function impact(w: World, p: Projectile): void {
  const def = unitStats(w, p.owner, p.from);
  const shooter = w.unit(p.shooter) ?? null;
  if (p.pierce) {
    const victims = boltVictims(w, p.sx, p.sy, p.tx, p.ty, def.range, p.owner);
    for (const v of victims) applyDamage(w, v, damageOf(def, v, w), shooter, p.owner);
    const t = w.get(p.target);
    if (t?.kind === 'building') applyDamage(w, t, damageOf(def, t, w), shooter, p.owner);
    return;
  }
  w.events.push({ type: 'blast', x: p.tx, y: p.ty, size: p.splash ?? 0.6 });
  // A direct hit on the building aimed at takes full damage; the blast does the rest.
  const t = w.get(p.target);
  let skip = 0;
  if (t?.kind === 'building' && distToRect(p.tx, p.ty, t.x, t.y, t.size) < 0.2) {
    applyDamage(w, t, damageOf(def, t, w), shooter, p.owner);
    skip = t.id;
  }
  splash(w, p.tx, p.ty, p.splash!, (v) => damageOf(def, v, w), (v, amount) => applyDamage(w, v, amount, null, p.owner), p.shooter, skip);
}

export function applyDamage(w: World, t: Unit | Building, amount: number, by: Unit | null, owner = by?.owner ?? -1): void {
  t.hp -= amount;
  if (t.kind === 'unit') {
    if (by) {
      t.attackedBy = by.id;
      t.attackedAt = w.tick;
    }
  }
  w.events.push({ type: 'hit', owner: t.owner, by: owner, id: t.id, x: centre(t).x, y: centre(t).y, amount, building: t.kind === 'building', src: by?.type });
  if (t.hp > 0) return;
  if (t.kind === 'unit') {
    w.events.push({ type: 'death', owner: t.owner, unit: t.type, x: t.x, y: t.y, face: t.face, by: owner });
  } else {
    w.events.push({ type: 'destroyed', owner: t.owner, building: t.type, x: t.x, y: t.y, size: t.size, by: owner });
  }
  w.remove(t.id);
}

/** Changes the stance of units; resets their guard point to where they stand. */
export function setStance(u: Unit, stance: Stance): void {
  u.stance = stance;
  u.guard = { x: u.x, y: u.y };
  if (isCombatOrder(u.order) && u.order.type === 'attack' && u.order.auto && stance === 'passive') setOrder(u, null);
}
