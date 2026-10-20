import { describe, expect, it } from 'vitest';
import { UNIT_DEFS } from '../src/sim/entities';
import { generateMap } from '../src/sim/mapgen';
import { ALL_SITES_HOLD, CAPTURE_TIME, DOMINATION_TARGET, RELIC_COUNT, RELIC_HOLD, WONDER_HOLD, carried, kingOf, relics } from '../src/sim/modes';
import { loadWorld, saveWorld } from '../src/sim/save';
import { buildingCost, buildingMaxHp, trainTime, unitCost } from '../src/sim/techs';
import { type GameMap } from '../src/sim/terrain';
import { TICK_RATE, World } from '../src/sim/world';

const run = (w: World, s: number, until?: () => boolean) => {
  for (let i = 0; i < s * TICK_RATE; i++) {
    w.step();
    if (until?.()) return i / TICK_RATE;
  }
  return s;
};

/** A flat, empty 64x64 field with two starts. */
function flatMap(size = 64, sizeName: GameMap['sizeName'] = 'skirmish'): GameMap {
  return {
    type: 'heartland',
    sizeName,
    seed: 11,
    size,
    terrain: new Uint8Array(size * size),
    elevation: new Uint8Array(size * size),
    feature: new Uint8Array(size * size),
    amount: new Uint16Array(size * size),
    animals: [],
    starts: [{ x: 12, y: 12 }, { x: 50, y: 50 }],
  };
}

describe('Regicide (M10)', () => {
  it('starts each side with a King inside a Castle, six villagers, a scout and extra stone', () => {
    const w = new World(generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 3 }), { mode: 'regicide' });
    for (const p of [0, 1]) {
      const king = kingOf(w, p)!;
      expect(king).toBeTruthy();
      const castle = w.building(king.inside)!;
      expect(castle.type).toBe('castle');
      expect(castle.owner).toBe(p);
      expect([...w.units(p)].filter((u) => u.type === 'villager').length).toBe(6);
      expect([...w.units(p)].filter((u) => u.type === 'scout').length).toBe(1);
      expect(w.players[p].resources.stone).toBe(500);
    }
  });

  it('killing the King ends the match', () => {
    const w = new World(flatMap(), { mode: 'regicide' });
    const king = kingOf(w, 1)!;
    // Out in the open, he meets a band of swordsmen.
    w.issue(1, { type: 'ungarrison', id: king.inside });
    run(w, 1);
    expect(king.inside).toBe(0);
    for (let k = 0; k < 6; k++) w.spawnUnit('militia', 0, king.x + 1 + (k % 3) * 0.6, king.y + 1 + Math.floor(k / 3) * 0.6);
    const t = run(w, 60, () => w.winner !== null);
    expect(t).toBeLessThan(60);
    expect(w.get(king.id)).toBeUndefined();
    expect(w.winner).toBe(w.players[0].team);
    expect(w.victoryReason).toBe('regicide');
    expect(w.players[1].defeated).toBe(true);
    // Player 1 still has a Town Center, villagers and a Castle: only the King mattered.
    expect([...w.buildings(1)].some((b) => b.type === 'town_center')).toBe(true);
  });

  it('a garrisoned King survives until his building falls', () => {
    const w = new World(flatMap(), { mode: 'regicide' });
    const king = kingOf(w, 1)!;
    const castle = w.building(king.inside)!;
    // Arrows can't reach him inside.
    expect(UNIT_DEFS.king.hp).toBe(75);
    castle.hp = 400;
    const rams = [0, 1, 2].map((k) => w.spawnUnit('ram', 0, castle.x - 1.5, castle.y + 1 + k));
    w.issue(0, { type: 'attack', ids: rams.map((r) => r.id), id: castle.id });
    // While the Castle stands he is safe and the match goes on.
    run(w, 2);
    expect(w.get(castle.id)).toBeTruthy();
    expect(king.inside).toBe(castle.id);
    expect(w.winner).toBeNull();
    run(w, 60, () => !w.get(castle.id));
    expect(w.get(castle.id)).toBeUndefined();
    // The Castle fell: he is turned out alive, and the match goes on until he is caught.
    expect(w.get(king.id)).toBeTruthy();
    expect(king.inside).toBe(0);
    run(w, 1.5);
    expect(w.winner).toBeNull();
    expect(w.players[1].defeated).toBe(false);
    for (let k = 0; k < 6; k++) w.spawnUnit('knight', 0, king.x + 1.2 + (k % 3) * 0.7, king.y + 1.2 + Math.floor(k / 3) * 0.7);
    run(w, 60, () => w.winner !== null);
    expect(w.winner).toBe(w.players[0].team);
  });

  it('the King shelters only in Castles, towers and transports', () => {
    const w = new World(flatMap(), { mode: 'regicide' });
    const king = kingOf(w, 0)!;
    w.issue(0, { type: 'ungarrison', id: king.inside });
    run(w, 1);
    const tc = [...w.buildings(0)].find((b) => b.type === 'town_center')!;
    w.issue(0, { type: 'garrison', ids: [king.id], id: tc.id });
    run(w, 20);
    expect(king.inside).toBe(0);
    const tower = w.placeBuilding('watch_tower', 0, Math.floor(king.x) + 3, Math.floor(king.y), true);
    w.issue(0, { type: 'garrison', ids: [king.id], id: tower.id });
    run(w, 20, () => king.inside === tower.id);
    expect(king.inside).toBe(tower.id);
  });

  it("can't be deleted", () => {
    const w = new World(flatMap(), { mode: 'regicide' });
    const king = kingOf(w, 0)!;
    w.issue(0, { type: 'delete', ids: [king.id] });
    run(w, 2);
    expect(w.get(king.id)).toBeTruthy();
  });
});

