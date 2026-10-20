// Saving and loading a match: the whole world (map as it now stands, fog,
// every unit, building and resource, research, projectiles, the clock and the
// random state) as plain JSON-able data. Derived state (navigation grid,
// population, vision, research effects) is rebuilt on load.
import { BUILDING_DEFS, type Entity } from './entities';
import type { Projectile } from './combat';
import { type PlayerState, World } from './world';
import { baseMods, applyEffects, buildingMaxHp } from './techs';
import type { GameMap } from './terrain';
import type { GameMode, ModeState, VictoryReason } from './modes';
import type { ScenarioState } from './scenario';

export const SAVE_VERSION = 1;

type Packed = { t: 'u8' | 'u16' | 'i32'; b: string };

export interface SaveData {
  version: number;
  map: Omit<GameMap, 'terrain' | 'elevation' | 'feature' | 'amount'> & { terrain: Packed; elevation: Packed; feature: Packed; amount: Packed };
  tick: number;
  nextId: number;
  nextProjectileId: number;
  rng: number;
  players: Array<Omit<PlayerState, 'mods'>>;
  fog: Array<{ explored: Packed; revealed: boolean }>;
  entities: Entity[];
  projectiles: Projectile[];
  peaceUntil?: number;
  winner?: number | null;
  /** Per-slot AI difficulty (null for the human), restored by the game. */
  ai?: Array<string | null>;
  mode?: GameMode;
  modeState?: ModeState;
  victoryReason?: VictoryReason | null;
  scenario?: ScenarioState | null;
}

// ---------- typed arrays <-> base64 ----------

function pack(a: Uint8Array | Uint16Array | Int32Array): Packed {
  const t = a instanceof Uint8Array ? 'u8' : a instanceof Uint16Array ? 'u16' : 'i32';
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { t, b: btoa(s) };
}

function unpack(p: Packed): Uint8Array | Uint16Array | Int32Array {
  const s = atob(p.b);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return p.t === 'u8' ? bytes : p.t === 'u16' ? new Uint16Array(bytes.buffer) : new Int32Array(bytes.buffer);
}

/** Private fields of World that a save has to reach. */
interface WorldInternals {
  nextId: number;
  updatePopulation(): void;
  updateVision(): void;
}

// ---------- save ----------

export function saveWorld(w: World): SaveData {
  const m = w.map;
  const entities: Entity[] = [];
  for (const e of w.entities.values()) {
    // Flow fields are shared search results, not state: units re-plan after loading.
    entities.push(e.kind === 'unit' ? { ...e, flow: null, pathPending: false } : e);
  }
  return {
    version: SAVE_VERSION,
    map: {
      type: m.type,
      sizeName: m.sizeName,
      seed: m.seed,
      size: m.size,
      animals: [],
      starts: m.starts,
      terrain: pack(m.terrain),
      elevation: pack(m.elevation),
      feature: pack(m.feature),
      amount: pack(m.amount),
    },
    tick: w.tick,
    nextId: (w as unknown as WorldInternals).nextId,
    nextProjectileId: w.nextProjectileId,
    rng: w.rng.state,
    players: w.players.map(({ mods: _mods, ...p }) => p),
    fog: w.fog.map((f) => ({ explored: pack(f.explored), revealed: f.revealed })),
    entities,
    projectiles: w.projectiles,
    peaceUntil: w.peaceUntil,
    winner: w.winner,
    mode: w.mode,
    modeState: w.modeState,
    victoryReason: w.victoryReason,
    scenario: w.scenario,
  };
}

// ---------- load ----------

export function loadWorld(d: SaveData): World {
  if (d.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${d.version}`);
  const map: GameMap = {
    ...d.map,
    terrain: unpack(d.map.terrain) as Uint8Array,
    elevation: unpack(d.map.elevation) as Uint8Array,
    feature: unpack(d.map.feature) as Uint8Array,
    amount: unpack(d.map.amount) as Uint16Array,
  };
  const w = new World(map, { spawnStarts: false, mode: d.mode ?? 'standard' });
  const inner = w as unknown as WorldInternals;
  w.entities.clear();
  for (const e of d.entities) {
    w.entities.set(e.id, e);
    if (e.kind !== 'building') continue;
    const def = BUILDING_DEFS[e.type];
    if (def.gate) w.grid.setGate(e.x, e.y, e.owner, e.locked);
    w.grid.setBuilding(e.x, e.y, e.size, e.id, !def.walkable);
  }
  w.tick = d.tick;
  inner.nextId = d.nextId;
  w.nextProjectileId = d.nextProjectileId;
  w.rng.state = d.rng;
  w.projectiles = d.projectiles;
  w.peaceUntil = d.peaceUntil ?? 0;
  w.winner = d.winner ?? null;
  w.victoryReason = d.victoryReason ?? null;
  if (d.modeState) w.modeState = d.modeState;
  w.scenario = d.scenario ?? null;
  d.players.forEach((p, i) => {
    const mods = baseMods(p.faction);
    for (const t of p.techs) applyEffects(mods, t);
    Object.assign(w.players[i], p, { mods });
  });
  d.fog.forEach((f, i) => {
    const fog = w.fog[i];
    if (!fog) return;
    fog.explored.set(unpack(f.explored) as Uint8Array);
    if (f.revealed) fog.revealAll();
  });
  // Older saves: buildings finished while construction capped them at base HP (below a
  // faction or research bonus) stand at exactly that value; give them their full health.
  for (const b of w.buildings()) {
    const max = buildingMaxHp(w, b);
    if (b.complete && max > BUILDING_DEFS[b.type].hp && Math.abs(b.hp - BUILDING_DEFS[b.type].hp) < 0.01) b.hp = max;
  }
  inner.updatePopulation();
  inner.updateVision();
  return w;
}
