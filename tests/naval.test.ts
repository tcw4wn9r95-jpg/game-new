import { describe, expect, it } from 'vitest';
import { UNIT_DEFS, type Unit, type UnitType } from '../src/sim/entities';
import { WATER } from '../src/sim/grid';
import { generateMap } from '../src/sim/mapgen';
import { buildingMaxHp } from '../src/sim/techs';
import { type GameMap, Terrain } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

const run = (w: World, s: number, until?: () => boolean) => {
  for (let i = 0; i < s * TICK_RATE; i++) {
    w.step();
    if (until?.()) return i / TICK_RATE;
  }
  return s;
};

/** Land on the left, sea on the right (x >= 24), an island at x 48..63. */
function seaMap(size = 64): GameMap {
  const terrain = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 24; x < 48; x++) terrain[y * size + x] = Terrain.Deep;
  return {
    type: 'coastal',
    sizeName: 'skirmish',
    seed: 5,
    size,
    terrain,
    elevation: new Uint8Array(size * size),
    feature: new Uint8Array(size * size),
    amount: new Uint16Array(size * size),
    animals: [],
    starts: [{ x: 8, y: 32 }, { x: 56, y: 32 }],
  };
}

const setup = (map = seaMap()) => {
  const w = new World(map, { spawnStarts: false });
  for (const p of [0, 1]) {
    w.players[p].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
    w.players[p].age = 3;
    w.fog[p].revealAll();
  }
  return w;
};

