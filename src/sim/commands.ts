// Player commands. Touch input and the AI both produce these; the world applies
// them at the start of the next tick, so the simulation stays deterministic.
import { setStance } from './combat';
import { canBoard, setPacked, unload } from './siege';
import { canBuild, findResource, gatherOrder, isBuilder, isGatherer, setOrder, sourceOf } from './economy';
import { FlowField } from './flowfield';
import { WALL_TYPES, canShelter, placeWall, setGateLock, shelterRoom, townBell, ungarrison } from './fortify';
import { buildingCost, buildingMaxHp, unitStats } from './techs';
import { canEngage, landRegion, startFerry, transportsNear } from './naval';
import { BUILDING_DEFS, type BuildingType, type GatherTarget, type Stance, UNIT_DEFS, type Unit, type UnitType, isShip, navOf } from './entities';
import { cancelQueued, canAfford, enqueue, enqueueTech, pay, trade } from './production';
import type { TechId } from './techs';
import { carried, isRelic } from './modes';
import type { World } from './world';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'gather'; ids: number[]; target: GatherTarget }
  | { type: 'build'; ids: number[]; building: BuildingType; x: number; y: number }
  | { type: 'help'; ids: number[]; id: number }
  | { type: 'stop'; ids: number[] }
  | { type: 'train'; id: number; unit: UnitType; count?: number }
  | { type: 'cancelTrain'; id: number; index: number }
  | { type: 'rally'; ids: number[]; x: number; y: number; target: GatherTarget | null }
  | { type: 'repeat'; id: number; on: boolean }
  | { type: 'delete'; ids: number[] }
  | { type: 'autoReseed'; on: boolean }
  | { type: 'attack'; ids: number[]; id: number }
  | { type: 'stance'; ids: number[]; stance: Stance }
  | { type: 'research'; id: number; tech: TechId }
  | { type: 'trade'; id: number; action: 'buy' | 'sell'; res: 'food' | 'wood' | 'stone' }
  | { type: 'garrison'; ids: number[]; id: number }
  | { type: 'ungarrison'; id: number }
  | { type: 'buildWall'; ids: number[]; kind: 'palisade' | 'stone'; tiles: Array<{ x: number; y: number; gate?: boolean }> }
  | { type: 'lockGate'; id: number; locked: boolean }
  | { type: 'attackGround'; ids: number[]; x: number; y: number }
  | { type: 'pack'; ids: number[]; packed: boolean }
  /** Transports: sail to the shore by this point and land everyone aboard. */
  | { type: 'unload'; ids: number[]; x: number; y: number }
  /** The town bell: villagers to shelter (on), or back to work (off). */
  | { type: 'bell'; on: boolean };

