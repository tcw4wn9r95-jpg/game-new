// Training units: queues with up-front cost, pausing at the population cap,
// spawning next to the building and heading for its rally point.
import economy from '../data/economy.json';
import { DT, type ResourceKind } from './constants';
import { gatherOrder, isGatherer, setOrder } from './economy';
import { BUILDING_DEFS, type Building, UNIT_DEFS, type UnitType } from './entities';
import { AGES, TECH_DEFS, type TechId, completeTech, researchBlock, trainTime, unitCost, unitStats } from './techs';
import { WATER } from './grid';
import type { World } from './world';

type Cost = Partial<Record<ResourceKind, number>>;

export function canAfford(w: World, player: number, cost: Cost): boolean {
  const r = w.players[player].resources;
  return Object.entries(cost).every(([k, v]) => r[k as ResourceKind] >= (v ?? 0));
}

export function pay(w: World, player: number, cost: Cost, sign = 1): void {
  const r = w.players[player].resources;
  for (const [k, v] of Object.entries(cost)) r[k as ResourceKind] -= sign * (v ?? 0);
}

/** Adds a unit to a building's queue, paying for it now. Returns false (with an error event) if it can't. */
export function enqueue(w: World, b: Building, unit: UnitType): boolean {
  const def = BUILDING_DEFS[b.type];
  if (!b.complete || !def.trains.includes(unit)) return false;
  const p = w.players[b.owner];
  if (UNIT_DEFS[unit].faction && UNIT_DEFS[unit].faction !== p.faction) return false;
  if (UNIT_DEFS[unit].age > p.age) {
    w.events.push({ type: 'error', owner: b.owner, message: `Requires the ${AGES[UNIT_DEFS[unit].age].name} Age` });
    return false;
  }
  const cost = unitCost(w, b.owner, unit);
  return queueItem(w, b, cost, { unit, progress: 0, cost });
}

/** Queues research of a technology at a building, paying now. */
export function enqueueTech(w: World, b: Building, tech: TechId): boolean {
  const t = TECH_DEFS[tech];
  if (!b.complete || t.building !== b.type) return false;
  const why = researchBlock(w, b.owner, tech);
  if (why) {
    w.events.push({ type: 'error', owner: b.owner, message: why });
    return false;
  }
  return queueItem(w, b, t.cost, { tech, progress: 0 });
}

function queueItem(w: World, b: Building, cost: Cost, item: Building['queue'][number]): boolean {
  if (b.queue.length >= economy.queueLimit) {
    w.events.push({ type: 'error', owner: b.owner, message: 'Queue is full' });
    return false;
  }
  if (!canAfford(w, b.owner, cost)) {
    const short = Object.entries(cost).find(([k, v]) => w.players[b.owner].resources[k as ResourceKind] < (v ?? 0));
    w.events.push({ type: 'error', owner: b.owner, message: `Not enough ${short?.[0] ?? 'resources'}` });
    return false;
  }
  pay(w, b.owner, cost);
  b.queue.push(item);
  return true;
}

const itemCost = (q: Building['queue'][number]): Cost => (q.unit ? UNIT_DEFS[q.unit].cost : q.tech ? TECH_DEFS[q.tech].cost : {});

/** Removes a queued unit or tech and refunds it in full. */
export function cancelQueued(w: World, b: Building, index: number): void {
  const item = b.queue[index];
  if (!item) return;
  b.queue.splice(index, 1);
  pay(w, b.owner, item.cost ?? itemCost(item), -1);
  if (index === 0) b.housed = false;
}

