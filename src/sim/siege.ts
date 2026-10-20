// Siege engines: packing and unpacking trebuchets, keeping out of minimum
// range, bombarding the ground, area damage with friendly fire, bolts that pass
// through lines of men, and vehicles that carry infantry (rams, siege towers),
// including unloading over an enemy wall.
import { TICK_RATE } from './constants';
import { setOrder } from './economy';
import { BUILDING_DEFS, type Building, UNIT_DEFS, type Unit, distToRect, isShip, navOf } from './entities';
import { landRegion } from './naval';
import { unitStats } from './techs';
import type { World } from './world';

/** Seconds to pack or unpack a trebuchet. */
export const PACK_S = 5;
/** Land units step aboard a transport from this far away (centre to centre, tiles). */
const BOARD_REACH = 2.4;
/** Each rider makes a ram this much faster. */
const RIDER_SPEED = 0.1;

// ---------- packing ----------

/**
 * Advances a pack/unpack in progress. Returns true while the engine is busy
 * (it can neither move nor fire).
 */
export function packTick(u: Unit): boolean {
  if (u.packTimer <= 0) return false;
  u.state = 'pack';
  u.path = null;
  if (--u.packTimer === 0) u.packed = !u.packed;
  return u.packTimer > 0;
}

/** Starts packing (to move) or unpacking (to fire) if the engine isn't already in that state. */
export function setPacked(u: Unit, packed: boolean): void {
  if (!UNIT_DEFS[u.type].packs || u.packed === packed || u.packTimer > 0) return;
  u.packTimer = PACK_S * TICK_RATE;
  u.state = 'pack';
  u.path = null;
}

/** May this unit move right now? Unpacked trebuchets first pack up. */
export function readyToMove(u: Unit): boolean {
  if (!UNIT_DEFS[u.type].packs) return true;
  if (u.packTimer > 0) return false;
  if (!u.packed) {
    setPacked(u, true);
    return false;
  }
  return true;
}

/** Movement speed, with riders pushing a ram along. */
export function speedOf(w: World, u: Unit): number {
  const s = unitStats(w, u.owner, u.type).speed;
  return u.cargo.length && u.type === 'ram' ? s * (1 + RIDER_SPEED * u.cargo.length) : s;
}

// ---------- range ----------

/** Steps directly away from a point to get outside minimum range. */
export function backOff(w: World, u: Unit, x: number, y: number, minRange: number): void {
  const d = Math.hypot(u.x - x, u.y - y) || 1;
  const want = minRange + 1;
  const tx = x + ((u.x - x) / d) * want, ty = y + ((u.y - y) / d) * want;
  const nav = navOf(u);
  const spot = w.grid.nearestWalkable(tx, ty, w.grid.component(Math.floor(u.x), Math.floor(u.y), nav), 4, nav);
  if (!spot) return;
  u.path = [{ x: spot.x + 0.5, y: spot.y + 0.5 }];
  u.pathIdx = 0;
  u.state = 'walk';
}

// ---------- impacts ----------

/**
 * Area damage at a point: every unit within the radius (friend and foe, the
 * thrower excepted), less toward the edge; buildings under the blast too.
 */
export function splash(
  w: World,
  x: number,
  y: number,
  radius: number,
  damage: (t: Unit | Building) => number,
  hit: (t: Unit | Building, amount: number) => void,
  except = 0,
  skipBuilding = 0,
): void {
  const victims: Array<[Unit, number]> = [];
  w.spatial.query(x, y, radius + 0.5, (u, d) => {
    if (u.id === except || u.inside) return;
    const edge = Math.max(0, d - UNIT_DEFS[u.type].radius);
    if (edge <= radius) victims.push([u, edge]);
  });
  for (const [u, edge] of victims) if (w.get(u.id)) hit(u, damage(u) * (1 - 0.5 * (edge / radius)));
  const seen = new Set<number>();
  const N = w.map.size;
  for (let ty = Math.floor(y - radius); ty <= Math.floor(y + radius); ty++)
    for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      const id = w.grid.building[ty * N + tx];
      if (!id || seen.has(id) || id === skipBuilding) continue;
      seen.add(id);
      const b = w.building(id);
      if (b && distToRect(x, y, b.x, b.y, b.size) <= radius) hit(b, damage(b) * 0.6);
    }
}

/** Enemy units along a bolt's flight line (from the shooter on out to full range). */
export function boltVictims(w: World, sx: number, sy: number, tx: number, ty: number, range: number, owner: number): Unit[] {
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const ex = sx + ux * (range + 0.5), ey = sy + uy * (range + 0.5);
  const out: Unit[] = [];
  w.spatial.query((sx + ex) / 2, (sy + ey) / 2, (range + 1) / 2 + 1, (u) => {
    if (!w.isEnemy(owner, u.owner) || u.inside) return;
    const along = (u.x - sx) * ux + (u.y - sy) * uy;
    if (along < 0.3 || along > range + 0.5) return;
    const off = Math.abs((u.x - sx) * uy - (u.y - sy) * ux);
    if (off <= UNIT_DEFS[u.type].radius + 0.2) out.push(u);
  });
  return out;
}

// ---------- vehicles ----------