export function applyCommand(w: World, player: number, cmd: Command): void {
  const ids = 'ids' in cmd ? cmd.ids : [];
  const units = ids.map((id) => w.unit(id)).filter((u): u is Unit => !!u && u.owner === player);
  switch (cmd.type) {
    case 'move': {
      // Ships and soldiers go their separate ways; soldiers bound across water take a boat.
      const ships = units.filter(isShip), land = units.filter((u) => !isShip(u));
      if (ships.length) moveGroup(w, ships, cmd.x, cmd.y);
      if (land.length) moveLand(w, player, land, cmd.x, cmd.y);
      return;
    }
    case 'unload':
      for (const u of units) {
        if (!isShip(u) || !UNIT_DEFS[u.type].cargo) continue;
        u.ferry = null;
        setOrder(u, { type: 'unload', x: cmd.x, y: cmd.y });
      }
      return;
    case 'attack': {
      const t = w.get(cmd.id);
      if (!t || t.kind === 'resource') return;
      if (w.peace && w.isEnemy(player, t.owner)) {
        const m = Math.ceil((w.peaceUntil - w.time) / 60);
        w.events.push({ type: 'error', owner: player, message: `Peace Treaty: no attacks for ${m} more minute${m === 1 ? '' : 's'}` });
        return;
      }
      for (const u of units) {
        const def = UNIT_DEFS[u.type];
        if (!w.isEnemy(player, t.owner)) {
          // Monks heal friends; nobody attacks their own side or an ally.
          if (def.healer && t.kind === 'unit') setOrder(u, { type: 'heal', id: t.id });
          continue;
        }
        if (def.converter) {
          if (t.kind === 'unit') setOrder(u, { type: 'convert', id: t.id });
          continue;
        }
        if (def.attack <= 0) continue;
        // Swordsmen can't wade out to a ship.
        if (!canEngage(w, u, t, unitStats(w, u.owner, u.type).range)) continue;
        setOrder(u, { type: 'attack', id: t.id });
        u.resume = null;
        u.guard = null;
      }
      return;
    }
    case 'stance':
      for (const u of units) setStance(u, cmd.stance);
      return;
    case 'research': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) enqueueTech(w, b, cmd.tech);
      return;
    }
    case 'garrison': {
      const carrier = w.unit(cmd.id);
      if (carrier && isShip(carrier)) {
        // The transport comes in to the shore by them.
        if (carrier.owner === player) startFerry(w, carrier, units.filter((u) => canBoard(carrier, u)), null);
        return;
      }
      if (carrier) {
        // Board a ram or siege tower.
        let room = (UNIT_DEFS[carrier.type].cargo ?? 0) - carrier.cargo.length;
        for (const u of units) {
          if (room <= 0 || !canBoard(carrier, u)) continue;
          setOrder(u, { type: 'garrison', id: carrier.id });
          room--;
        }
        return;
      }
      const b = w.building(cmd.id);
      if (!b) return;
      if (b.type === 'monastery' && b.owner === player)
        for (const u of units) {
          const r = carried(w, u);
          if (r) setOrder(u, { type: 'relic', id: r.id });
        }
      let room = shelterRoom(b);
      for (const u of units) {
        if (room <= 0 || !canShelter(b, u)) continue;
        setOrder(u, { type: 'garrison', id: b.id });
        u.resume = null;
        room--;
      }
      return;
    }
    case 'bell':
      townBell(w, player, cmd.on);
      return;
    case 'ungarrison': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) ungarrison(w, b);
      const c = w.unit(cmd.id);
      if (c && c.owner === player && isShip(c)) {
        // Put in at the nearest shore and land them there.
        c.ferry = null;
        setOrder(c, { type: 'unload', x: c.x, y: c.y });
      } else if (c && c.owner === player) unload(w, c);
      return;
    }
    case 'attackGround':
      for (const u of units) {
        if (!UNIT_DEFS[u.type].groundAttack) continue;
        setOrder(u, { type: 'attackGround', x: cmd.x, y: cmd.y });
        u.resume = null;
      }
      return;
    case 'pack':
      for (const u of units) {
        setOrder(u, null);
        setPacked(u, cmd.packed);
      }
      return;
    case 'lockGate': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) setGateLock(w, b, cmd.locked);
      return;
    }
    case 'buildWall': {
      const def = BUILDING_DEFS[WALL_TYPES[cmd.kind].wall];
      if (def.age > w.players[player].age) return;
      const placed = placeWall(w, player, cmd.kind, cmd.tiles);
      // Builders start on the segment nearest each of them, then work along the line.
      const builders = units.filter(isBuilder);
      for (const u of builders) {
        let best = placed[0], bd = Infinity;
        for (const b of placed) {
          const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
          if (d < bd) (bd = d), (best = b);
        }
        if (best) setOrder(u, { type: 'build', id: best.id }), (u.resume = null);
      }
      return;
    }
    case 'trade': {
      const b = w.building(cmd.id);
      if (b && b.owner === player && b.type === 'market' && b.complete) trade(w, player, cmd.action, cmd.res);
      return;
    }
    case 'stop':
      for (const u of units) {
        setOrder(u, null);
        u.resume = null;
      }
      return;
    case 'gather':
      return gatherGroup(w, units, cmd.target);
    case 'build': {
      const def = BUILDING_DEFS[cmd.building];
      const p = w.players[player];
      if (def.age > p.age) {
        w.events.push({ type: 'error', owner: player, message: 'Not available in this age' });
        return;
      }
      if (!def.buildable || !w.canPlace(cmd.building, player, cmd.x, cmd.y) || (units.length && !units.some((u) => canBuild(u, cmd.building)))) {
        w.events.push({ type: 'error', owner: player, message: "Can't build there" });
        return;
      }
      const cost = buildingCost(w, player, cmd.building);
      if (!canAfford(w, player, cost)) {
        const short = Object.entries(cost).find(([k, v]) => p.resources[k as keyof typeof p.resources] < (v ?? 0));
        w.events.push({ type: 'error', owner: player, message: `Not enough ${short?.[0] ?? 'resources'}` });
        return;
      }
      pay(w, player, cost);
      const b = w.placeBuilding(cmd.building, player, cmd.x, cmd.y);
      for (const u of units) if (canBuild(u, b.type)) setOrder(u, { type: 'build', id: b.id }), (u.resume = null);
      return;
    }
    case 'train': {
      const b = w.building(cmd.id);
      if (!b || b.owner !== player) return;
      for (let k = 0; k < (cmd.count ?? 1); k++) if (!enqueue(w, b, cmd.unit)) break;
      return;
    }
    case 'cancelTrain': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) cancelQueued(w, b, cmd.index);
      return;
    }
    case 'rally':
      for (const id of cmd.ids) {
        const b = w.building(id);
        if (b && b.owner === player && BUILDING_DEFS[b.type].trains.length) b.rally = { x: cmd.x, y: cmd.y, target: cmd.target };
      }
      return;
    case 'repeat': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) b.repeat = cmd.on;
      return;
    }
    case 'autoReseed':
      w.players[player].autoReseed = cmd.on;
      return;
    case 'delete':
      for (const id of cmd.ids) {
        const e = w.get(id);
        if (!e || e.kind === 'resource' || e.owner !== player) continue;
        // The King can't be dismissed.
        if (e.kind === 'unit' && UNIT_DEFS[e.type].classes.includes('king')) continue;
        if (e.kind === 'building') {
          // Refund what wasn't built yet, and everything still queued.
          if (!e.complete) pay(w, player, Object.fromEntries(Object.entries(buildingCost(w, player, e.type)).map(([k, v]) => [k, Math.floor((v ?? 0) * (1 - e.progress))])), -1);
          while (e.queue.length) cancelQueued(w, e, e.queue.length - 1);
        }
        w.remove(id);
      }
      return;
    case 'help': {
      const b = w.building(cmd.id);
      if (!b || b.owner !== player) return;
      const damaged = b.complete && b.hp < buildingMaxHp(w, b) - 0.5;
      for (const u of units) {
        if (!b.complete && canBuild(u, b.type)) setOrder(u, { type: 'build', id: b.id });
        else if (damaged && canBuild(u, b.type)) setOrder(u, { type: 'repair', id: b.id });
        else if (b.complete && u.carry && (BUILDING_DEFS[b.type].dropoff as string[]).includes(u.carry.res))
          setOrder(u, { type: 'dropoff', id: b.id });
        else moveGroup(w, [u], b.x + b.size / 2, b.y + b.size + 0.5);
      }
      return;
    }
  }
}

