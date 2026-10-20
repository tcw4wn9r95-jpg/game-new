import { describe, expect, it } from 'vitest';
import { damageOf } from '../src/sim/combat';
import { completeTech, unitStats } from '../src/sim/techs';
import { UNIT_DEFS, type Unit, type UnitType } from '../src/sim/entities';
import { Feature, type GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

function flatMap(size = 64): GameMap {
  return {
    type: 'heartland',
    sizeName: 'skirmish',
    seed: 7,
    size,
    terrain: new Uint8Array(size * size),
    elevation: new Uint8Array(size * size),
    feature: new Uint8Array(size * size),
    amount: new Uint16Array(size * size),
    animals: [],
    starts: [
      { x: 8, y: 8 },
      { x: 56, y: 56 },
    ],
  };
}

const army = (w: World, type: UnitType, owner: number, x: number, y: number, n = 10): Unit[] =>
  Array.from({ length: n }, (_, k) => w.spawnUnit(type, owner, x + (k % 5) * 0.8, y + Math.floor(k / 5) * 0.8));

const alive = (w: World, owner: number) => [...w.units(owner)];

/**
 * Two armies face off 8 tiles apart and are each ordered to attack; fight to
 * the finish (or 3 minutes). Returns the survivors per side.
 */
function battle(a: UnitType, b: UnitType, seed = 7, na = 10, nb = 10): { a: number; b: number; seconds: number } {
  const map = flatMap();
  map.seed = seed;
  const w = new World(map, { spawnStarts: false });
  const A = army(w, a, 0, 28, 24, na);
  const B = army(w, b, 1, 28, 33, nb);
  w.step();
  // Each soldier engages the enemy nearest to it, as a player's tap would.
  for (const [mine, theirs, p] of [[A, B, 0], [B, A, 1]] as const)
    for (const u of mine) {
      const t = [...theirs].sort((x, y) => Math.hypot(x.x - u.x, x.y - u.y) - Math.hypot(y.x - u.x, y.y - u.y))[0];
      w.issue(p, { type: 'attack', ids: [u.id], id: t.id });
    }
  let s = 0;
  for (; s < 180 * TICK_RATE; s++) {
    w.step();
    if (!alive(w, 0).length || !alive(w, 1).length) break;
  }
  return { a: alive(w, 0).length, b: alive(w, 1).length, seconds: s / TICK_RATE };
}

describe('combat: counters (M4 acceptance)', () => {
  it('10 spearmen beat 10 scouts', () => {
    for (const seed of [1, 2, 3]) {
      const r = battle('spearman', 'scout', seed);
      expect(r.b).toBe(0);
      expect(r.a).toBeGreaterThanOrEqual(3);
    }
  });

  it('10 archers beat 10 militia', () => {
    for (const seed of [1, 2, 3]) {
      const r = battle('archer', 'militia', seed);
      expect(r.b).toBe(0);
      expect(r.a).toBeGreaterThan(0);
    }
  });

  it('10 skirmishers beat 10 archers', () => {
    for (const seed of [1, 2, 3]) {
      const r = battle('skirmisher', 'archer', seed);
      expect(r.b).toBe(0);
      expect(r.a).toBeGreaterThanOrEqual(4);
    }
  });

  it('the rock-paper-scissors runs the other way too', () => {
    // Each unit above loses to what it is weak against.
    expect(battle('militia', 'spearman').b).toBe(0);
    expect(battle('scout', 'archer').b).toBe(0);
    expect(battle('militia', 'skirmisher').b).toBe(0);
    expect(battle('knight', 'archer').b).toBe(0);
    // Knights cost more than twice as much: at equal cost, spearmen win.
    expect(battle('spearman', 'knight', 7, 22, 10).b).toBe(0);
  });

  it('counters stay within the casual band (1.5x to 2.5x)', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const scout = w.spawnUnit('scout', 1, 5, 5);
    const militia = w.spawnUnit('militia', 1, 6, 5);
    const archer = w.spawnUnit('archer', 1, 7, 5);
    // Spear vs scout: 5 x 2.5 - 0 armour.
    expect(damageOf(UNIT_DEFS.spearman, scout)).toBe(12.5);
    // Archer vs militia: 4 x 2 - 1 pierce armour.
    expect(damageOf(UNIT_DEFS.archer, militia)).toBe(7);
    // Skirmisher vs archer: 2 x 3.
    expect(damageOf(UNIT_DEFS.skirmisher, archer)).toBe(6);
    // Never less than 1.
    expect(damageOf(UNIT_DEFS.villager, w.spawnUnit('knight', 1, 8, 5))).toBe(1);
  });

  it('Blacksmith upgrades add flat damage; only line upgrades feed the counter bonus', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const knight = w.spawnUnit('knight', 1, 5, 5);
    const base = damageOf(unitStats(w, 0, 'spearman'), knight, w); // 5 x 2.5 - 2
    expect(base).toBe(10.5);
    completeTech(w, 0, 'forging');
    completeTech(w, 0, 'iron_casting');
    // +2 attack from the Blacksmith: +2 damage, not +5.
    expect(damageOf(unitStats(w, 0, 'spearman'), knight, w)).toBe(12.5);
    // Pikeman: its own +1 is part of the weapon, so it is multiplied.
    completeTech(w, 0, 'pikeman');
    expect(damageOf(unitStats(w, 0, 'spearman'), knight, w)).toBe(15);
  });
});

