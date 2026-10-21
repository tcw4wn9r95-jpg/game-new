import { describe, expect, it } from 'vitest';
import { type Unit, type UnitType } from '../src/sim/entities';
import { type GameMap, Terrain } from '../src/sim/terrain';
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

const army = (w: World, type: UnitType, owner: number, x: number, y: number, n = 6): Unit[] =>
  Array.from({ length: n }, (_, k) => w.spawnUnit(type, owner, x + (k % 3) * 0.8, y + Math.floor(k / 3) * 0.8));

const run = (w: World, seconds: number, until?: () => boolean) => {
  for (let s = 0; s < seconds * TICK_RATE; s++) {
    w.step();
    if (until?.()) return;
  }
};

describe('air and air defence', () => {
  it('ground troops without anti-air cannot touch helicopters, which destroy tanks', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const helis = army(w, 'attack_heli', 0, 28, 24, 4);
    const tanks = army(w, 'knight', 1, 28, 30, 4);
    const rifles = army(w, 'archer', 1, 31, 30, 4);
    w.step();
    // Ordered to attack, the riflemen refuse: they have nothing that reaches aircraft.
    w.issue(1, { type: 'attack', ids: rifles.map((u) => u.id), id: helis[0].id });
    w.issue(0, { type: 'attack', ids: helis.map((u) => u.id), id: tanks[0].id });
    run(w, 120, () => tanks.every((t) => !w.get(t.id)));
    expect(tanks.every((t) => !w.get(t.id))).toBe(true);
    expect(helis.every((h) => w.get(h.id) && (w.get(h.id) as Unit).hp === 140)).toBe(true);
  });

  it('AA troopers shoot down helicopters and ignore ground targets', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const helis = army(w, 'attack_heli', 0, 28, 24, 3);
    const aa = army(w, 'aa_trooper', 1, 28, 29, 6);
    const tank = w.spawnUnit('knight', 0, 34, 29);
    run(w, 90, () => helis.every((h) => !w.get(h.id)));
    expect(helis.every((h) => !w.get(h.id))).toBe(true);
    // Nobody shot at the tank parked beside them.
    expect((w.get(tank.id) as Unit).hp).toBe(unitHp(w, tank));
    expect(aa.some((u) => w.get(u.id))).toBe(true);
  });

  it('aircraft fly straight over walls and water', () => {
    const map = flatMap();
    // A lake across the middle of the map.
    for (let y = 30; y < 34; y++) for (let x = 0; x < 64; x++) map.terrain[y * 64 + x] = Terrain.Deep;
    const w = new World(map, { spawnStarts: false });
    const drone = w.spawnUnit('recon_drone', 0, 20, 20);
    w.placeBuilding('stone_wall', 1, 20, 26, true);
    w.step();
    w.issue(0, { type: 'move', ids: [drone.id], x: 20.5, y: 44.5 });
    run(w, 20, () => Math.hypot(drone.x - 20.5, drone.y - 44.5) < 0.7);
    expect(Math.hypot(drone.x - 20.5, drone.y - 44.5)).toBeLessThan(0.7);
    // It went in a straight line, not around anything.
    expect(Math.abs(drone.x - 20.5)).toBeLessThan(0.7);
  });

  it('SAM sites fire only at aircraft; sentry towers fire at both', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    w.placeBuilding('sam_site', 1, 30, 30, true);
    const heli = w.spawnUnit('attack_heli', 0, 33, 36);
    heli.stance = 'passive';
    const tank = w.spawnUnit('knight', 0, 29, 36);
    tank.stance = 'passive';
    run(w, 30, () => !w.get(heli.id));
    expect(w.get(heli.id)).toBeUndefined();
    expect((w.get(tank.id) as Unit).hp).toBe(unitHp(w, tank));

    const w2 = new World(flatMap(), { spawnStarts: false });
    w2.placeBuilding('watch_tower', 1, 30, 30, true);
    const h2 = w2.spawnUnit('attack_heli', 0, 33, 34);
    h2.stance = 'passive';
    run(w2, 10);
    expect((w2.get(h2.id) as Unit).hp).toBeLessThan(140);
  });

  it('jets bomb buildings, and their bombs never splash on aircraft', () => {
    const w = new World(flatMap(), { spawnStarts: false });
    const house = w.placeBuilding('house', 1, 30, 30, true);
    const jets = army(w, 'strike_jet', 0, 24, 24, 2);
    const ownHeli = w.spawnUnit('attack_heli', 0, 31, 31);
    ownHeli.stance = 'passive';
    w.step();
    w.issue(0, { type: 'attack', ids: jets.map((j) => j.id), id: house.id });
    run(w, 60, () => !w.get(house.id));
    expect(w.get(house.id)).toBeUndefined();
    expect((w.get(ownHeli.id) as Unit).hp).toBe(140);
  });
});

function unitHp(w: World, u: Unit): number {
  return w.players[u.owner]?.mods.units[u.type]?.hp ?? 0;
}
