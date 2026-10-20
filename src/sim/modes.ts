// Game modes and the victories beyond Conquest: Wonders and relics (Standard),
// the King (Regicide) and Banner Sites (Domination). Mode state lives on the
// World as plain data so it saves with the match.
import { TICK_RATE } from './constants';
import { setOrder } from './economy';
import { type Building, type ResourceEntity, UNIT_DEFS, type Unit, distToRect } from './entities';
import { Rng } from './rng';
import { Feature, Terrain } from './terrain';
import type { Goal } from './pathfinding';
import type { World } from './world';
import { scenarioTick } from './scenario';

export type GameMode = 'standard' | 'regicide' | 'domination';
export const GAME_MODES: GameMode[] = ['standard', 'regicide', 'domination'];
export const MODE_NAMES: Record<GameMode, string> = { standard: 'Standard', regicide: 'Regicide', domination: 'Domination' };

export type VictoryReason = 'conquest' | 'wonder' | 'relics' | 'regicide' | 'domination' | 'sites' | 'objectives';
export const VICTORY_TEXT: Record<VictoryReason, string> = {
  conquest: 'by conquest',
  wonder: 'by Wonder',
  relics: 'by holding every relic',
  regicide: 'by slaying the King',
  domination: 'on points',
  sites: 'by holding every site',
  objectives: 'on the objectives',
};

/** Seconds a Wonder or every relic must be held to win. */
export const WONDER_HOLD = 480;
export const RELIC_HOLD = 480;
export const RELIC_COUNT = 5;
/** Gold per second each relic in a Monastery brings in. */
const RELIC_GOLD = 0.5;

/** Domination: capture radius, seconds to capture, points and gold per held site. */
export const SITE_RADIUS = 4;
export const CAPTURE_TIME = 20;
const FORT_SPEEDUP = 1.5;
const SITE_POINTS = 1 / 5;
const SITE_GOLD = 0.3;
/** Seconds holding every site to win outright. */
export const ALL_SITES_HOLD = 180;
export const DOMINATION_TARGET: Record<string, number> = { skirmish: 700, standard: 1000, epic: 1500 };

export interface Site {
  x: number;
  y: number;
  /** Holding player (-1 = neutral). */
  owner: number;
  /** Capture progress (seconds) by `by`. */
  capture: number;
  by: number;
}

export interface ModeState {
  /** Finished Wonders: building id -> match time completed. */
  wonders: Record<number, number>;
  /** The team holding every relic, and since when. */
  relicHold: { team: number; since: number } | null;
  sites: Site[];
  /** Domination points per team. */
  score: number[];
  /** The team holding every site, and since when. */
  siteHold: { team: number; since: number } | null;
}

export function newModeState(players: number): ModeState {
  return { wonders: {}, relicHold: null, sites: [], score: new Array(players).fill(0), siteHold: null };
}

const isKing = (u: Unit) => UNIT_DEFS[u.type].classes.includes('king');

// ---------- setup ----------

/** New match: relics on the map, the Regicide start, Domination sites. */
export function setupMode(w: World): void {
  const rng = new Rng(w.map.seed ^ 0x5eed1e);
  placeRelics(w, rng);
  if (w.mode === 'regicide') w.map.starts.forEach((s, p) => regicideStart(w, p, s.x, s.y));
  if (w.mode === 'domination') placeSites(w);
}

/** Free land tile (no trees, mines or buildings) nearest a point. */
function openLand(w: World, x: number, y: number, maxR = 30): { x: number; y: number } | null {
  const { map, grid } = w;
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx, ty = cy + dy;
        if (!grid.inside(tx, ty)) continue;
        const i = ty * map.size + tx;
        if (map.terrain[i] === Terrain.Deep || map.terrain[i] === Terrain.Shallow || map.feature[i] !== Feature.None || grid.building[i]) continue;
        return { x: tx, y: ty };
      }
  return null;
}

/** Relics where no one starts with an edge: away from every base, about as far from each. */
function placeRelics(w: World, rng: Rng): void {
  const { map } = w;
  const N = map.size;
  const starts = map.starts;
  const placed: Array<{ x: number; y: number }> = [];
  const minBase = N * 0.22, spacing = N * 0.16;
  for (let tries = 0; tries < 4000 && placed.length < RELIC_COUNT; tries++) {
    const loose = tries > 2500;
    const x = rng.int(4, N - 5), y = rng.int(4, N - 5);
    const spot = openLand(w, x, y, 2);
    if (!spot) continue;
    const d = starts.map((s) => Math.hypot(s.x - spot.x, s.y - spot.y));
    if (Math.min(...d) < (loose ? minBase * 0.7 : minBase)) continue;
    if (!loose && Math.max(...d) / Math.min(...d) > 1.3) continue;
    if (placed.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < (loose ? spacing * 0.6 : spacing))) continue;
    placed.push(spot);
  }
  for (const p of placed) w.add<ResourceEntity>({ kind: 'resource', type: 'relic', x: p.x + 0.5, y: p.y + 0.5, amount: 0, carrier: 0, holder: 0 });
}

