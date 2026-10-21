import { describe, expect, it } from 'vitest';
import { type Unit, type UnitType } from '../src/sim/entities';
import { loadWorld, saveWorld } from '../src/sim/save';
import { type Tactics, WAVE_GAP_S } from '../src/sim/tactics';
import { type GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

function flatMap(size = 80): GameMap {
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
      { x: 70, y: 70 },
    ],
  };
}

const spawn = (w: World, type: UnitType, owner: number, x: number, y: number, n: number): Unit[] =>
  Array.from({ length: n }, (_, k) => w.spawnUnit(type, owner, x + (k % 4) * 0.8, y + Math.floor(k / 4) * 0.8));

const run = (w: World, seconds: number, until?: () => boolean) => {
  for (let s = 0; s < seconds * TICK_RATE; s++) {
    w.step();
    if (until?.()) return;
  }
};

const ESCORT: Tactics = { formation: 'escort', waves: 1, fallback: false };

describe('battle plans', () => {
  it('escort formation puts the screens in front and marches at the slowest pace', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const tanks = spawn(w, 'knight', 0, 10, 10, 4);
    const rifles = spawn(w, 'archer', 0, 10, 12, 8);
    w.step();
    w.issue(0, { type: 'move', ids: [...tanks, ...rifles].map((u) => u.id), x: 40, y: 40, tactics: ESCORT });
    // Part way there, the fast tanks have not run off ahead of the riflemen.
    run(w, 8);
    const ahead = (us: Unit[]) => us.reduce((s, u) => s + u.x + u.y, 0) / us.length;
    expect(Math.abs(ahead(tanks) - ahead(rifles))).toBeLessThan(4);
    run(w, 60, () => [...tanks, ...rifles].every((u) => !u.order));
    // At the destination the tanks stand nearer the line of advance's far end than the riflemen.
    expect(ahead(tanks)).toBeGreaterThan(ahead(rifles));
    expect(Math.hypot(ahead(tanks) / 2 - 40, ahead(tanks) / 2 - 40)).toBeLessThan(4);
  });

  it('escorts turn on whatever attacks a ward', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const guards = spawn(w, 'militia', 0, 30, 30, 4);
    const ward = w.spawnUnit('archer', 0, 31, 32);
    ward.stance = 'passive';
    for (const g of guards) g.stance = 'stand';
    w.step();
    w.issue(0, { type: 'move', ids: [...guards, ward].map((u) => u.id), x: 31, y: 31, tactics: ESCORT });
    run(w, 6);
    // A raider comes in from outside the guards' sight and hits the rifleman.
    const raider = w.spawnUnit('scout', 1, 31, 40);
    raider.stance = 'passive';
    w.issue(1, { type: 'attack', ids: [raider.id], id: ward.id });
    run(w, 30, () => !w.get(raider.id));
    expect(w.get(raider.id)).toBeUndefined();
  });

  it('waves hold back and go in one after another', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const army = spawn(w, 'militia', 0, 10, 10, 9);
    w.step();
    w.issue(0, { type: 'move', ids: army.map((u) => u.id), x: 50, y: 50, tactics: { formation: 'loose', waves: 3, fallback: false } });
    w.step();
    const moving = () => army.filter((u) => u.order?.type === 'move').length;
    expect(moving()).toBe(3);
    expect(w.waves.length).toBe(2);
    run(w, WAVE_GAP_S - 2);
    expect(moving()).toBeLessThanOrEqual(3);
    run(w, 4);
    expect(w.waves.length).toBe(1);
    run(w, WAVE_GAP_S);
    expect(w.waves.length).toBe(0);
  });

  it('the next wave goes early when the one ahead is cut down', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const army = spawn(w, 'militia', 0, 10, 10, 6);
    w.step();
    w.issue(0, { type: 'move', ids: army.map((u) => u.id), x: 50, y: 50, tactics: { formation: 'loose', waves: 2, fallback: false } });
    w.step();
    const first = army.filter((u) => u.order?.type === 'move');
    for (const u of first.slice(0, 2)) w.remove(u.id);
    run(w, 2);
    expect(w.waves.length).toBe(0);
  });

  it('badly hurt units fall back to where the order was given', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const team = spawn(w, 'militia', 0, 10, 10, 4);
    w.step();
    w.issue(0, { type: 'move', ids: team.map((u) => u.id), x: 40, y: 40, tactics: { formation: 'loose', waves: 1, fallback: true } });
    run(w, 10);
    const hurt = team[0];
    hurt.hp = 5;
    run(w, 1);
    expect(hurt.order?.type).toBe('move');
    const o = hurt.order as { x: number; y: number };
    expect(Math.hypot(o.x - 11.2, o.y - 10)).toBeLessThan(3);
  });

  it('waiting waves survive a save and load', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const army = spawn(w, 'militia', 0, 10, 10, 6);
    w.step();
    w.issue(0, { type: 'move', ids: army.map((u) => u.id), x: 50, y: 50, tactics: { formation: 'escort', waves: 2, fallback: true } });
    w.step();
    const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
    expect(back.waves.length).toBe(1);
    expect(back.squadSeq).toBe(w.squadSeq);
    run(back, WAVE_GAP_S + 1);
    expect(back.waves.length).toBe(0);
    expect([...back.units(0)].filter((u) => u.order?.type === 'move' || Math.hypot(u.x - 50, u.y - 50) < 3).length).toBeGreaterThan(4);
  });
});