describe('combat: behaviour', () => {
  it('militia knock down a house, which frees its tiles', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const house = w.placeBuilding('house', 1, 30, 30, true);
    const m = army(w, 'militia', 0, 26, 26, 5);
    w.issue(0, { type: 'attack', ids: m.map((u) => u.id), id: house.id });
    for (let s = 0; s < 120 * TICK_RATE && w.get(house.id); s++) w.step();
    expect(w.get(house.id)).toBeUndefined();
    expect(w.grid.isWalkable(30, 30)).toBe(true);
  });

  it('idle aggressive units engage enemies in sight; passive villagers do not', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const knight = w.spawnUnit('knight', 0, 20, 20);
    const v = w.spawnUnit('villager', 0, 22, 20);
    const enemy = w.spawnUnit('militia', 1, 22.5, 22);
    for (let s = 0; s < 3 * TICK_RATE; s++) w.step();
    expect(knight.order?.type).toBe('attack');
    expect(v.order).toBeNull();
    for (let s = 0; s < 30 * TICK_RATE; s++) w.step();
    expect(w.get(enemy.id)).toBeUndefined();
  });

  it('stand-ground units hold position; defensive units return to their post', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const guard = w.spawnUnit('spearman', 0, 20.5, 20.5);
    const sentry = w.spawnUnit('spearman', 0, 20.5, 30.5);
    w.issue(0, { type: 'stance', ids: [guard.id], stance: 'defensive' });
    w.issue(0, { type: 'stance', ids: [sentry.id], stance: 'stand' });
    // A scout passes near both and runs off far away.
    const scout = w.spawnUnit('scout', 1, 24.5, 24.5);
    for (let s = 0; s < 2 * TICK_RATE; s++) w.step();
    w.issue(1, { type: 'move', ids: [scout.id], x: 60, y: 60 });
    for (let s = 0; s < 40 * TICK_RATE; s++) w.step();
    expect(Math.hypot(sentry.x - 20.5, sentry.y - 30.5)).toBeLessThan(0.6);
    expect(Math.hypot(guard.x - 20.5, guard.y - 20.5)).toBeLessThan(1.5);
  });

  it('a large group moves across the map on a shared flow field and arrives', () => {
    const map = flatMap();
    // A wall of trees with one gap forces a detour.
    for (let y = 0; y < 64; y++) if (y < 40 || y > 43) (map.feature[y * 64 + 32] = Feature.Tree), (map.amount[y * 64 + 32] = 100);
    const w = new World(map, { spawnStarts: false });
    const g = army(w, 'militia', 0, 10, 10, 20);
    w.issue(0, { type: 'move', ids: g.map((u) => u.id), x: 50, y: 12 });
    w.step();
    expect(g.filter((u) => u.flow).length).toBeGreaterThan(15);
    for (let s = 0; s < 120 * TICK_RATE; s++) w.step();
    const near = g.filter((u) => Math.hypot(u.x - 50, u.y - 12) < 4);
    expect(near.length).toBe(20);
    expect(g.every((u) => u.order === null)).toBe(true);
  });

  it('monks heal wounded allies and convert enemies', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const monk = w.spawnUnit('monk', 0, 20, 20);
    const hurt = w.spawnUnit('militia', 0, 21.5, 20);
    hurt.hp = 10;
    for (let s = 0; s < 15 * TICK_RATE; s++) w.step();
    expect(hurt.hp).toBeGreaterThan(30);
    const foe = w.spawnUnit('spearman', 1, 26, 20);
    foe.stance = 'passive';
    w.issue(0, { type: 'attack', ids: [monk.id], id: foe.id });
    for (let s = 0; s < 12 * TICK_RATE; s++) w.step();
    expect(foe.owner).toBe(0);
  });
});