/** Regicide: a Castle by the Town Center with the King inside, three more villagers and extra stone. */
function regicideStart(w: World, owner: number, sx: number, sy: number): void {
  const N = w.map.size;
  // Toward the middle of the map, a few tiles out from the Town Center.
  const ax = N / 2 - sx, ay = N / 2 - sy, al = Math.hypot(ax, ay) || 1;
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let dy = -10; dy <= 10; dy++)
    for (let dx = -10; dx <= 10; dx++) {
      const x = sx + dx - 2, y = sy + dy - 2;
      const d = Math.hypot(dx, dy);
      if (d < 5.5 || !fits(w, x, y, 4)) continue;
      // Prefer close and to the inside of the map.
      const score = d - ((dx * ax + dy * ay) / al) * 0.4;
      if (score < bd) (bd = score), (best = { x, y });
    }
  const p = w.players[owner];
  p.resources.stone += 300;
  if (best) {
    const castle = w.placeBuilding('castle', owner, best.x, best.y, true);
    const king = w.spawnUnit('king', owner, castle.x + 2, castle.y + 2);
    king.inside = castle.id;
    castle.garrison.push(king.id);
  } else {
    w.spawnUnit('king', owner, sx + 0.5, sy + 3.5);
  }
  for (let k = 0; k < 3; k++) w.spawnUnit('villager', owner, sx - 0.2 + k * 1.2, sy + 3.3);
  w.updatePopulation();
}

/** A footprint of open, dry land. */
function fits(w: World, x: number, y: number, size: number): boolean {
  const { map, grid } = w;
  for (let ty = y - 1; ty <= y + size; ty++)
    for (let tx = x - 1; tx <= x + size; tx++) {
      if (!grid.inside(tx, ty)) return false;
      const i = ty * map.size + tx;
      if (map.terrain[i] === Terrain.Deep || map.terrain[i] === Terrain.Shallow || grid.building[i]) return false;
      // The rim may have trees; the footprint itself must be clear.
      const rim = tx < x || ty < y || tx >= x + size || ty >= y + size;
      if (!rim && map.feature[i] !== Feature.None) return false;
    }
  return true;
}

