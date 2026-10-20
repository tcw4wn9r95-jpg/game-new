import { describe, expect, it } from 'vitest';
import type { Building } from '../src/sim/entities';
import { Feature, type GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

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
    starts: [{ x: 10, y: 10 }],
  };
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE; i++) w.step();
};
const tc = (w: World) => [...w.buildings(0)].find((b) => b.type === 'town_center')!;
const villagers = (w: World) => [...w.units(0)].filter((u) => u.type === 'villager');

describe('production', () => {
  it('trains villagers, paying up front, and stops at the population cap', () => {
    const w = new World(flatMap());
    w.players[0].resources.food = 1000;
    w.issue(0, { type: 'train', id: tc(w).id, unit: 'villager', count: 3 });
    w.step();
    expect(w.players[0].resources.food).toBe(850);
    expect(tc(w).queue).toHaveLength(3);
    run(w, 26);
    expect(villagers(w)).toHaveLength(4); // 4/5 pop: the first fits
    run(w, 60);
    expect(villagers(w)).toHaveLength(4);
    expect(w.players[0].pop).toBe(5);
    expect(tc(w).housed).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'error' && e.message === 'Need more houses')).toBe(true);
  });

  it('refunds a cancelled unit in full', () => {
    const w = new World(flatMap());
    w.issue(0, { type: 'train', id: tc(w).id, unit: 'villager', count: 2 });
    run(w, 5);
    w.issue(0, { type: 'cancelTrain', id: tc(w).id, index: 1 });
    w.issue(0, { type: 'cancelTrain', id: tc(w).id, index: 0 });
    w.step();
    expect(w.players[0].resources.food).toBe(200);
    expect(tc(w).queue).toHaveLength(0);
  });

  it('sends new villagers to a rally point resource, and repeats production', () => {
    const map = flatMap();
    for (let x = 18; x < 22; x++) map.feature[12 * map.size + x] = Feature.Berries, (map.amount[12 * map.size + x] = 125);
    const w = new World(map);
    w.players[0].resources.food = 2000;
    w.placeBuilding('house', 0, 4, 4, true);
    w.issue(0, { type: 'rally', ids: [tc(w).id], x: 18.5, y: 12.5, target: { kind: 'tile', x: 18, y: 12 } });
    w.issue(0, { type: 'repeat', id: tc(w).id, on: true });
    w.issue(0, { type: 'train', id: tc(w).id, unit: 'villager' });
    run(w, 60);
    const fresh = villagers(w).slice(3);
    expect(fresh.length).toBeGreaterThanOrEqual(2);
    expect(fresh.every((u) => u.order?.type === 'gather' || u.order?.type === 'dropoff')).toBe(true);
  });

  it('trains militia at a barracks', () => {
    const w = new World(flatMap());
    w.players[0].resources.food = 500;
    const b = w.placeBuilding('barracks', 0, 20, 20, true);
    w.issue(0, { type: 'train', id: b.id, unit: 'militia' });
    run(w, 22);
    expect([...w.units(0)].some((u) => u.type === 'militia')).toBe(true);
  });
});

describe('farms', () => {
  it('needs a mill, is walked on, worked by one farmer, and reseeds for wood', () => {
    const w = new World(flatMap());
    const [a, b] = villagers(w);
    w.players[0].resources.wood = 1000;
    expect(w.canPlace('farm', 0, 16, 10)).toBe(false); // no mill yet
    w.placeBuilding('mill', 0, 20, 10, true);
    expect(w.canPlace('farm', 0, 16, 10)).toBe(true);
    w.issue(0, { type: 'build', ids: [a.id], building: 'farm', x: 16, y: 10 });
    run(w, 30);
    const farm = [...w.buildings(0)].find((x) => x.type === 'farm') as Building;
    expect(farm.complete).toBe(true);
    expect(w.grid.isWalkable(17, 11)).toBe(true);
    // The builder became its farmer; a second villager sent to it finds no free farm.
    expect(a.order?.type).toBe('gather');
    w.issue(0, { type: 'gather', ids: [b.id], target: { kind: 'entity', id: farm.id } });
    run(w, 5);
    expect(b.order).toBeNull();
    const woodBefore = w.players[0].resources.wood;
    run(w, 700);
    expect(w.players[0].gathered.food).toBeGreaterThan(175);
    expect(w.players[0].resources.wood).toBeLessThan(woodBefore); // replanted at least once
    expect(w.get(farm.id)).toBeDefined();
  });
});

describe('delete', () => {
  it('refunds the unbuilt part of a foundation', () => {
    const w = new World(flatMap());
    const [v] = villagers(w);
    w.issue(0, { type: 'build', ids: [v.id], building: 'lumber_camp', x: 20, y: 20 });
    w.step();
    expect(w.players[0].resources.wood).toBe(100);
    const camp = [...w.buildings(0)].find((x) => x.type === 'lumber_camp')!;
    w.issue(0, { type: 'delete', ids: [camp.id] });
    w.step();
    expect(w.get(camp.id)).toBeUndefined();
    expect(w.players[0].resources.wood).toBeGreaterThan(190);
    expect(w.grid.isWalkable(20, 20)).toBe(true);
  });
});