/** Groups this size or larger share one flow field instead of searching a path each. */
const FLOW_GROUP = 5;

/**
 * Spreads a group around the target point so they don't all stand on one tile.
 * Big groups share a flow field toward their slots; each unit keeps its slot.
 */
export function moveGroup(w: World, units: Unit[], x: number, y: number): void {
  const sorted = [...units].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  const slots = sorted.map((_, k) => {
    const [ox, oy] = spiral(k);
    return { x: x + ox * 0.9, y: y + oy * 0.9 };
  });
  let field: FlowField | null = null;
  if (units.length >= FLOW_GROUP) {
    const owner = navOf(units[0]);
    const goals = slots.map((s) => ({ x: Math.floor(s.x), y: Math.floor(s.y) })).filter((g) => w.grid.isWalkable(g.x, g.y, owner));
    if (goals.length) {
      field = new FlowField(w.grid, goals, units, owner);
      // The way round an obstacle can run outside the window: search the whole map instead.
      const lost = units.filter((u) => field!.at(Math.floor(u.x), Math.floor(u.y)) === Infinity).length;
      if (lost > units.length / 2) field = new FlowField(w.grid, goals, units, owner, w.map.size);
    }
  }
  sorted.forEach((u, k) => {
    setOrder(u, { type: 'move', x: slots[k].x, y: slots[k].y });
    u.resume = null;
    u.guard = null;
    if (field && field.at(Math.floor(u.x), Math.floor(u.y)) < Infinity) u.flow = { field, x: slots[k].x, y: slots[k].y };
  });
}

/**
 * Land units sent somewhere they can't walk to (another island, the far side of
 * a sea) board the nearest own transport, which lands them there; with no
 * transport they go as far as they can and the player is told.
 */
