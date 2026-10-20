import { describe, expect, it } from 'vitest';
import { placeWall, wallLine } from '../src/sim/fortify';
import { buildingMaxHp } from '../src/sim/techs';
import type { GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

function flatMap(size = 48): GameMap {
  return {
    type: 'heartland',
    sizeName: 'skirmish',
    seed: 1,
    size,
    terrain: new Uint8Array(size * size),
    elevation: new Uint8Array(size * size),
    feature: new Uint8Array(size * size),
    amount: new Uint16Array(size * size),
    animals: [],
    starts: [{ x: 8, y: 8 }, { x: 40, y: 40 }],
  };
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s * TICK_RATE; i++) w.step();
};
const rich = (w: World, p: number) => {
  w.players[p].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
  w.players[p].age = 3;
  w.fog[p].revealAll();
};
/** Finishes every foundation of a player at once. */
const finish = (w: World, p: number) => {
  for (const b of w.buildings(p))
    if (!b.complete) {
      b.complete = true;
      b.progress = 1;
      b.hp = buildingMaxHp(w, b);
    }
};

describe('walls and gates (M6 acceptance)', () => {
  it('units route through their own gate and cannot pass an enemy wall', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    // A stone wall across the whole map at x = 24, with a gate at y = 24.
    placeWall(w, 0, 'stone', wallLine(24, 0, 24, 47).map((t) => ({ ...t, gate: t.y === 24 })));
    finish(w, 0);
    const mine = w.spawnUnit('militia', 0, 10.5, 10.5);
    const theirs = w.spawnUnit('militia', 1, 10.5, 30.5);
    w.issue(0, { type: 'move', ids: [mine.id], x: 40.5, y: 10.5 });
    w.issue(1, { type: 'move', ids: [theirs.id], x: 40.5, y: 30.5 });
    run(w, 60);
    expect(Math.hypot(mine.x - 40.5, mine.y - 10.5)).toBeLessThan(1);
    expect(theirs.x).toBeLessThan(24);
  });

  it('a closed wall ring makes the town unreachable for enemy land units without siege', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    const tc = w.placeBuilding('town_center', 0, 20, 20, true);
    // Ring of stone wall around the Town Center, 3 tiles out.
    const ring = [...wallLine(16, 16, 28, 16), ...wallLine(28, 16, 28, 28), ...wallLine(28, 28, 16, 28), ...wallLine(16, 28, 16, 16)];
    placeWall(w, 0, 'stone', ring);
    finish(w, 0);
    expect(w.grid.component(10, 10, 1)).not.toBe(w.grid.component(22, 18, 1));
    const raiders = Array.from({ length: 6 }, (_, k) => w.spawnUnit('knight', 1, 4.5 + k, 4.5));
    w.issue(1, { type: 'attack', ids: raiders.map((u) => u.id), id: tc.id });
    run(w, 60);
    expect(tc.hp).toBe(buildingMaxHp(w, tc));
    for (const r of raiders) expect(r.x < 16 || r.y < 16 || r.x > 29 || r.y > 29).toBe(true);
  });

  it('a locked gate closes even to its owner', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    placeWall(w, 0, 'stone', wallLine(24, 0, 24, 47).map((t) => ({ ...t, gate: t.y === 24 })));
    finish(w, 0);
    const gate = [...w.buildings(0)].find((b) => b.type === 'gate')!;
    w.issue(0, { type: 'lockGate', id: gate.id, locked: true });
    w.step();
    expect(w.grid.isWalkable(24, 24, 0)).toBe(false);
    w.issue(0, { type: 'lockGate', id: gate.id, locked: false });
    w.step();
    expect(w.grid.isWalkable(24, 24, 0)).toBe(true);
    expect(w.grid.isWalkable(24, 24, 1)).toBe(false);
  });

  it('wall lines snap to straight or 45 degree lines', () => {
    expect(wallLine(0, 0, 5, 1)).toEqual([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })));
    expect(wallLine(0, 0, 4, 3)).toEqual([0, 1, 2, 3, 4].map((k) => ({ x: k, y: k })));
    expect(wallLine(3, 3, 3, 0)).toHaveLength(4);
  });

  it('villagers build a whole wall line, nearest segment first', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    const v = [0, 1, 2].map((k) => w.spawnUnit('villager', 0, 18.5 + k, 20.5));
    w.issue(0, { type: 'buildWall', ids: v.map((u) => u.id), kind: 'palisade', tiles: wallLine(20, 22, 30, 22) });
    run(w, 60);
    const segs = [...w.buildings(0)].filter((b) => b.type === 'palisade_wall');
    expect(segs).toHaveLength(11);
    expect(segs.every((b) => b.complete)).toBe(true);
    expect(w.players[0].resources.wood).toBe(9999 - 22);
  });
});