describe('Domination (M10)', () => {
  it('places 3 sites on Skirmish and 5 on Standard, on open land', () => {
    const small = new World(generateMap({ type: 'heartland', size: 'skirmish', players: 2, seed: 4 }), { mode: 'domination' });
    expect(small.modeState.sites.length).toBe(3);
    const big = new World(generateMap({ type: 'islands', size: 'standard', players: 2, seed: 4 }), { mode: 'domination' });
    expect(big.modeState.sites.length).toBe(5);
    for (const s of big.modeState.sites) expect(big.grid.isWalkable(Math.floor(s.x), Math.floor(s.y))).toBe(true);
  });

  it('capturing takes 20 s, faster with a tower, and only one side may be present', () => {
    const w = new World(flatMap(), { mode: 'domination' });
    const site = w.modeState.sites.reduce((a, b) => (Math.hypot(a.x - 32, a.y - 32) < Math.hypot(b.x - 32, b.y - 32) ? a : b));
    const m = w.spawnUnit('militia', 0, site.x + 1, site.y);
    m.stance = 'stand';
    run(w, CAPTURE_TIME - 2);
    expect(site.owner).toBe(-1);
    run(w, 3);
    expect(site.owner).toBe(0);
    // Contested: an enemy arrives and nothing changes hands.
    const e = w.spawnUnit('militia', 1, site.x - 1, site.y);
    e.stance = 'passive';
    m.stance = 'passive';
    run(w, CAPTURE_TIME + 3);
    expect(site.owner).toBe(0);
    w.remove(m.id);
    // A tower beside it speeds the enemy's capture by half.
    w.placeBuilding('watch_tower', 1, Math.floor(site.x) + 2, Math.floor(site.y) + 2, true);
    const t = run(w, 30, () => site.owner === 1);
    expect(t).toBeLessThan(CAPTURE_TIME / 1.5 + 2);
    expect(t).toBeGreaterThan(CAPTURE_TIME / 1.5 - 2);
  });

  it('sites are neutral during the Peace Treaty', () => {
    const w = new World(flatMap(), { mode: 'domination' });
    w.peaceUntil = 120;
    const site = w.modeState.sites[0];
    w.spawnUnit('militia', 0, site.x + 1, site.y).stance = 'stand';
    run(w, 60);
    expect(site.owner).toBe(-1);
    expect(site.capture).toBe(0);
  });

  it('the score reaches the target and declares the right winner', () => {
    const w = new World(flatMap(), { mode: 'domination' });
    const [a, b, c] = w.modeState.sites;
    // Red holds two sites, Blue one: Red scores twice as fast and wins on points.
    a.owner = 1;
    b.owner = 1;
    c.owner = 0;
    const target = DOMINATION_TARGET.skirmish;
    w.modeState.score = [0, target - 4];
    const t = run(w, 60, () => w.winner !== null);
    // 2 sites x 1 point per 5 s: 4 points in about 10 s.
    expect(t).toBeGreaterThan(8);
    expect(t).toBeLessThan(12);
    expect(w.winner).toBe(w.players[1].team);
    expect(w.victoryReason).toBe('domination');
    expect(w.players[0].defeated).toBe(true);
    expect(w.modeState.score[1]).toBeGreaterThanOrEqual(target);
    expect(w.modeState.score[0]).toBeLessThan(target);
  });

  it('holding every site for 3 minutes wins outright', () => {
    const w = new World(flatMap(), { mode: 'domination' });
    for (const s of w.modeState.sites) s.owner = 0;
    const t = run(w, ALL_SITES_HOLD + 10, () => w.winner !== null);
    expect(t).toBeGreaterThan(ALL_SITES_HOLD - 2);
    expect(w.winner).toBe(w.players[0].team);
    expect(w.victoryReason).toBe('sites');
  });

  it('a held site trickles gold', () => {
    const w = new World(flatMap(), { mode: 'domination' });
    w.modeState.sites[0].owner = 0;
    const g0 = w.players[0].resources.gold;
    run(w, 30);
    expect(w.players[0].resources.gold - g0).toBeGreaterThan(5);
  });
});

