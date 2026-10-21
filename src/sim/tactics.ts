// Battle plans for group orders: an escort formation (tough units screen the
// fragile ones, march at the slowest member's pace and turn on anything that
// hits a ward), attacks launched in waves, and falling back when badly hurt.
// Plans ride on move and attack commands, so the human and the AI use them alike.
import { TICK_RATE } from './constants';
import { setOrder } from './economy';
import { UNIT_DEFS, type Unit, canHit, isAir, isShip, navOf } from './entities';
import { unitStats } from './techs';
import type { World } from './world';

export interface Tactics {
  /** loose: everyone goes as they please; escort: screens in front, wards behind, one pace. */
  formation: 'loose' | 'escort';
  /** Attack in this many waves. */
  waves: number;
  /** Badly wounded units fall back to where the order was given. */
  fallback: boolean;
}

export const DEFAULT_TACTICS: Tactics = { formation: 'loose', waves: 1, fallback: false };

/** What a squad (or a wave still to come) was sent to do. */
export type SquadOrder = { kind: 'move'; x: number; y: number } | { kind: 'attack'; id: number; x: number; y: number };

/** A wave waiting its turn: its units hold position until it launches. */
export interface WavePlan {
  owner: number;
  /** Squad id its units carry while they wait. */
  squad: number;
  /** Wave number (2, 3...) for the HUD. */
  index: number;
  /** Launches at this tick at the latest... */
  at: number;
  /** ...or earlier, once the wave ahead of it is down to WAVE_BREAK of its strength. */
  ahead: number;
  aheadSize: number;
  order: SquadOrder;
  tactics: Tactics;
}

/** Seconds between waves. */
export const WAVE_GAP_S = 20;
/** The next wave goes early once the one ahead has lost this share of its units. */
const WAVE_BREAK = 0.4;
/** Below this share of their HP, units under a fall-back plan retreat. */
const FALLBACK_HP = 0.3;
/** How far escorts will go to defend a ward (tiles). */
const ESCORT_REACH = 9;
/** Formation spacing (tiles). */
const GAP = 0.9;

/** Executes a plain order for a group: the move or attack logic of a command, without tactics. */
export type Exec = (units: Unit[], order: SquadOrder) => void;

/** Fragile units (shooters, artillery, medics, engineers) are wards; the rest screen them. */
export function roleOf(u: Unit): 'screen' | 'ward' {
  const d = UNIT_DEFS[u.type];
  if (d.range > 0 || d.healer || d.converter || d.gatherer || d.classes.includes('siege') || d.airOnly) return 'ward';
  return 'screen';
}

/** Clears any battle plan from units given a new, ordinary order. */
export function clearTactics(u: Unit): void {
  u.squad = 0;
  u.role = undefined;
  u.pace = 0;
  u.dest = null;
  u.fallback = null;
}

/**
 * Gives an order under a battle plan: splits the group into waves (the first
 * goes now, the rest wait their turn) and sends the first one off.
 */
export function orderWithTactics(w: World, player: number, units: Unit[], order: SquadOrder, t: Tactics, exec: Exec): void {
  const waves = Math.max(1, Math.min(3, Math.floor(t.waves)));
  if (waves === 1 || units.length < 2) {
    launch(w, player, units, order, t, exec);
    return;
  }
  // Mixed waves: deal units out by type so each wave has a share of everything.
  const sorted = [...units].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
  const groups: Unit[][] = Array.from({ length: waves }, () => []);
  sorted.forEach((u, k) => groups[k % waves].push(u));
  const first = launch(w, player, groups[0], order, t, exec);
  let ahead = first, aheadSize = groups[0].length;
  for (let k = 1; k < waves; k++) {
    if (!groups[k].length) continue;
    const squad = ++w.squadSeq;
    for (const u of groups[k]) {
      setOrder(u, null);
      clearTactics(u);
      u.squad = squad;
      u.state = 'idle';
      u.guard = { x: u.x, y: u.y };
    }
    w.waves.push({ owner: player, squad, index: k + 1, at: w.tick + Math.round(k * WAVE_GAP_S * TICK_RATE), ahead, aheadSize, order, tactics: t });
    ahead = squad;
    aheadSize = groups[k].length;
  }
}

/** Sends a squad off now; returns its squad id. */
function launch(w: World, _player: number, units: Unit[], order: SquadOrder, t: Tactics, exec: Exec): number {
  const squad = ++w.squadSeq;
  const home = centroid(units);
  const land = units.filter((u) => !isShip(u) && !isAir(u));
  if (order.kind === 'move' && t.formation === 'escort' && land.length > 1) {
    const rest = units.filter((u) => !land.includes(u));
    if (rest.length) exec(rest, order);
    const slots = formation(w, land, order.x, order.y);
    for (const [u, s] of slots) exec([u], { kind: 'move', x: s.x, y: s.y });
  } else exec(units, order);
  // The slowest marcher sets the pace for the escort.
  const pace = t.formation === 'escort' && land.length > 1 ? Math.min(...land.map((u) => unitStats(w, u.owner, u.type).speed)) : 0;
  for (const u of units) {
    u.squad = squad;
    u.role = t.formation === 'escort' ? roleOf(u) : undefined;
    u.pace = isAir(u) || isShip(u) ? 0 : pace;
    u.dest = order.kind === 'move' && u.order?.type === 'move' ? { x: u.order.x, y: u.order.y } : null;
    u.fallback = t.fallback ? home : null;
  }
  return squad;
}

