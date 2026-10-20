import { describe, expect, it } from 'vitest';
import { EconomyBot } from '../src/sim/ai/bot';
import { damageOf } from '../src/sim/combat';
import { generateMap } from '../src/sim/mapgen';
import { sellPrice } from '../src/sim/production';
import { researchBlock, unitStats } from '../src/sim/techs';
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
    starts: [{ x: 10, y: 10 }, { x: 38, y: 38 }],
  };
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s * TICK_RATE; i++) w.step();
};
const rich = (w: World, p = 0) => (w.players[p].resources = { food: 9000, wood: 9000, gold: 9000, stone: 9000 });
const tc = (w: World) => [...w.buildings(0)].find((b) => b.type === 'town_center')!;

describe('ages (M5 acceptance)', () => {
  it('a steady build order reaches the Dominion Age in roughly 30-40 minutes on Standard', () => {
    for (const seed of [1, 2]) {
      const w = new World(generateMap({ type: 'heartland', size: 'standard', players: 2, seed }));
      const bot = new EconomyBot(0);
      let t = 0;
      for (; t < 50 * 60 * TICK_RATE && w.players[0].age < 3; t++) {
        bot.tick(w);
        w.step();
      }
      const minutes = t / TICK_RATE / 60;
      expect(w.players[0].age).toBe(3);
      expect(minutes).toBeGreaterThan(28);
      expect(minutes).toBeLessThan(42);
    }
  }, 300_000);
});

describe('ages and technologies', () => {
  it('advancing needs two buildings of the current age, costs, takes time, and busies the Town Center', () => {
    const w = new World(flatMap());
    rich(w);
    expect(researchBlock(w, 0, 'age2')).toMatch(/Needs 2/);
    w.placeBuilding('barracks', 0, 20, 10, true);
    w.placeBuilding('mill', 0, 20, 16, true);
    expect(researchBlock(w, 0, 'age2')).toBeNull();
    w.issue(0, { type: 'research', id: tc(w).id, tech: 'age2' });
    w.issue(0, { type: 'train', id: tc(w).id, unit: 'villager' });
    run(w, 159);
    expect(w.players[0].age).toBe(0);
    expect(w.players[0].resources.food).toBe(9000 - 500 - 50);
    // The villager waits behind the research.
    expect([...w.units(0)].filter((u) => u.type === 'villager')).toHaveLength(3);
    run(w, 2);
    expect(w.players[0].age).toBe(1);
  });

  it('gates buildings and units by age', () => {
    const w = new World(flatMap());
    rich(w);
    expect(w.canPlace('archery_range', 0, 20, 20)).toBe(false);
    const v = [...w.units(0)].find((u) => u.type === 'villager')!;
    w.issue(0, { type: 'build', ids: [v.id], building: 'archery_range', x: 20, y: 20 });
    w.step();
    expect([...w.buildings(0)].some((b) => b.type === 'archery_range')).toBe(false);
    const barracks = w.placeBuilding('barracks', 0, 20, 10, true);
    w.issue(0, { type: 'train', id: barracks.id, unit: 'spearman' });
    w.step();
    expect(barracks.queue).toHaveLength(0);
    w.players[0].age = 1;
    expect(w.canPlace('archery_range', 0, 20, 20)).toBe(true);
    w.issue(0, { type: 'train', id: barracks.id, unit: 'spearman' });
    w.step();
    expect(barracks.queue).toHaveLength(1);
  });

  it('blacksmith and economy techs change stats, including for units already in the field', () => {
    const w = new World(flatMap());
    rich(w);
    w.players[0].age = 2;
    const smith = w.placeBuilding('blacksmith', 0, 20, 10, true);
    const m = w.spawnUnit('militia', 0, 20, 20);
    const foe = w.spawnUnit('militia', 1, 30, 30);
    const before = damageOf(unitStats(w, 0, 'militia'), foe, w);
    w.issue(0, { type: 'research', id: smith.id, tech: 'forging' });
    run(w, 51);
    expect(damageOf(unitStats(w, 0, 'militia'), foe, w)).toBe(before + 1); // +1 flat: Blacksmith upgrades don't scale the counter bonus
    // Loom: villagers gain HP and armour, existing ones included.
    const v = [...w.units(0)].find((u) => u.type === 'villager')!;
    w.issue(0, { type: 'research', id: tc(w).id, tech: 'loom' });
    run(w, 26);
    expect(v.hp).toBe(40);
    expect(unitStats(w, 0, 'villager').pierceArmor).toBe(2);
    // Upgrades rename the unit and lift its stats.
    const barracks = w.placeBuilding('barracks', 0, 30, 10, true);
    w.issue(0, { type: 'research', id: barracks.id, tech: 'swordsman' });
    run(w, 46);
    expect(unitStats(w, 0, 'militia').name).toBe('Swordsman');
    expect(m.hp).toBe(60);
    // A second level needs the first.
    expect(researchBlock(w, 0, 'bodkin_arrow')).toMatch(/Requires Fletching/);
  });

  it('the market buys and sells, with prices that move', () => {
    const w = new World(flatMap());
    w.players[0].age = 1;
    w.players[0].resources = { food: 300, wood: 0, gold: 500, stone: 0 };
    const market = w.placeBuilding('market', 0, 20, 10, true);
    w.issue(0, { type: 'trade', id: market.id, action: 'buy', res: 'wood' });
    w.step();
    expect(w.players[0].resources.wood).toBe(100);
    expect(w.players[0].resources.gold).toBe(400);
    expect(w.players[0].market.wood).toBe(103);
    const p = sellPrice(w, 0, 'food');
    w.issue(0, { type: 'trade', id: market.id, action: 'sell', res: 'food' });
    w.step();
    expect(w.players[0].resources.food).toBe(200);
    expect(w.players[0].resources.gold).toBe(400 + p);
  });
});