describe('towers, garrisons and repair', () => {
  it('a watch tower shoots approaching enemies, harder with a garrison', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    const tower = w.placeBuilding('watch_tower', 0, 24, 24, true);
    const vs = [0, 1, 2, 3].map((k) => w.spawnUnit('villager', 0, 25.5 + k * 0.3, 26.5));
    w.issue(0, { type: 'garrison', ids: vs.map((u) => u.id), id: tower.id });
    run(w, 5);
    expect(tower.garrison).toHaveLength(4);
    expect(vs.every((u) => u.inside === tower.id)).toBe(true);
    const foe = w.spawnUnit('archer', 1, 30.5, 24.5);
    foe.stance = 'passive';
    run(w, 12);
    expect(w.get(foe.id)).toBeUndefined();
    // Ungarrison puts them back outside.
    w.issue(0, { type: 'ungarrison', id: tower.id });
    w.step();
    expect(vs.every((u) => u.inside === 0)).toBe(true);
  });

  it('villagers repair damaged buildings for half the cost per HP', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    const wall = w.placeBuilding('stone_wall', 0, 24, 24, true);
    wall.hp = 900;
    const v = w.spawnUnit('villager', 0, 22.5, 24.5);
    w.issue(0, { type: 'help', ids: [v.id], id: wall.id });
    run(w, 40);
    expect(wall.hp).toBe(1800);
    // 900 HP of an 1800-HP, 5-stone wall at half price: 1.25 stone.
    expect(9999 - w.players[0].resources.stone).toBeCloseTo(1.25, 1);
  });

  it('destroying a building lets its garrison out', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    rich(w, 0);
    const tower = w.placeBuilding('watch_tower', 0, 24, 24, true);
    const v = w.spawnUnit('villager', 0, 25.5, 25.5);
    w.issue(0, { type: 'garrison', ids: [v.id], id: tower.id });
    run(w, 3);
    expect(v.inside).toBe(tower.id);
    w.remove(tower.id);
    expect(v.inside).toBe(0);
    expect(w.grid.isWalkable(Math.floor(v.x), Math.floor(v.y))).toBe(true);
  });
});

describe('gates', () => {
  it('a gate can be set into an existing wall, replacing that segment', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    w.players[0].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
    w.players[0].age = 3;
    w.fog[0].revealAll();
    placeWall(w, 0, 'stone', wallLine(20, 10, 20, 30));
    const v = w.spawnUnit('villager', 0, 18.5, 20.5);
    expect(w.canPlace('gate', 0, 20, 20)).toBe(true);
    expect(w.canPlace('palisade_gate', 0, 20, 20)).toBe(false);
    w.issue(0, { type: 'build', ids: [v.id], building: 'gate', x: 20, y: 20 });
    w.step();
    const at = w.building(w.grid.building[20 * 48 + 20])!;
    expect(at.type).toBe('gate');
    expect([...w.buildings(0)].filter((b) => b.type === 'stone_wall')).toHaveLength(20);
  });
});

