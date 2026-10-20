import { describe, expect, it } from 'vitest';
import { findResource } from '../src/sim/economy';
import type { GatherTarget, Unit } from '../src/sim/entities';
import { NavGrid } from '../src/sim/grid';
import { generateMap } from '../src/sim/mapgen';
import { Pathfinder } from '../src/sim/pathfinding';
import { Feature, type GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

/** Flat all-grass test map. */
function flatMap(size = 40): GameMap {
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
    starts: [{ x: 8, y: 8 }],
  };
}

function setFeature(map: GameMap, x: number, y: number, f: number, amount: number) {
  map.feature[y * map.size + x] = f;
  map.amount[y * map.size + x] = amount;
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) w.step();
};

const villagers = (w: World, owner = 0) => [...w.units(owner)].filter((u) => u.type === 'villager');

describe('pathfinding', () => {
  it('routes around a wall and refuses unreachable goals', () => {
    const map = flatMap(30);
    for (let y = 0; y < 25; y++) setFeature(map, 15, y, Feature.Tree, 100);
    const grid = new NavGrid(map);
    const pf = new Pathfinder(grid);
    const path = pf.find(5, 5, { x0: 25, y0: 5, x1: 25, y1: 5, reach: 0 })!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual({ x: 25.5, y: 5.5 });
    // The route must pass below the wall's end.
    expect(path.some((p) => p.y > 25)).toBe(true);

    for (let y = 25; y < 30; y++) setFeature(map, 15, y, Feature.Tree, 100);
    const sealed = new Pathfinder(new NavGrid(map));
    expect(sealed.find(5, 5, { x0: 25, y0: 5, x1: 25, y1: 5, reach: 0 })).toBeNull();
    expect(sealed.lastExpanded).toBe(0); // rejected by the region check, no search
  });

  it('reaches a tile next to a blocked target', () => {
    const map = flatMap(20);
    setFeature(map, 10, 10, Feature.Gold, 800);
    const pf = new Pathfinder(new NavGrid(map));
    const path = pf.find(2, 2, { x0: 10, y0: 10, x1: 10, y1: 10, reach: 1 })!;
    const end = path.at(-1)!;
    expect(Math.max(Math.abs(end.x - 10.5), Math.abs(end.y - 10.5))).toBeLessThanOrEqual(1);
  });
});

describe('starting position', () => {
  it('gives every player a Town Center, 3 villagers and a scout', () => {
    const w = new World(generateMap({ type: 'heartland', size: 'skirmish', players: 2, seed: 4 }));
    for (const p of [0, 1]) {
      expect([...w.buildings(p)].map((b) => b.type)).toEqual(['town_center']);
      expect(villagers(w, p)).toHaveLength(3);
      expect([...w.units(p)].filter((u) => u.type === 'scout')).toHaveLength(1);
      expect(w.players[p].pop).toBe(4);
      expect(w.players[p].popCap).toBe(5);
      expect(w.players[p].resources).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    }
  });
});

describe('gathering', () => {
  it('carries resources to the Town Center and conserves every unit', () => {
    const map = flatMap();
    for (let k = 0; k < 4; k++) setFeature(map, 16 + k, 8, Feature.Berries, 125);
    const w = new World(map);
    const [v] = villagers(w);
    w.issue(0, { type: 'gather', ids: [v.id], target: { kind: 'tile', x: 16, y: 8 } });
    run(w, 120);
    const p = w.players[0];
    const taken = 500 - [16, 17, 18, 19].reduce((a, x) => a + map.amount[8 * map.size + x], 0);
    expect(p.gathered.food).toBeGreaterThan(20);
    expect(taken).toBe(p.gathered.food + (v.carry?.amount ?? 0));
    expect(p.resources.food).toBe(200 + p.gathered.food);
  });

  it('moves on to the next tree when one is felled, and frees its tile', () => {
    const map = flatMap();
    setFeature(map, 14, 8, Feature.Tree, 10);
    setFeature(map, 15, 8, Feature.Tree, 100);
    const w = new World(map);
    const [v] = villagers(w);
    w.issue(0, { type: 'gather', ids: [v.id], target: { kind: 'tile', x: 14, y: 8 } });
    run(w, 90);
    expect(map.feature[8 * map.size + 14]).toBe(Feature.None);
    expect(w.grid.isWalkable(14, 8)).toBe(true);
    expect(map.amount[8 * map.size + 15]).toBeLessThan(100);
  });

  it('builds a house: pays, takes time, then raises the population cap', () => {
    const w = new World(flatMap());
    const [v] = villagers(w);
    w.issue(0, { type: 'build', ids: [v.id], building: 'house', x: 14, y: 14 });
    w.step();
    expect(w.players[0].resources.wood).toBe(170);
    const house = [...w.buildings(0)].find((b) => b.type === 'house')!;
    expect(house.complete).toBe(false);
    run(w, 40);
    expect(house.complete).toBe(true);
    expect(w.players[0].popCap).toBe(10);
  });

  it('rejects building on resources or without the wood', () => {
    const map = flatMap();
    setFeature(map, 20, 20, Feature.Tree, 100);
    const w = new World(map);
    const [v] = villagers(w);
    w.issue(0, { type: 'build', ids: [v.id], building: 'house', x: 19, y: 19 });
    w.players[0].resources.wood = 10;
    w.issue(0, { type: 'build', ids: [v.id], building: 'lumber_camp', x: 25, y: 25 });
    w.step();
    expect([...w.buildings(0)]).toHaveLength(1);
    expect(w.drainEvents().filter((e) => e.type === 'error')).toHaveLength(2);
  });

  it('sends builders of a lumber camp straight to the nearby trees, dropping wood there', () => {
    const map = flatMap();
    for (let x = 25; x < 31; x++) for (let y = 23; y < 27; y++) setFeature(map, x, y, Feature.Tree, 100);
    const w = new World(map);
    const vs = villagers(w);
    w.issue(0, { type: 'build', ids: vs.map((v) => v.id), building: 'lumber_camp', x: 22, y: 23 });
    run(w, 150);
    const camp = [...w.buildings(0)].find((b) => b.type === 'lumber_camp')!;
    expect(camp.complete).toBe(true);
    expect(vs.every((v) => v.order?.type === 'gather' || v.order?.type === 'dropoff')).toBe(true);
    expect(w.players[0].gathered.wood).toBeGreaterThan(50);
  });
});

