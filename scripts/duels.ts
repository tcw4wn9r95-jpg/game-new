// Equal-cost battles between every pair of land units, for balance audits.
// Each side gets about BUDGET resources' worth of one unit type, the two
// armies meet on an open field, and the result is reported as the share of the
// winner's army value left standing (+ for the row unit, - for the column).
// Usage: node dist-scripts/duels.mjs [none|full] [budget]
import type { UnitType } from '../src/sim/entities';
import { UNIT_DEFS } from '../src/sim/entities';
import { completeTech, type TechId } from '../src/sim/techs';
import type { GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

const TYPES = (process.env.UNITS?.split(',') as UnitType[]) ?? [
  'militia', 'spearman', 'archer', 'skirmisher', 'scout', 'knight', 'horse_archer', 'claymore', 'arbalest_guard', 'iron_bear',
];
const level = process.argv[2] ?? 'none';
const BUDGET = Number(process.argv[3] ?? 1200);
const FULL: TechId[] = ['age2', 'age3', 'forging', 'iron_casting', 'fletching', 'bodkin_arrow', 'scale_mail', 'chain_mail', 'scale_barding', 'chain_barding', 'padded_archer', 'leather_archer', 'swordsman', 'pikeman', 'crossbowman', 'light_cavalry'];

const value = (t: UnitType) => Object.values(UNIT_DEFS[t].cost).reduce((a, b) => a + (b ?? 0), 0);

function field(): GameMap {
  const size = 64;
  return { type: 'heartland', sizeName: 'skirmish', seed: 1, size, terrain: new Uint8Array(size * size), elevation: new Uint8Array(size * size), feature: new Uint8Array(size * size), amount: new Uint16Array(size * size), animals: [], starts: [{ x: 4, y: 32 }, { x: 60, y: 32 }] };
}

/** Fights a battle; returns the row side's surviving value share minus the column side's. */
function battle(a: UnitType, b: UnitType): number {
  const w = new World(field(), { spawnStarts: false });
  for (const p of [0, 1]) {
    w.fog[p].revealAll();
    if (level === 'full') for (const t of FULL) completeTech(w, p, t);
  }
  const army = (t: UnitType, owner: number, x: number) => {
    const n = Math.max(1, Math.round(BUDGET / value(t)));
    return Array.from({ length: n }, (_, k) => w.spawnUnit(t, owner, x + (k % 4) * 0.9 * (owner ? 1 : -1), 26 + Math.floor(k / 4) * 1.1));
  };
  const A = army(a, 0, 24), B = army(b, 1, 40);
  // Both armies charge; then they fight whatever is nearest (stance aggressive).
  w.issue(0, { type: 'attack', ids: A.map((u) => u.id), id: B[0].id });
  w.issue(1, { type: 'attack', ids: B.map((u) => u.id), id: A[0].id });
  const alive = (us: typeof A) => us.filter((u) => w.get(u.id));
  for (let t = 0; t < 180 * TICK_RATE; t++) {
    w.step();
    if (!alive(A).length || !alive(B).length) break;
  }
  const left = (us: typeof A) => alive(us).reduce((s, u) => s + u.hp / w.players[u.owner].mods.units[u.type].hp, 0) / us.length;
  return left(A) - left(B);
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
console.log(`Equal-cost battles (${BUDGET} resources a side, upgrades: ${level}). Cell: row's surviving strength minus column's, in %.`);
console.log(pad('', 15) + TYPES.map((t) => pad(t.slice(0, 7), 8)).join(''));
for (const a of TYPES) {
  const row = TYPES.map((b) => (a === b ? '   ·    ' : pad(String(Math.round(battle(a, b) * 100)).padStart(5), 8)));
  console.log(pad(a, 15) + row.join(''));
}