describe('Standard: Wonder and relics (M10)', () => {
  it('a Wonder standing 8 minutes wins; losing it stops the clock', () => {
    const w = new World(flatMap());
    const won = w.placeBuilding('wonder', 0, 20, 30, true);
    run(w, WONDER_HOLD - 60);
    expect(w.winner).toBeNull();
    w.remove(won.id);
    run(w, 120);
    expect(w.winner).toBeNull();
    w.placeBuilding('wonder', 1, 30, 40, true);
    const t = run(w, WONDER_HOLD + 5, () => w.winner !== null);
    expect(t).toBeGreaterThan(WONDER_HOLD - 2);
    expect(w.winner).toBe(w.players[1].team);
    expect(w.victoryReason).toBe('wonder');
  });

  it('places five relics away from the bases', () => {
    const map = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 8 });
    const w = new World(map);
    const rs = [...relics(w)];
    expect(rs.length).toBe(RELIC_COUNT);
    for (const r of rs) for (const s of map.starts) expect(Math.hypot(r.x - s.x, r.y - s.y)).toBeGreaterThan(map.size * 0.15);
  });

  it('a monk carries a relic to a Monastery; holding them all for 8 minutes wins', () => {
    const w = new World(flatMap());
    const rs = [...relics(w)];
    expect(rs.length).toBeGreaterThan(0);
    w.players[0].age = 2;
    const mon = w.placeBuilding('monastery', 0, 20, 20, true);
    const monk = w.spawnUnit('monk', 0, 24, 21);
    // Villagers can't pick them up.
    const vill = w.spawnUnit('villager', 0, 24, 22);
    w.issue(0, { type: 'gather', ids: [vill.id], target: { kind: 'entity', id: rs[0].id } });
    w.issue(0, { type: 'gather', ids: [monk.id], target: { kind: 'entity', id: rs[0].id } });
    run(w, 120, () => !!rs[0].holder);
    expect(carried(w, monk)).toBeUndefined();
    expect(rs[0].holder).toBe(mon.id);
    expect(rs[0].carrier).toBeFalsy();
    // The relic brings in gold.
    const g0 = w.players[0].resources.gold;
    run(w, 10);
    expect(w.players[0].resources.gold - g0).toBeGreaterThanOrEqual(4);
    // Put the rest in too.
    for (const r of rs.slice(1)) (r.holder = mon.id), (r.x = mon.x + 1), (r.y = mon.y + 1);
    const t = run(w, RELIC_HOLD + 5, () => w.winner !== null);
    expect(t).toBeGreaterThan(RELIC_HOLD - 3);
    expect(w.victoryReason).toBe('relics');
    expect(w.winner).toBe(w.players[0].team);
  });

  it('a monk killed while carrying drops the relic; a fallen Monastery spills its relics', () => {
    const w = new World(flatMap());
    const [r] = [...relics(w)];
    const monk = w.spawnUnit('monk', 0, r.x + 0.5, r.y);
    r.carrier = monk.id;
    run(w, 0.2);
    w.remove(monk.id);
    run(w, 0.2);
    expect(r.carrier).toBe(0);
    expect(r.holder).toBeFalsy();
    w.players[1].age = 2;
    const mon = w.placeBuilding('monastery', 1, 40, 40, true);
    r.holder = mon.id;
    w.remove(mon.id);
    run(w, 0.2);
    expect(r.holder).toBe(0);
    expect(w.grid.isWalkable(Math.floor(r.x), Math.floor(r.y))).toBe(true);
  });
});

