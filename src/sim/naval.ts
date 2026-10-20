// Ships: transports ferrying armies across water (boarding on one shore,
// landing on another), finding where sea meets land, and which targets a unit
// can actually get at across the water's edge.
import { moveGroup } from './commands';
import { setOrder } from './economy';
import { BUILDING_DEFS, type Building, type Order, UNIT_DEFS, type Unit, distToRect, isShip, navOf } from './entities';
import { WATER } from './grid';
import type { Goal } from './pathfinding';
import { unload } from './siege';
import type { World } from './world';

/** Seconds a transport waits at the pickup for stragglers before it sails. */
const FERRY_WAIT = 90;
/** How far out from a point to look for a landing or boarding place (tiles). */
const SHORE_SEARCH = 80;

/** Land region at or nearest a point, for a player's layer (-1 if none nearby). */
export function landRegion(w: World, x: number, y: number, owner: number): number {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (w.grid.isWalkable(tx, ty, owner)) return w.grid.component(tx, ty, owner);
  const near = w.grid.nearestWalkable(x, y, -1, 8, owner);
  return near ? w.grid.component(near.x, near.y, owner) : -1;
}

/**
 * The deep-water tile nearest (x, y) that lies in the ship's sea and touches
 * land of the given region (any land when region is -1).
 */
export function shoreWater(w: World, ship: Unit, x: number, y: number, region: number, owner: number, maxR = SHORE_SEARCH): { x: number; y: number } | null {
  const { grid } = w;
  const sea = grid.component(Math.floor(ship.x), Math.floor(ship.y), WATER);
  const cx = Math.floor(x), cy = Math.floor(y);
  const touches = (tx: number, ty: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (grid.isWalkable(nx, ny, owner) && (region < 0 || grid.component(nx, ny, owner) === region)) return true;
      }
    return false;
  };
  for (let r = 0; r <= maxR; r++) {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx, ty = cy + dy;
        if (!grid.isWalkable(tx, ty, WATER) || (sea >= 0 && grid.component(tx, ty, WATER) !== sea) || !touches(tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d < bd) (bd = d), (best = { x: tx, y: ty });
      }
    if (best) return best;
  }
  return null;
}

/** Own transports with room, nearest the point first. */
export function transportsNear(w: World, owner: number, x: number, y: number): Unit[] {
  const out: Unit[] = [];
  for (const u of w.field(owner)) if (UNIT_DEFS[u.type].cargo && isShip(u) && !u.ferry && u.cargo.length < UNIT_DEFS[u.type].cargo!) out.push(u);
  return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
}

/**
 * Sends a transport to the shore by the riders and has them board it. With a
 * destination, it sails there and lands them once everyone is aboard.
 * Returns the riders taken (none if the ship can't reach them or the far shore).
 */
export function startFerry(w: World, ship: Unit, riders: Unit[], dest: { x: number; y: number } | null): Unit[] {
  const room = (UNIT_DEFS[ship.type].cargo ?? 0) - ship.cargo.length;
  const group = riders.filter((r) => !isShip(r) && r.owner === ship.owner).slice(0, room);
  if (!group.length) return [];
  const cx = group.reduce((s, r) => s + r.x, 0) / group.length, cy = group.reduce((s, r) => s + r.y, 0) / group.length;
  const home = w.grid.component(Math.floor(group[0].x), Math.floor(group[0].y), ship.owner);
  const pickup = shoreWater(w, ship, cx, cy, home, ship.owner);
  if (!pickup) return [];
  if (dest && !shoreWater(w, ship, dest.x, dest.y, landRegion(w, dest.x, dest.y, ship.owner), ship.owner)) return [];
  ship.ferry = { riders: group.map((r) => r.id), pickup, dest, since: w.time };
  setOrder(ship, { type: 'move', x: pickup.x + 0.5, y: pickup.y + 0.5 });
  for (const r of group) {
    setOrder(r, { type: 'garrison', id: ship.id });
    r.resume = null;
    r.guard = null;
  }
  return group;
}