describe('the town bell', () => {
  /** A Town Center, a tower, a grove of trees and villagers chopping it. */
  function village(n: number) {
    const map = flatMap();
    for (let y = 6; y < 16; y++)
      for (let x = 30; x < 34; x++) {
        map.feature[y * map.size + x] = 1;
        map.amount[y * map.size + x] = 200;
      }
    const w = new World(map, { spawnStarts: false });
    rich(w, 0);
    const tc = w.placeBuilding('town_center', 0, 8, 8, true);
    const tower = w.placeBuilding('watch_tower', 0, 24, 8, true);
    const vs = Array.from({ length: n }, (_, k) => w.spawnUnit('villager', 0, 26.5 + (k % 4) * 0.7, 9.5 + Math.floor(k / 4) * 0.7));
    vs.forEach((v, k) => w.issue(0, { type: 'gather', ids: [v.id], target: { kind: 'tile', x: 30 + (k % 2), y: 6 + (k % 10) } }));
    run(w, 20);
    return { w, tc, tower, vs };
  }

  it('sends every villager into shelter, then back to what they were doing', () => {
    const { w, tc, tower, vs } = village(18);
    expect(vs.every((v) => v.order?.type === 'gather' || v.order?.type === 'dropoff')).toBe(true);
    w.issue(0, { type: 'bell', on: true });
    run(w, 40);
    expect(w.players[0].bell).toBe(true);
    expect(vs.every((v) => v.inside === tc.id || v.inside === tower.id)).toBe(true);
    // The nearest shelter (the tower, by the trees) fills first.
    expect(tower.garrison).toHaveLength(5);
    expect(tc.garrison).toHaveLength(13);
    w.issue(0, { type: 'bell', on: false });
    run(w, 1);
    expect(vs.every((v) => !v.inside)).toBe(true);
    expect(tc.garrison).toHaveLength(0);
    run(w, 30);
    // Back to chopping wood.
    const wood = vs.filter((v) => (v.order?.type === 'gather' && v.order.res === 'wood') || (v.order?.type === 'dropoff' && v.carry?.res === 'wood'));
    expect(wood.length).toBe(18);
  });

  it('villagers with no room crowd round the Town Center', () => {
    const { w, tc, vs } = village(24);
    w.issue(0, { type: 'bell', on: true });
    run(w, 40);
    const out = vs.filter((v) => !v.inside);
    expect(out).toHaveLength(4);
    for (const v of out) expect(Math.hypot(v.x - (tc.x + 1.5), v.y - (tc.y + 1.5))).toBeLessThan(6);
  });

  it('survives a save while ringing', async () => {
    const { loadWorld, saveWorld } = await import('../src/sim/save');
    const { w } = village(6);
    w.issue(0, { type: 'bell', on: true });
    run(w, 30);
    const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
    expect(back.players[0].bell).toBe(true);
    back.issue(0, { type: 'bell', on: false });
    for (let i = 0; i < 30 * TICK_RATE; i++) back.step();
    const vs = [...back.units(0)];
    expect(vs.every((v) => !v.inside && v.order?.type !== undefined)).toBe(true);
  });
});

describe('construction', () => {
  it('finishes buildings at full health even with HP bonuses (Mountain Throne)', () => {
    const w = new World(flatMap(), { spawnStarts: false, factions: ['mountain', 'steppe'] });
    rich(w, 0);
    const v = w.spawnUnit('villager', 0, 12.5, 12.5);
    w.issue(0, { type: 'build', ids: [v.id], building: 'house', x: 14, y: 12 });
    run(w, 60);
    const house = [...w.buildings(0)].find((b) => b.type === 'house')!;
    expect(house.complete).toBe(true);
    expect(buildingMaxHp(w, house)).toBeGreaterThan(550);
    expect(house.hp).toBe(buildingMaxHp(w, house));
  });
});