describe('factions (M10)', () => {
  const two = (factions: string[]) => new World(flatMap(), { factions });

  it('Highland: faster wood, tougher infantry; Claymores only for Highland', () => {
    const w = two(['highland', 'steppe']);
    expect(w.players[0].mods.units.militia.hp).toBeGreaterThan(w.players[1].mods.units.militia.hp);
    expect(w.players[0].mods.gather.tree ?? 1).toBeGreaterThan(w.players[1].mods.gather.tree ?? 1);
    for (const p of [0, 1]) {
      w.players[p].age = 2;
      w.players[p].resources = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };
    }
    const c0 = w.placeBuilding('castle', 0, 10, 20, true), c1 = w.placeBuilding('castle', 1, 40, 20, true);
    w.issue(0, { type: 'train', id: c0.id, unit: 'claymore' });
    w.issue(1, { type: 'train', id: c1.id, unit: 'claymore' });
    w.issue(1, { type: 'train', id: c1.id, unit: 'horse_archer' });
    run(w, 0.2);
    expect(c0.queue.map((q) => q.unit)).toEqual(['claymore']);
    expect(c1.queue.map((q) => q.unit)).toEqual(['horse_archer']);
  });

  it('Steppe: stables train faster and cavalry costs less', () => {
    const w = two(['steppe', 'coastal']);
    expect(trainTime(w, 0, 'scout', 'stable')).toBeCloseTo(trainTime(w, 1, 'scout', 'stable') * 0.8);
    expect(unitCost(w, 0, 'knight').gold!).toBeLessThan(unitCost(w, 1, 'knight').gold!);
    expect(unitCost(w, 0, 'militia')).toEqual(unitCost(w, 1, 'militia'));
  });

  it('Coastal: half-price docks, tougher ships, better market', () => {
    const w = two(['coastal', 'mountain']);
    expect(buildingCost(w, 0, 'dock').wood).toBe(Math.round(buildingCost(w, 1, 'dock').wood! / 2));
    expect(w.players[0].mods.units.galley.hp).toBeGreaterThan(w.players[1].mods.units.galley.hp);
    expect(w.players[0].mods.sellShare).toBeGreaterThan(w.players[1].mods.sellShare);
  });

  it('Mountain: cheaper stone for walls and towers, tougher buildings', () => {
    const w = two(['mountain', 'highland']);
    expect(buildingCost(w, 0, 'stone_wall').stone).toBeLessThan(buildingCost(w, 1, 'stone_wall').stone!);
    expect(buildingCost(w, 0, 'house')).toEqual(buildingCost(w, 1, 'house'));
    const a = w.placeBuilding('house', 0, 10, 10, true), b = w.placeBuilding('house', 1, 40, 40, true);
    expect(buildingMaxHp(w, a)).toBeGreaterThan(buildingMaxHp(w, b));
  });

  it('factions, mode and mode state survive a save', () => {
    const w = new World(flatMap(), { mode: 'domination', factions: ['coastal', 'mountain'] });
    w.modeState.sites[0].owner = 1;
    w.modeState.score = [12, 34];
    const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
    expect(back.mode).toBe('domination');
    expect(back.players.map((p) => p.faction)).toEqual(['coastal', 'mountain']);
    expect(back.players[0].mods.sellShare).toBe(w.players[0].mods.sellShare);
    expect(back.modeState.sites[0].owner).toBe(1);
    expect(back.modeState.score).toEqual([12, 34]);
  });
});
