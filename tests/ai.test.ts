import { describe, expect, it } from 'vitest';
import { runMatch } from '../src/sim/ai/match';
import type { GameMap } from '../src/sim/terrain';
import { TICK_RATE, World, defaultTeams } from '../src/sim/world';

function flatMap(size = 64, players = 2): GameMap {
  return {
    type: 'heartland',
    sizeName: 'skirmish',
    seed: 3,
    size,
    terrain: new Uint8Array(size * size),
    elevation: new Uint8Array(size * size),
    feature: new Uint8Array(size * size),
    amount: new Uint16Array(size * size),
    animals: [],
    starts: [{ x: 8, y: 8 }, { x: 56, y: 56 }, { x: 56, y: 8 }, { x: 8, y: 56 }].slice(0, players),
  };
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s * TICK_RATE; i++) w.step();
};

describe('teams, treaty and conquest', () => {
  it('teams: 1v2 puts the human alone; allies never fight and share vision', () => {
    expect(defaultTeams(3)).toEqual([0, 1, 1]);
    expect(defaultTeams(4)).toEqual([0, 0, 1, 1]);
    const w = new World(flatMap(64, 4), { spawnStarts: false });
    expect(w.isEnemy(0, 1)).toBe(false);
    expect(w.isEnemy(0, 2)).toBe(true);
    const a = w.spawnUnit('militia', 0, 30.5, 30.5);
    const b = w.spawnUnit('militia', 1, 31.2, 30.5);
    w.issue(0, { type: 'attack', ids: [a.id], id: b.id });
    run(w, 5);
    expect(b.hp).toBe(45);
    // Player 1's soldier lights up the ground for player 0 too.
    expect(w.fog[0].isVisible(31, 30)).toBe(true);
  });

  it('the Peace Treaty stops all fighting until it ends', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    w.peaceUntil = 10;
    const a = w.spawnUnit('militia', 0, 30.5, 30.5);
    const b = w.spawnUnit('militia', 1, 31.2, 30.5);
    run(w, 8);
    expect(a.hp).toBe(45);
    expect(b.hp).toBe(45);
    run(w, 30);
    expect(Math.min(a.hp, b.hp)).toBeLessThan(45);
  });

  it('conquest: losing every Town Center and soldier loses the match', () => {
    const w = new World(flatMap());
    const events: string[] = [];
    run(w, 1);
    for (const b of [...w.buildings(1)]) w.remove(b.id);
    for (const u of [...w.units(1)]) if (u.type !== 'villager') w.remove(u.id);
    for (let i = 0; i < 20; i++) {
      w.step();
      for (const e of w.drainEvents()) events.push(e.type);
    }
    expect(w.players[1].defeated).toBe(true);
    expect(w.winner).toBe(0);
    expect(events).toContain('victory');
  });

  it('a player can resign', () => {
    const w = new World(flatMap());
    w.resign(0);
    expect(w.winner).toBe(1);
  });
});

describe('AI opponent', () => {
  it('Hard beats Easy on a small map, with no long stall', () => {
    const r = runMatch({ type: 'heartland', size: 'skirmish', seed: 2, ai: ['hard', 'easy'], maxMinutes: 100 });
    expect(r.winner).toBe(0);
    expect(r.longestStall).toBeLessThan(90);
  }, 120_000);
});