export function productionTick(w: World): void {
  for (const b of w.buildings()) {
    if (!b.complete || !b.queue.length) continue;
    const head = b.queue[0];
    const p = w.players[b.owner];
    if (head.tech) {
      head.progress += DT / TECH_DEFS[head.tech].time;
      if (head.progress < 1) continue;
      b.queue.shift();
      completeTech(w, b.owner, head.tech);
      continue;
    }
    const unit = head.unit!;
    const udef = UNIT_DEFS[unit];
    if (p.pop + udef.pop > p.popCap) {
      if (!b.housed) w.events.push({ type: 'error', owner: b.owner, message: 'Need more houses' });
      b.housed = true;
      continue;
    }
    b.housed = false;
    head.progress += DT / trainTime(w, b.owner, unit, b.type);
    if (head.progress < 1) continue;
    b.queue.shift();
    const u = spawnFrom(w, b, unit);
    p.pop += udef.pop;
    w.events.push({ type: 'trained', owner: b.owner, id: u.id });
    const again = unitCost(w, b.owner, unit);
    if (b.repeat && b.queue.length === 0 && canAfford(w, b.owner, again)) {
      pay(w, b.owner, again);
      b.queue.push({ unit, progress: 0, cost: again });
    }
  }
}

/** Places a new unit beside the building, on the side facing its rally point, and sends it there. */
function spawnFrom(w: World, b: Building, type: UnitType) {
  const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
  const toward = b.rally ?? { x: cx, y: b.y + b.size + 1 };
  const d = Math.hypot(toward.x - cx, toward.y - cy) || 1;
  const ex = cx + ((toward.x - cx) / d) * (b.size / 2 + 0.8), ey = cy + ((toward.y - cy) / d) * (b.size / 2 + 0.8);
  // Ships slip into the water beside a dock.
  const nav = UNIT_DEFS[type].naval ? WATER : -1;
  const spot = w.grid.nearestWalkable(ex, ey, -1, b.size + 4, nav) ?? { x: Math.floor(cx), y: b.y + b.size };
  const u = w.spawnUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  u.hp = unitStats(w, b.owner, type).hp;
  if (b.rally) {
    const order = b.rally.target && isGatherer(u) ? gatherOrder(w, b.rally.target) : null;
    setOrder(u, order ?? { type: 'move', x: b.rally.x, y: b.rally.y });
  }
  return u;
}

// ---------- market ----------

/** Gold per 100 units changes by this much with each trade. */
const PRICE_STEP = 3;
/** Selling returns this share of the buying price (the merchant's cut). */
const SELL_SHARE = 0.7;
const PRICE_MIN = 20, PRICE_MAX = 400;

/** Where prices settle back to, and how often they move a step back toward it. */
const PRICE_BASE = { food: 100, wood: 100, stone: 130 } as const;
const PRICE_DRIFT_TICKS = 50;

/** Market prices recover toward their base over time (a step every 5 seconds). */
export function marketDrift(w: World): void {
  if (w.tick === 0 || w.tick % PRICE_DRIFT_TICKS !== 0) return;
  for (const p of w.players)
    for (const k of ['food', 'wood', 'stone'] as const) {
      const d = PRICE_BASE[k] - p.market[k];
      if (d) p.market[k] += Math.sign(d);
    }
}

export function sellPrice(w: World, owner: number, res: 'food' | 'wood' | 'stone'): number {
  return Math.floor(w.players[owner].market[res] * (w.players[owner].mods.sellShare ?? SELL_SHARE));
}

/** Buys or sells 100 of a commodity for gold at a Market; prices move with each trade. */
export function trade(w: World, owner: number, action: 'buy' | 'sell', res: 'food' | 'wood' | 'stone'): boolean {
  const p = w.players[owner];
  const price = p.market[res];
  if (action === 'buy') {
    if (p.resources.gold < price) {
      w.events.push({ type: 'error', owner, message: 'Not enough gold' });
      return false;
    }
    p.resources.gold -= price;
    p.resources[res] += 100;
    p.market[res] = Math.min(PRICE_MAX, price + PRICE_STEP);
  } else {
    if (p.resources[res] < 100) {
      w.events.push({ type: 'error', owner, message: `Not enough ${res}` });
      return false;
    }
    p.resources[res] -= 100;
    p.resources.gold += sellPrice(w, owner, res);
    p.market[res] = Math.max(PRICE_MIN, price - PRICE_STEP);
  }
  return true;
}