function moveLand(w: World, player: number, units: Unit[], x: number, y: number): void {
  const dest = landRegion(w, x, y, player);
  const home = w.grid.component(Math.floor(units[0].x), Math.floor(units[0].y), player);
  if (dest < 0 || home < 0 || dest === home) return moveGroup(w, units, x, y);
  const waiting = units.filter((u) => w.grid.component(Math.floor(u.x), Math.floor(u.y), player) === home);
  let left = waiting;
  for (const ship of transportsNear(w, player, units[0].x, units[0].y)) {
    if (!left.length) break;
    const taken = startFerry(w, ship, left, { x, y });
    left = left.filter((u) => !taken.includes(u));
  }
  const rest = units.filter((u) => left.includes(u) || !waiting.includes(u));
  if (left.length) w.events.push({ type: 'error', owner: player, message: transportsNear(w, player, x, y).length || waiting.length < units.length ? 'No path' : 'No path: build a Transport Ship' });
  if (rest.length) moveGroup(w, rest, x, y);
}

/** k-th offset of a square spiral around the origin. */
function spiral(k: number): [number, number] {
  if (k === 0) return [0, 0];
  const ring = Math.ceil((Math.sqrt(k + 1) - 1) / 2);
  const side = ring * 2;
  const start = (side - 1) ** 2;
  const t = k - start;
  const seg = Math.floor(t / side), off = (t % side) - ring + 1;
  return seg === 0 ? [ring, off] : seg === 1 ? [-off, ring] : seg === 2 ? [-ring, -off] : [off, -ring];
}

/** Sends gatherers to a resource (at most two per tile on clustered tiles); others walk there. */
function gatherGroup(w: World, units: Unit[], target: GatherTarget): void {
  const relic = target.kind === 'entity' ? w.get(target.id) : undefined;
  if (isRelic(relic)) {
    // The nearest monk fetches it; everyone else just goes there.
    const monks = units.filter((u) => UNIT_DEFS[u.type].converter && !carried(w, u)).sort((a, b) => Math.hypot(a.x - relic.x, a.y - relic.y) - Math.hypot(b.x - relic.x, b.y - relic.y));
    if (monks[0] && !relic.holder) setOrder(monks[0], { type: 'relic', id: relic.id });
    const rest = units.filter((u) => u !== monks[0]);
    if (rest.length) moveGroup(w, rest, relic.x, relic.y);
    return;
  }
  const source = sourceOf(w, target);
  if (!source) return;
  // Fishing ships take only fish; villagers anything they can walk to.
  const wet = source === 'fish' || source === 'fish_trap';
  const fits = (u: Unit) => isGatherer(u) && (!isShip(u) || wet) && !(source === 'fish_trap' && !isShip(u));
  const gatherers = units.filter(fits);
  const others = units.filter((u) => !fits(u));
  if (others.length) {
    const tx = target.kind === 'tile' ? target.x + 0.5 : (w.get(target.id) as { x: number }).x;
    const ty = target.kind === 'tile' ? target.y + 0.5 : (w.get(target.id) as { y: number }).y;
    moveGroup(w, others, tx, ty);
  }
  let spots: GatherTarget[] = [target];
  if ((source === 'farm' || source === 'fish_trap') && gatherers.length > 1) {
    // One farmer per field: hand out the tapped farm, then the nearest free ones.
    const [first, ...rest] = gatherers;
    const order = gatherOrder(w, target);
    if (order) setOrder(first, order), (first.resume = null);
    const f = w.get((target as { id: number }).id) as { x: number; y: number };
    for (const u of rest) {
      // Farms already given out count as worked, so each search finds a different free one.
      const t = findResource(w, u, [source], f.x + 1.5, f.y + 1.5, 12);
      const o = t && gatherOrder(w, t);
      if (o) {
        setOrder(u, o);
        u.resume = null;
      }
    }
    return;
  }
  if (target.kind === 'tile' && gatherers.length > 2) {
    const N = w.map.size;
    const f = w.map.feature[target.y * N + target.x];
    const near: Array<{ x: number; y: number; d: number }> = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = target.x + dx, y = target.y + dy;
        if (!w.grid.inside(x, y) || w.map.feature[y * N + x] !== f || w.map.amount[y * N + x] <= 0) continue;
        near.push({ x, y, d: Math.hypot(dx, dy) });
      }
    near.sort((a, b) => a.d - b.d);
    spots = near.map((n) => ({ kind: 'tile', x: n.x, y: n.y }));
  }
  gatherers.forEach((u, k) => {
    const order = gatherOrder(w, spots[Math.floor(k / 2) % spots.length]);
    if (order) {
      setOrder(u, order);
      u.resume = null;
    }
  });
}