export function canBoard(carrier: Unit, u: Unit): boolean {
  const cap = UNIT_DEFS[carrier.type].cargo ?? 0;
  if (!cap || carrier.owner !== u.owner || carrier.id === u.id || carrier.cargo.length >= cap) return false;
  // Transports take anyone who walks.
  if (isShip(carrier)) return !isShip(u);
  const cls = UNIT_DEFS[u.type].classes;
  if (cls.includes('siege') || cls.includes('cavalry') || UNIT_DEFS[u.type].gatherer) return false;
  // Rams take infantry; siege towers infantry and archers.
  return carrier.type === 'ram' ? cls.includes('infantry') : cls.includes('infantry') || cls.includes('archer');
}

/** Riders travel with their vehicle. */
export function carryRiders(w: World): void {
  for (const c of w.field()) {
    if (!c.cargo.length) continue;
    for (const id of c.cargo) {
      const r = w.unit(id);
      if (r) (r.px = r.x = c.x), (r.py = r.y = c.y);
    }
  }
}

export function boardThink(w: World, u: Unit, carrier: Unit, walk: () => void): void {
  if (!canBoard(carrier, u)) {
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  const d = Math.hypot(carrier.x - u.x, carrier.y - u.y);
  if (isShip(carrier)) {
    // Step aboard over the gunwale from the shore.
    if (d > BOARD_REACH) {
      // On the shore where it comes in, and the boat isn't there yet: wait for it.
      const at = carrier.ferry?.pickup ?? carrier;
      const spot = w.grid.nearestWalkable(at.x, at.y, w.grid.component(Math.floor(u.x), Math.floor(u.y), u.owner), 5, u.owner);
      if (spot && !u.path && Math.hypot(spot.x + 0.5 - u.x, spot.y + 0.5 - u.y) < 1.6) {
        u.state = 'idle';
        u.repaths = 0;
        return;
      }
      return walk();
    }
  } else if (d > UNIT_DEFS[carrier.type].radius + 0.9) {
    // Close by: climb straight in rather than path to a neighbouring tile.
    if (d < 3) {
      u.state = 'walk';
      u.path = [{ x: carrier.x, y: carrier.y }];
      u.pathIdx = 0;
      u.repaths = 0;
      return;
    }
    return walk();
  }
  setOrder(u, null);
  u.state = 'idle';
  u.inside = carrier.id;
  u.resume = null;
  carrier.cargo.push(u.id);
}

/**
 * Lets the riders out. A siege tower beside an enemy wall puts them down on
 * the far side of it; otherwise they step out around the vehicle.
 */
export function unload(w: World, carrier: Unit, shore?: { x: number; y: number }): void {
  if (!carrier.cargo.length) return;
  let land: { x: number; y: number } | null = null;
  // Ships put their riders ashore on the side they were headed for.
  const region = shore && isShip(carrier) ? landRegion(w, shore.x, shore.y, carrier.owner) : -1;
  if (carrier.type === 'siege_tower') {
    const wall = enemyWallBeside(w, carrier);
    if (wall) {
      // Over the wall: straight on from the tower, past the segment.
      const wx = wall.x + 0.5, wy = wall.y + 0.5;
      const dx = Math.sign(Math.round(wx - carrier.x)), dy = Math.sign(Math.round(wy - carrier.y));
      for (let k = 1; k <= 3 && !land; k++) {
        const x = wall.x + dx * k, y = wall.y + dy * k;
        if (w.grid.isWalkable(x, y)) land = { x, y };
      }
    }
  }
  const drowned: Unit[] = [];
  for (const id of carrier.cargo) {
    const r = w.unit(id);
    if (!r) continue;
    r.inside = 0;
    const from = land ?? { x: carrier.x, y: carrier.y };
    const spot = land
      ? w.grid.nearestWalkable(from.x + 0.5, from.y + 0.5, w.grid.component(from.x, from.y), 3)
      : (region >= 0 ? w.grid.nearestWalkable(from.x, from.y, region, 6, r.owner) : null) ?? w.grid.nearestWalkable(from.x, from.y, -1, isShip(carrier) ? 6 : 4, r.owner);
    if (spot) {
      r.x = r.px = spot.x + 0.5 + (w.rng.next() - 0.5) * 0.5;
      r.y = r.py = spot.y + 0.5 + (w.rng.next() - 0.5) * 0.5;
    } else if (isShip(carrier)) {
      // A transport sunk out at sea: no shore to swim to.
      drowned.push(r);
      continue;
    }
    r.guard = { x: r.x, y: r.y };
  }
  carrier.cargo = [];
  for (const r of drowned) {
    w.events.push({ type: 'death', owner: r.owner, unit: r.type, x: r.x, y: r.y, face: r.face, by: -1 });
    w.remove(r.id);
  }
}

/** An enemy wall or gate segment touching the vehicle (within a tile and a half). */
function enemyWallBeside(w: World, u: Unit): Building | null {
  const N = w.map.size;
  let best: Building | null = null;
  let bd = 1.6;
  for (let ty = Math.floor(u.y) - 2; ty <= Math.floor(u.y) + 2; ty++)
    for (let tx = Math.floor(u.x) - 2; tx <= Math.floor(u.x) + 2; tx++) {
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      const b = w.building(w.grid.building[ty * N + tx]);
      if (!b || !w.isEnemy(u.owner, b.owner) || !BUILDING_DEFS[b.type].wall) continue;
      const d = distToRect(u.x, u.y, b.x, b.y, 1);
      if (d < bd) (bd = d), (best = b);
    }
  return best;
}