describe('M2 acceptance', () => {
  it('30 villagers gather for 10 sim-minutes without getting stuck', () => {
    const map = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 2024 });
    const w = new World(map);
    const tc = [...w.buildings(0)][0];
    const cx = tc.x + 2, cy = tc.y + 2;
    for (let k = villagers(w).length; k < 30; k++) w.spawnUnit('villager', 0, cx + (k % 6) - 3 + 0.5, tc.y + 5 + Math.floor(k / 6) * 0.8);
    const vs = villagers(w);
    expect(vs).toHaveLength(30);

    const probe = vs[0];
    const jobs: Array<[number, Parameters<typeof findResource>[2]]> = [
      [10, ['tree']],
      [6, ['gold']],
      [4, ['stone']],
      [6, ['berries']],
      [4, ['sheep', 'deer']],
    ];
    let next = 0;
    const foodJob = new Set<number>();
    const berryJob = new Set<number>();
    for (const [count, sources] of jobs) {
      const t = findResource(w, probe, sources, cx, cy, 40) as GatherTarget;
      expect(t).not.toBeNull();
      const ids = vs.slice(next, next + count).map((v) => v.id);
      if (sources.some((s) => s === 'berries' || s === 'sheep')) ids.forEach((id) => foodJob.add(id));
      if (sources.includes('berries')) ids.forEach((id) => berryJob.add(id));
      next += count;
      w.issue(0, { type: 'gather', ids, target: t });
    }

    // A villager is stuck if it has work but neither moves nor gathers for 30 s.
    const last = new Map<number, { x: number; y: number; carry: number; tick: number }>();
    let worstStall = 0;
    let worstUnit: Unit | null = null;
    const p = w.players[0];
    const start = { ...p.resources };
    for (let t = 0; t < 600 * TICK_RATE; t++) {
      w.step();
      for (const v of vs) {
        const prev = last.get(v.id);
        const carry = v.carry?.amount ?? -1;
        const moved = !prev || Math.hypot(v.x - prev.x, v.y - prev.y) > 0.02 || carry !== prev.carry;
        if (moved || !v.order) last.set(v.id, { x: v.x, y: v.y, carry, tick: w.tick });
        else if (w.tick - prev.tick > worstStall) {
          worstStall = w.tick - prev.tick;
          worstUnit = v;
        }
      }
    }
    expect(worstStall, `stalled: ${JSON.stringify(worstUnit && { order: worstUnit.order, state: worstUnit.state, x: worstUnit.x, y: worstUnit.y })}`).toBeLessThan(30 * TICK_RATE);
    expect(p.resources.wood - start.wood).toBeGreaterThan(500);
    expect(p.resources.gold - start.gold).toBeGreaterThan(250);
    expect(p.resources.stone - start.stone).toBeGreaterThan(150);
    expect(p.resources.food - start.food).toBeGreaterThan(400);
    // Idle only when the food they were sent to is used up nearby; woodcutters and miners never run dry here.
    const idle = vs.filter((v) => !v.order);
    expect(idle.filter((v) => !foodJob.has(v.id))).toEqual([]);
    for (const v of idle) expect(findResource(w, v, berryJob.has(v.id) ? ['berries'] : ['sheep', 'deer'], v.x, v.y)).toBeNull();
  });
});