/** First place along the shore near (x, y) where a dock fits. */
function dockSpot(w: World, owner: number, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (w.canPlace('dock', owner, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
  throw new Error('no dock spot');
}

const fleet = (w: World, owner: number, type: UnitType, n: number, x: number, y: number) =>
  Array.from({ length: n }, (_, k) => w.spawnUnit(type, owner, x + (k % 3) * 1.2, y + Math.floor(k / 3) * 1.2));
const alive = (w: World, us: Unit[]) => us.filter((u) => w.get(u.id)).length;

describe('naval (M8)', () => {
  it('ships sail only on deep water; land units only on land', () => {
    const w = setup();
    expect(w.grid.isWalkable(30, 30, WATER)).toBe(true);
    expect(w.grid.isWalkable(10, 30, WATER)).toBe(false);
    const g = w.spawnUnit('galley', 0, 30.5, 10.5);
    w.issue(0, { type: 'move', ids: [g.id], x: 10.5, y: 10.5 });
    run(w, 30);
    // Sails to the nearest water instead.
    expect(Math.floor(g.x)).toBeGreaterThanOrEqual(24);
    expect(Math.abs(g.x - 24.5)).toBeLessThan(1.2);
  });

  it('a dock must touch deep water; fish traps go on it', () => {
    const w = setup();
    expect(w.canPlace('dock', 0, 10, 10)).toBe(false);
    expect(w.canPlace('dock', 0, 21, 10)).toBe(true);
    w.placeBuilding('dock', 0, 21, 10, true);
    expect(w.canPlace('fish_trap', 0, 30, 30)).toBe(true);
    expect(w.canPlace('fish_trap', 0, 10, 30)).toBe(false);
  });

  it('fishing ships net deep fish and bring it to the dock, and work fish traps', () => {
    const w = setup();
    w.placeBuilding('dock', 0, 21, 30, true);
    const fish = [...w.resources()];
    expect(fish.length).toBe(0);
    const f = w.spawnUnit('fishing_ship', 0, 25.5, 31.5);
    // A shoal out at sea.
    const map = w.map as GameMap;
    map.animals.push({ kind: 'fish', x: 33.5, y: 31.5, amount: 300 });
    const shoal = (w as unknown as { add: (e: object) => { id: number } }).add({ kind: 'resource', type: 'fish', x: 33.5, y: 31.5, amount: 300 });
    w.issue(0, { type: 'gather', ids: [f.id], target: { kind: 'entity', id: shoal.id } });
    const food0 = w.players[0].resources.food;
    run(w, 90);
    expect(w.players[0].resources.food - food0).toBeGreaterThanOrEqual(30);

    // Build a fish trap and fish it.
    w.issue(0, { type: 'build', ids: [f.id], building: 'fish_trap', x: 27, y: 36 });
    run(w, 1);
    const trap = [...w.buildings(0)].find((b) => b.type === 'fish_trap')!;
    expect(trap).toBeTruthy();
    run(w, 60);
    expect(trap.complete).toBe(true);
    const food1 = w.players[0].resources.food;
    run(w, 120);
    expect(f.order?.type === 'gather' || f.order?.type === 'dropoff').toBe(true);
    expect(w.players[0].resources.food - food1).toBeGreaterThanOrEqual(15);
  });

  it('a transport lands 10 soldiers on the far shore', () => {
    const w = setup();
    const t = w.spawnUnit('transport_ship', 0, 26.5, 20.5);
    const army = fleet(w, 0, 'militia', 10, 14.5, 30.5);
    w.issue(0, { type: 'move', ids: army.map((u) => u.id), x: 56.5, y: 32.5 });
    const took = run(w, 180, () => army.every((u) => !u.inside && u.x > 48));
    expect(took).toBeLessThan(180);
    expect(t.cargo.length).toBe(0);
  });

  it('a galley shoots a coastal building; swordsmen will not wade out to fight it', () => {
    const w = setup();
    const dock = w.placeBuilding('dock', 1, 48, 30, true);
    const g = w.spawnUnit('galley', 0, 40.5, 31.5);
    w.issue(0, { type: 'attack', ids: [g.id], id: dock.id });
    const hp0 = dock.hp;
    run(w, 30);
    expect(dock.hp).toBeLessThan(hp0);
    const m = w.spawnUnit('militia', 1, 22.5, 31.5);
    w.issue(1, { type: 'attack', ids: [m.id], id: g.id });
    run(w, 1);
    expect(m.order).toBeNull();
  });

  it('counters: fire ships beat galleys, galleys beat demolition rafts, barges outrange towers', () => {
    // Equal cost: 5 galleys (120 each) vs 5 fire ships (120 each).
    {
      const w = setup();
      const gal = fleet(w, 0, 'galley', 5, 28.5, 20.5);
      const fire = fleet(w, 1, 'fire_ship', 5, 40.5, 20.5);
      w.issue(1, { type: 'attack', ids: fire.map((u) => u.id), id: gal[0].id });
      run(w, 120, () => !alive(w, gal) || !alive(w, fire));
      expect(alive(w, fire)).toBeGreaterThan(0);
      expect(alive(w, gal)).toBe(0);
    }
    {
      const w = setup();
      const gal = fleet(w, 0, 'galley', 5, 28.5, 20.5);
      const rafts = fleet(w, 1, 'demolition_raft', 5, 42.5, 20.5);
      w.issue(1, { type: 'attack', ids: rafts.map((u) => u.id), id: gal[0].id });
      run(w, 120, () => !alive(w, gal) || !alive(w, rafts));
      expect(alive(w, gal)).toBeGreaterThan(0);
    }
    {
      const w = setup();
      const tower = w.placeBuilding('watch_tower', 1, 22, 30, true);
      const barge = w.spawnUnit('siege_barge', 0, 34.5, 31.5);
      w.issue(0, { type: 'attack', ids: [barge.id], id: tower.id });
      run(w, 180, () => !w.get(tower.id));
      expect(w.get(tower.id)).toBeUndefined();
      expect(barge.hp).toBe(UNIT_DEFS.siege_barge.hp);
    }
  });

  it('heated shot doubles tower damage against ships', () => {
    const hits = (heated: boolean) => {
      const w = setup();
      if (heated) w.players[1].mods.defense.heatedShot = true;
      const tower = w.placeBuilding('watch_tower', 1, 21, 30, true);
      tower.hp = buildingMaxHp(w, tower);
      const g = w.spawnUnit('fishing_ship', 0, 26.5, 31.5);
      g.stance = 'passive';
      run(w, 10);
      return UNIT_DEFS.fishing_ship.hp - g.hp;
    };
    expect(hits(true)).toBeGreaterThan(hits(false) * 1.6);
  });
});

describe('sinking', () => {
  it('a transport sunk at sea takes its riders down with it', () => {
    const w = setup();
    const t = w.spawnUnit('transport_ship', 0, 36.5, 30.5);
    const m = w.spawnUnit('militia', 0, 36.5, 30.5);
    m.inside = t.id;
    t.cargo.push(m.id);
    w.remove(t.id);
    expect(w.get(m.id)).toBeUndefined();
  });
});

describe('Islands acceptance (M8)', () => {
  it('ships 10 units to an enemy island and unloads them', () => {
    const map = generateMap({ type: 'islands', size: 'standard', players: 2, seed: 7 });
    const w = new World(map, { spawnStarts: false });
    w.players[0].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
    w.players[0].age = 1;
    w.fog[0].revealAll();
    const s0 = map.starts[0], s1 = map.starts[1];
    const spot = dockSpot(w, 0, s0.x, s0.y);
    w.placeBuilding('dock', 0, spot.x, spot.y, true);
    const sea = w.grid.nearestWalkable(spot.x + 1.5, spot.y + 1.5, -1, 6, WATER)!;
    w.spawnUnit('transport_ship', 0, sea.x + 0.5, sea.y + 0.5);
    const army = fleet(w, 0, 'militia', 10, s0.x - 0.5, s0.y + 0.5);
    const enemyIsland = w.grid.component(s1.x + 3, s1.y + 3, -1);
    expect(enemyIsland).toBeGreaterThanOrEqual(0);
    expect(w.grid.component(Math.floor(army[0].x), Math.floor(army[0].y), -1)).not.toBe(enemyIsland);
    w.issue(0, { type: 'move', ids: army.map((u) => u.id), x: s1.x + 3.5, y: s1.y + 3.5 });
    const ashore = () => army.filter((u) => w.get(u.id) && !u.inside && w.grid.component(Math.floor(u.x), Math.floor(u.y), -1) === enemyIsland).length;
    run(w, 600, () => ashore() === 10);
    expect(ashore()).toBe(10);
  });
});
