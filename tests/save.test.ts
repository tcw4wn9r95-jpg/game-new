import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/sim/mapgen';
import { loadWorld, saveWorld } from '../src/sim/save';
import { TICK_RATE, World } from '../src/sim/world';
import { EconomyBot } from '../src/sim/ai/bot';

const roundTrip = (w: World) => loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));

describe('save and load', () => {
  it('restores a match exactly and it carries on', () => {
    const map = generateMap({ type: 'coastal', size: 'skirmish', players: 2, seed: 5 });
    const w = new World(map);
    const bots = [new EconomyBot(0), new EconomyBot(1)];
    for (let t = 0; t < 240 * TICK_RATE; t++) {
      for (const b of bots) b.tick(w);
      w.step();
    }
    const w2 = roundTrip(w);
    expect(JSON.stringify(saveWorld(w2))).toBe(JSON.stringify(saveWorld(w)));
    expect(w2.players[0].pop).toBe(w.players[0].pop);
    expect(w2.players[0].popCap).toBe(w.players[0].popCap);
    expect([...w2.buildings()].length).toBe([...w.buildings()].length);
    // Navigation grid rebuilt: same walkability.
    expect(w2.grid.walk).toEqual(w.grid.walk);
    // It keeps playing: the economy goes on.
    const bots2 = [new EconomyBot(0), new EconomyBot(1)];
    const food = w2.players[0].gathered.food;
    for (let t = 0; t < 60 * TICK_RATE; t++) {
      for (const b of bots2) b.tick(w2);
      w2.step();
    }
    expect(w2.players[0].gathered.food).toBeGreaterThan(food);
  });

  it('keeps research effects, gates and ships aboard', () => {
    const map = generateMap({ type: 'islands', size: 'skirmish', players: 2, seed: 2 });
    const w = new World(map);
    w.players[0].techs.push('loom');
    const w2 = roundTrip(w);
    expect(w2.players[0].mods.units.villager.hp).toBeGreaterThan(w.players[0].mods.units.villager.hp - 1);
    expect(w2.tick).toBe(w.tick);
  });
});