function centroid(units: Unit[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const u of units) (x += u.x / units.length), (y += u.y / units.length);
  return { x, y };
}

/**
 * Escort formation slots facing the way the group is going: screens in the
 * front rows (toughest first), wards in the rows behind them.
 */
export function formation(w: World, units: Unit[], x: number, y: number): Array<[Unit, { x: number; y: number }]> {
  const c = centroid(units);
  let dx = x - c.x, dy = y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) (dx = Math.SQRT1_2), (dy = Math.SQRT1_2);
  else (dx /= len), (dy /= len);
  const px = -dy, py = dx;
  const hp = (u: Unit) => unitStats(w, u.owner, u.type).hp;
  const screens = units.filter((u) => roleOf(u) === 'screen').sort((a, b) => hp(b) - hp(a));
  const wards = units.filter((u) => roleOf(u) === 'ward').sort((a, b) => hp(b) - hp(a));
  const width = Math.max(3, Math.ceil(Math.sqrt(units.length) * 1.3));
  const out: Array<[Unit, { x: number; y: number }]> = [];
  let row = 0;
  const place = (list: Unit[], back: number) => {
    for (let k = 0; k < list.length; k += width) {
      const line = list.slice(k, k + width);
      const along = GAP - row * GAP - back;
      line.forEach((u, i) => {
        const side = (i - (line.length - 1) / 2) * GAP;
        out.push([u, { x: x + dx * along + px * side, y: y + dy * along + py * side }]);
      });
      row++;
    }
  };
  place(screens, 0);
  place(wards, screens.length ? GAP * 0.6 : 0);
  // Keep every slot on ground the unit can stand on.
  return out.map(([u, s]) => {
    const nav = navOf(u);
    const region = w.grid.component(Math.floor(u.x), Math.floor(u.y), nav);
    if (w.grid.isWalkable(Math.floor(s.x), Math.floor(s.y), nav) && w.grid.component(Math.floor(s.x), Math.floor(s.y), nav) === region) return [u, s];
    const near = w.grid.nearestWalkable(s.x, s.y, region, 6, nav);
    return [u, near ? { x: near.x + 0.5, y: near.y + 0.5 } : s];
  });
}

/** Per-tick: launches waves that are due, turns escorts on threats to their wards, sends the wounded back, and resumes marches. */
export function tacticsTick(w: World, exec: (player: number) => Exec): void {
  if (w.waves.length) {
    const due: WavePlan[] = [];
    w.waves = w.waves.filter((p) => {
      const ahead = [...w.units(p.owner)].filter((u) => u.squad === p.ahead).length;
      const go = w.tick >= p.at || ahead <= p.aheadSize * WAVE_BREAK;
      if (go) due.push(p);
      return !go;
    });
    for (const p of due) {
      const units = [...w.units(p.owner)].filter((u) => u.squad === p.squad && !u.inside);
      if (!units.length) continue;
      let order = p.order;
      // The target is gone: head for where it stood and fight whatever is there.
      if (order.kind === 'attack' && !w.get(order.id)) order = { kind: 'move', x: order.x, y: order.y };
      const id = launch(w, p.owner, units, order, p.tactics, exec(p.owner));
      // The waves behind this one now follow it.
      for (const q of w.waves) if (q.ahead === p.squad) q.ahead = id;
    }
  }
  if (w.tick % 5) return;
  const squads = new Map<number, Unit[]>();
  for (const u of w.field()) {
    if (!u.squad) continue;
    let s = squads.get(u.squad);
    if (!s) squads.set(u.squad, (s = []));
    s.push(u);
  }
  for (const members of squads.values()) {
    for (const u of members) {
      // Falling back: once, when badly hurt.
      if (u.fallback && u.hp < unitStats(w, u.owner, u.type).hp * FALLBACK_HP) {
        const to = u.fallback;
        u.fallback = null;
        u.dest = null;
        u.pace = 0;
        u.role = 'retreat';
        exec(u.owner)([u], { kind: 'move', x: to.x, y: to.y });
        continue;
      }
      // Escorts defend a ward that has just been hit.
      if (u.role === 'ward' && u.attackedAt >= w.tick - TICK_RATE * 2) {
        const a = w.unit(u.attackedBy);
        if (!a || !w.canFight(u.owner, a.owner)) continue;
        for (const s of members) {
          if (s.role !== 'screen' || Math.hypot(s.x - u.x, s.y - u.y) > ESCORT_REACH) continue;
          // Free to help: marching, idle, or busy with a fight of its own choosing.
          if (s.order && s.order.type !== 'move' && !(s.order.type === 'attack' && s.order.auto)) continue;
          if (!canHit(unitStats(w, s.owner, s.type), a)) continue;
          // A duty, not a whim: held to like an order (even by stand-ground escorts).
          setOrder(s, { type: 'attack', id: a.id });
        }
      }
    }
    // Back on the march once the fight is over.
    for (const u of members) {
      if (!u.dest) continue;
      if (Math.hypot(u.x - u.dest.x, u.y - u.dest.y) < 1.2) {
        u.dest = null;
        u.pace = 0;
        continue;
      }
      if (!u.order) setOrder(u, { type: 'move', x: u.dest.x, y: u.dest.y });
    }
  }
}

/** Waves still to come for a squad (for the HUD): its number and seconds to launch. */
export function pendingWave(w: World, squad: number): { index: number; seconds: number } | null {
  const p = w.waves.find((q) => q.squad === squad);
  return p ? { index: p.index, seconds: Math.max(0, Math.ceil((p.at - w.tick) / TICK_RATE)) } : null;
}