/** Domination: one site out from each base, the rest contested in the middle ground. */
function placeSites(w: World): void {
  const { map } = w;
  const N = map.size;
  const count = map.sizeName === 'skirmish' ? 3 : 5;
  const c = { x: N / 2, y: N / 2 };
  const wanted: Array<{ x: number; y: number }> = [];
  const starts = map.starts;
  if (starts.length < count) for (const s of starts) wanted.push({ x: s.x + (c.x - s.x) * 0.3, y: s.y + (c.y - s.y) * 0.3 });
  wanted.push(c);
  // Contested ground between neighbouring bases, around the middle.
  const angles = starts.map((s) => Math.atan2(s.y - c.y, s.x - c.x)).sort((a, b) => a - b);
  const r = N * 0.28;
  const gaps = angles.map((a, i) => {
    const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
    return (a + next) / 2;
  });
  for (let k = 0; wanted.length < count && k < gaps.length * 2; k++) {
    const a = gaps[k % gaps.length] + (k >= gaps.length ? Math.PI / gaps.length : 0);
    wanted.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  for (const p of wanted.slice(0, count)) {
    const spot = openLand(w, p.x, p.y, 40);
    if (spot && !w.modeState.sites.some((s) => Math.hypot(s.x - spot.x, s.y - spot.y) < 6))
      w.modeState.sites.push({ x: spot.x + 0.5, y: spot.y + 0.5, owner: -1, capture: 0, by: -1 });
  }
}

// ---------- per tick ----------

export function modeTick(w: World): void {
  relicsFollow(w);
  if (w.tick % TICK_RATE !== 0 || w.winner !== null) return;
  wonderCheck(w);
  relicCheck(w);
  if (w.mode === 'regicide') regicideCheck(w);
  if (w.mode === 'domination') dominationTick(w);
  if (w.scenario) scenarioTick(w);
}

// ---------- Wonders ----------

function wonderCheck(w: World): void {
  const st = w.modeState;
  const standing = new Set<number>();
  for (const b of w.buildings()) {
    if (b.type !== 'wonder' || !b.complete || w.players[b.owner]?.defeated) continue;
    standing.add(b.id);
    if (st.wonders[b.id] === undefined) {
      st.wonders[b.id] = w.time;
      w.events.push({ type: 'mode', owner: b.owner, message: 'Wonder finished', x: b.x + b.size / 2, y: b.y + b.size / 2 });
    }
  }
  for (const id of Object.keys(st.wonders)) if (!standing.has(+id)) delete st.wonders[+id];
  if (w.mode === 'domination') return;
  for (const [id, since] of Object.entries(st.wonders))
    if (w.time - since >= WONDER_HOLD) {
      const b = w.building(+id)!;
      return w.declareWinner(w.players[b.owner].team, 'wonder');
    }
}

/** The leading Wonder's seconds to go, and its owner. */
export function wonderClock(w: World): { owner: number; left: number } | null {
  let best: { owner: number; left: number } | null = null;
  for (const [id, since] of Object.entries(w.modeState.wonders)) {
    const b = w.building(+id);
    if (!b) continue;
    const left = Math.max(0, WONDER_HOLD - (w.time - since));
    if (!best || left < best.left) best = { owner: b.owner, left };
  }
  return best;
}

// ---------- relics ----------

export const isRelic = (e: unknown): e is ResourceEntity => (e as ResourceEntity)?.kind === 'resource' && (e as ResourceEntity).type === 'relic';

export function* relics(w: World): IterableIterator<ResourceEntity> {
  for (const r of w.resources()) if (r.type === 'relic') yield r;
}

/** The relic this monk is carrying. */
export function carried(w: World, u: Unit): ResourceEntity | undefined {
  for (const r of relics(w)) if (r.carrier === u.id) return r;
  return undefined;
}

/** Carried relics go where their monk goes; a fallen monk or Monastery drops them. */
function relicsFollow(w: World): void {
  for (const r of relics(w)) {
    if (r.carrier) {
      const u = w.unit(r.carrier);
      if (u) {
        r.x = u.x;
        r.y = u.y;
        continue;
      }
      r.carrier = 0;
      drop(w, r, r.x, r.y);
    }
    if (r.holder && !w.building(r.holder)) {
      r.holder = 0;
      drop(w, r, r.x, r.y + 2);
    }
  }
}

function drop(w: World, r: ResourceEntity, x: number, y: number): void {
  const spot = w.grid.nearestWalkable(x, y, -1, 8);
  if (spot) (r.x = spot.x + 0.5), (r.y = spot.y + 0.5);
}

const nearestMonastery = (w: World, u: Unit): Building | null => {
  let best: Building | null = null;
  let bd = Infinity;
  for (const b of w.buildings(u.owner)) {
    if (b.type !== 'monastery' || !b.complete) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bd) (bd = d), (best = b);
  }
  return best;
};

/** Where a monk on a relic run is heading: the relic, then the nearest Monastery. */
export function relicGoal(w: World, u: Unit, o: { id: number }): Goal | null {
  const r = w.get(o.id);
  if (!isRelic(r)) return null;
  if (r.carrier === u.id) {
    const b = nearestMonastery(w, u);
    if (!b) return null;
    return { x0: b.x, y0: b.y, x1: b.x + b.size - 1, y1: b.y + b.size - 1, reach: 1 };
  }
  const tx = Math.floor(r.x), ty = Math.floor(r.y);
  return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 1 };
}

export function relicThink(w: World, u: Unit, o: { id: number }, walk: () => void): void {
  const r = w.get(o.id);
  const stop = () => {
    setOrder(u, null);
    u.state = 'idle';
  };
  if (!isRelic(r) || r.holder || (r.carrier && r.carrier !== u.id) || !UNIT_DEFS[u.type].converter) return stop();
  if (r.carrier !== u.id) {
    if (Math.hypot(r.x - u.x, r.y - u.y) > 1.6) return walk();
    // One relic per monk.
    if (carried(w, u)) return stop();
    r.carrier = u.id;
    u.path = null;
    u.repaths = 0;
    if (!nearestMonastery(w, u)) return stop();
    return walk();
  }
  const b = nearestMonastery(w, u);
  if (!b) return stop();
  if (distToRect(u.x, u.y, b.x, b.y, b.size) > 1.2) return walk();
  r.carrier = 0;
  r.holder = b.id;
  r.x = b.x + b.size / 2 + (w.rng.next() - 0.5);
  r.y = b.y + b.size / 2;
  w.events.push({ type: 'mode', owner: u.owner, message: 'Relic secured', x: r.x, y: r.y });
  stop();
}

