import { describe, expect, it } from 'vitest';
import { placeWall, wallLine } from '../src/sim/fortify';
import { buildingMaxHp, completeTech } from '../src/sim/techs';
import type { GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

function flatMap(size = 64): GameMap {
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
    starts: [{ x: 8, y: 8 }, { x: 56, y: 56 }],
  };
}
const run = (w: World, s: number) => {
  for (let i = 0; i < s * TICK_RATE; i++) w.step();
};
const setup = () => {
  const w = new World(flatMap(), { spawnStarts: false });
  for (const p of [0, 1]) {
    w.players[p].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
    w.players[p].age = 3;
    w.fog[p].revealAll();
  }
  return w;
};
const finish = (w: World, p: number) => {
  for (const b of w.buildings(p))
    if (!b.complete) (b.complete = true), (b.progress = 1), (b.hp = buildingMaxHp(w, b));
};

describe('siege (M7 acceptance)', () => {
  it('4 rams break a stone gate in under 60 seconds', () => {
    const w = setup();
    placeWall(w, 1, 'stone', wallLine(32, 10, 32, 50).map((t) => ({ ...t, gate: t.y === 30 })));
    finish(w, 1);
    const gate = [...w.buildings(1)].find((b) => b.type === 'gate')!;
    const rams = [0, 1, 2, 3].map((k) => w.spawnUnit('ram', 0, 27.5, 28.5 + k));
    w.issue(0, { type: 'attack', ids: rams.map((u) => u.id), id: gate.id });
    let t = 0;
    for (; t < 60 * TICK_RATE && w.get(gate.id); t++) w.step();
    expect(w.get(gate.id)).toBeUndefined();
    expect(t / TICK_RATE).toBeLessThan(60);
  });

  it('a trebuchet outranges a Keep and knocks it down unharmed', () => {
    const w = setup();
    completeTech(w, 1, 'guard_tower');
    completeTech(w, 1, 'keep');
    completeTech(w, 1, 'murder_holes');
    const keep = w.placeBuilding('watch_tower', 1, 40, 30, true);
    expect(buildingMaxHp(w, keep)).toBe(2250);
    // Keep range 9 (+0.5 for its footprint); the trebuchet sets up at 15.
    const treb = w.spawnUnit('trebuchet', 0, 25.5, 30.5);
    w.issue(0, { type: 'attack', ids: [treb.id], id: keep.id });
    run(w, 150);
    expect(w.get(keep.id)).toBeUndefined();
    expect(treb.hp).toBe(150);
  });

  it('a siege tower unloads infantry on the inner side of a wall', () => {
    const w = setup();
    // Player 1 walls itself in.
    const ring = [...wallLine(30, 20, 44, 20), ...wallLine(44, 20, 44, 34), ...wallLine(44, 34, 30, 34), ...wallLine(30, 34, 30, 20)];
    placeWall(w, 1, 'stone', ring);
    finish(w, 1);
    const inside = w.grid.component(37, 27, 0);
    const tower = w.spawnUnit('siege_tower', 0, 22.5, 27.5);
    const men = Array.from({ length: 8 }, (_, k) => w.spawnUnit('militia', 0, 20.5 + (k % 4) * 0.6, 25.5 + Math.floor(k / 4)));
    w.issue(0, { type: 'garrison', ids: men.map((u) => u.id), id: tower.id });
    run(w, 6);
    expect(tower.cargo).toHaveLength(8);
    // Roll up to the west wall and unload.
    w.issue(0, { type: 'move', ids: [tower.id], x: 29.2, y: 27.5 });
    run(w, 15);
    w.issue(0, { type: 'ungarrison', id: tower.id });
    w.step();
    expect(tower.cargo).toHaveLength(0);
    for (const m of men) expect(w.grid.component(Math.floor(m.x), Math.floor(m.y), 0)).toBe(inside);
  });
});