/** A ferrying transport waits at the pickup until everyone coming is aboard, then sails to land them. */
export function ferryThink(w: World, u: Unit): void {
  const f = u.ferry!;
  const coming = f.riders.filter((id) => {
    const r = w.unit(id);
    return r && !r.inside && r.order?.type === 'garrison' && r.order.id === u.id;
  });
  // Don't wait for ever on someone who can't get here.
  if (coming.length && w.time - (f.since ?? w.time) > FERRY_WAIT) {
    for (const id of coming) {
      const r = w.unit(id);
      if (r) setOrder(r, null);
    }
    coming.length = 0;
  }
  if (coming.length) {
    f.riders = coming.concat(u.cargo.filter((id) => f.riders.includes(id)));
    // Make sure the boat comes in to the shore by them.
    if (!u.order && Math.hypot(u.x - f.pickup.x - 0.5, u.y - f.pickup.y - 0.5) > 1.2) setOrder(u, { type: 'move', x: f.pickup.x + 0.5, y: f.pickup.y + 0.5 });
    return;
  }
  u.ferry = null;
  if (u.cargo.length && f.dest) setOrder(u, { type: 'unload', x: f.dest.x, y: f.dest.y });
}

/** Where a transport heading to land at (x, y) should sail to. */
export function landingGoal(w: World, u: Unit, x: number, y: number): Goal | null {
  const o = u.order as Extract<Order, { type: 'unload' }>;
  o.at ??= shoreWater(w, u, x, y, landRegion(w, x, y, u.owner), u.owner) ?? undefined;
  if (!o.at) return null;
  return { x0: o.at.x, y0: o.at.y, x1: o.at.x, y1: o.at.y, reach: 0 };
}

/** Sails to the landing place and puts everyone ashore, sending them on to the point. */
export function unloadThink(w: World, u: Unit, o: Extract<Order, { type: 'unload' }>, walk: () => void): void {
  if (!u.cargo.length) {
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  o.at ??= shoreWater(w, u, o.x, o.y, landRegion(w, o.x, o.y, u.owner), u.owner) ?? undefined;
  if (!o.at) {
    w.events.push({ type: 'error', owner: u.owner, message: 'No place to land there' });
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  const d = Math.hypot(o.at.x + 0.5 - u.x, o.at.y + 0.5 - u.y);
  // Close enough to wade ashore (other boats may be crowding the same spot).
  const stuck = !u.path && !u.pathPending && u.repaths > 2 && d < 3;
  if (d > 2.2 && !stuck) return walk();
  const riders = u.cargo.map((id) => w.unit(id)).filter((r): r is Unit => !!r);
  unload(w, u, { x: o.x, y: o.y });
  setOrder(u, null);
  u.state = 'idle';
  // Ashore, they carry on to where they were sent.
  const region = landRegion(w, o.x, o.y, u.owner);
  const onward = riders.filter((r) => w.grid.component(Math.floor(r.x), Math.floor(r.y), r.owner) === region);
  if (onward.length) moveGroup(w, onward, o.x, o.y);
}

/**
 * Could this unit get within reach of the target? Melee units only fight
 * what stands on their own element (ships at sea, soldiers on land); archers
 * and ships' crews can shoot across the water's edge if a reachable spot is
 * within range.
 */
export function canEngage(w: World, u: Unit, t: Unit | Building, range: number): boolean {
  const ship = isShip(u);
  if (t.kind === 'unit') {
    if (ship === isShip(t)) return true;
    if (range < 1) return false;
    return spotWithin(w, u, t.x, t.y, 0, range);
  }
  const def = BUILDING_DEFS[t.type];
  if (!ship && !def.naval) return true;
  if (!ship && def.naval && range < 1) return false;
  // Ships: the building must be by the water (within reach or range of the sea).
  return spotWithin(w, u, t.x + t.size / 2, t.y + t.size / 2, t.size / 2, Math.max(range, 1.2), t);
}

/** Is there a tile on the unit's own layer and region within `range` of the point (or building)? */
function spotWithin(w: World, u: Unit, x: number, y: number, pad: number, range: number, b?: Building): boolean {
  const nav = navOf(u);
  const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), nav);
  const spot = w.grid.nearestWalkable(x, y, region, Math.ceil(range + pad) + 1, nav);
  if (!spot) return false;
  const d = b ? distToRect(spot.x + 0.5, spot.y + 0.5, b.x, b.y, b.size) : Math.hypot(spot.x + 0.5 - x, spot.y + 0.5 - y);
  return d <= range + 0.3;
}