function relicCheck(w: World): void {
  const st = w.modeState;
  let team: number | null = null;
  let all = true;
  let n = 0;
  for (const r of relics(w)) {
    n++;
    const b = r.holder ? w.building(r.holder) : undefined;
    if (!b) {
      all = false;
      continue;
    }
    const p = w.players[b.owner];
    p.resources.gold += RELIC_GOLD;
    p.gathered.gold += RELIC_GOLD;
    if (team === null) team = p.team;
    else if (team !== p.team) all = false;
  }
  if (!all || !n || team === null) {
    st.relicHold = null;
    return;
  }
  if (!st.relicHold || st.relicHold.team !== team) st.relicHold = { team, since: w.time };
  if (w.mode === 'standard' && w.time - st.relicHold.since >= RELIC_HOLD) w.declareWinner(team, 'relics');
}

// ---------- Regicide ----------

export function kingOf(w: World, player: number): Unit | undefined {
  for (const u of w.units(player)) if (isKing(u)) return u;
  return undefined;
}

function regicideCheck(w: World): void {
  w.players.forEach((p, i) => {
    if (!p.defeated && !kingOf(w, i)) w.defeat(i, 'regicide');
  });
}

// ---------- Domination ----------

const siteTeam = (w: World, s: Site) => (s.owner >= 0 ? w.players[s.owner].team : -1);

function dominationTick(w: World): void {
  const st = w.modeState;
  if (w.peace) return;
  for (const s of st.sites) {
    // Who is standing on it?
    const count = new Map<number, number>();
    for (const u of w.field()) {
      if (w.players[u.owner]?.defeated || Math.hypot(u.x - s.x, u.y - s.y) > SITE_RADIUS) continue;
      count.set(u.owner, (count.get(u.owner) ?? 0) + 1);
    }
    const teams = new Set([...count.keys()].map((p) => w.players[p].team));
    const held = siteTeam(w, s);
    if (teams.size === 1) {
      const team = [...teams][0];
      if (team === held) s.capture = Math.max(0, s.capture - 1);
      else {
        const lead = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        if (s.by < 0 || w.players[s.by].team !== team) (s.by = lead), (s.capture = 0);
        s.capture += fortified(w, s, team) ? FORT_SPEEDUP : 1;
        if (s.capture >= CAPTURE_TIME) {
          s.owner = lead;
          s.capture = 0;
          s.by = -1;
          w.events.push({ type: 'mode', owner: lead, message: 'Site captured', x: s.x, y: s.y });
        }
      }
    } else if (!teams.size) s.capture = Math.max(0, s.capture - 1);
    if (!s.capture) s.by = -1;
    // Points and gold for the holder.
    if (s.owner >= 0) {
      const p = w.players[s.owner];
      if (p.defeated) s.owner = -1;
      else {
        st.score[p.team] = (st.score[p.team] ?? 0) + SITE_POINTS;
        p.resources.gold += SITE_GOLD;
        p.gathered.gold += SITE_GOLD;
      }
    }
  }
  const target = DOMINATION_TARGET[w.map.sizeName] ?? 1000;
  const lead = st.score.reduce((b, v, t) => (v > (st.score[b] ?? -1) ? t : b), 0);
  if (st.score[lead] >= target - 1e-6) return w.declareWinner(lead, 'domination');
  const owners = new Set(st.sites.map((s) => siteTeam(w, s)));
  const all = owners.size === 1 && !owners.has(-1) && st.sites.length ? [...owners][0] : null;
  if (all === null) st.siteHold = null;
  else {
    if (!st.siteHold || st.siteHold.team !== all) st.siteHold = { team: all, since: w.time };
    if (w.time - st.siteHold.since >= ALL_SITES_HOLD) w.declareWinner(all, 'sites');
  }
}

/** A tower or Castle of the capturing side stands by the site. */
function fortified(w: World, s: Site, team: number): boolean {
  for (const b of w.buildings()) {
    if (!b.complete || (b.type !== 'watch_tower' && b.type !== 'castle') || w.players[b.owner]?.team !== team) continue;
    if (distToRect(s.x, s.y, b.x, b.y, b.size) <= SITE_RADIUS + 1) return true;
  }
  return false;
}

export const dominationTarget = (w: World) => DOMINATION_TARGET[w.map.sizeName] ?? 1000;