describe('siege behaviour', () => {
  it('mangonel stones crush groups, friend and foe, but not up close', () => {
    const w = setup();
    const mango = w.spawnUnit('mangonel', 0, 20.5, 30.5);
    const foes = [0, 1, 2, 3].map((k) => w.spawnUnit('archer', 1, 26.5 + (k % 2) * 0.5, 30 + Math.floor(k / 2) * 0.5));
    for (const f of foes) f.stance = 'passive';
    const friend = w.spawnUnit('spearman', 0, 26.9, 30.6);
    friend.stance = 'passive';
    w.issue(0, { type: 'attackGround', ids: [mango.id], x: 26.7, y: 30.3 });
    run(w, 3);
    const hurt = foes.filter((f) => !w.get(f.id) || f.hp < 30).length;
    expect(hurt).toBeGreaterThanOrEqual(3);
    expect(!w.get(friend.id) || friend.hp < 45).toBe(true);
  });

  it('scorpion bolts pass through a line of men', () => {
    const w = setup();
    const sc = w.spawnUnit('scorpion', 0, 20.5, 30.5);
    const line = [0, 1, 2, 3].map((k) => w.spawnUnit('militia', 1, 24.5 + k * 0.8, 30.5));
    for (const m of line) m.stance = 'passive';
    w.issue(0, { type: 'attack', ids: [sc.id], id: line[0].id });
    run(w, 2);
    expect(line.filter((m) => m.hp < 45).length).toBeGreaterThanOrEqual(3);
  });

  it('rams cannot attack units; infantry inside speed a ram up', () => {
    const w = setup();
    const ram = w.spawnUnit('ram', 0, 20.5, 20.5);
    const foe = w.spawnUnit('militia', 1, 21.5, 20.5);
    w.issue(0, { type: 'attack', ids: [ram.id], id: foe.id });
    w.step();
    expect(ram.order).toBeNull();
    const ram2 = w.spawnUnit('ram', 0, 10.5, 40.5);
    const crew = [0, 1, 2, 3].map((k) => w.spawnUnit('militia', 0, 10.5 + k * 0.5, 41.5));
    w.issue(0, { type: 'garrison', ids: crew.map((u) => u.id), id: ram2.id });
    run(w, 4);
    expect(ram2.cargo).toHaveLength(4);
    const ram3 = w.spawnUnit('ram', 0, 10.5, 50.5);
    w.issue(0, { type: 'move', ids: [ram2.id], x: 40.5, y: 40.5 });
    w.issue(0, { type: 'move', ids: [ram3.id], x: 40.5, y: 50.5 });
    run(w, 20);
    expect(ram2.x - 10.5).toBeGreaterThan((ram3.x - 10.5) * 1.3);
  });

  it('trebuchets pack to move and unpack to fire, 5 seconds each', () => {
    const w = setup();
    const t = w.spawnUnit('trebuchet', 0, 20.5, 20.5);
    expect(t.packed).toBe(true);
    w.issue(0, { type: 'pack', ids: [t.id], packed: false });
    run(w, 4.9);
    expect(t.packed).toBe(true);
    run(w, 0.3);
    expect(t.packed).toBe(false);
    w.issue(0, { type: 'move', ids: [t.id], x: 30.5, y: 20.5 });
    run(w, 3);
    expect(t.x).toBe(20.5);
    run(w, 10);
    expect(t.x).toBeGreaterThan(21);
  });

  it('a petard blows open a wall segment', () => {
    const w = setup();
    placeWall(w, 1, 'stone', wallLine(32, 10, 32, 50));
    finish(w, 1);
    const seg = [...w.buildings(1)].find((b) => b.x === 32 && b.y === 30)!;
    const p = w.spawnUnit('petard', 0, 29.5, 30.5);
    w.issue(0, { type: 'attack', ids: [p.id], id: seg.id });
    run(w, 6);
    expect(w.get(p.id)).toBeUndefined();
    expect(!w.get(seg.id) || seg.hp < 1800 - 100).toBe(true);
  });
});
