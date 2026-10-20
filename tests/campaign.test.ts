import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../src/sim/campaigns';
import { generateMap } from '../src/sim/mapgen';
import { loadWorld, saveWorld } from '../src/sim/save';
import { SCENARIOS, type ScenarioDef, nextWaveIn, objectiveDone, planOf } from '../src/sim/scenario';
import { TICK_RATE, World } from '../src/sim/world';

const start = (id: string, variant = '') => {
  const def = SCENARIOS.get(id)!;
  const map = generateMap({ type: def.map.type, size: def.map.size, players: 2, seed: def.map.seed });
  return { def, w: new World(map, { mode: def.mode, factions: def.factions, scenario: { def, variant: variant || def.variants?.[0]?.id || '' } }) };
};
const run = (w: World, s: number, until?: () => boolean) => {
  for (let i = 0; i < s * TICK_RATE; i++) {
    w.step();
    if (until?.()) return i / TICK_RATE;
  }
  return s;
};

describe('campaigns', () => {
  it('every chapter sets up: a town, its keep and its enemy', () => {
    for (const c of CAMPAIGNS)
      for (const id of c.chapters) {
        const def: ScenarioDef = SCENARIOS.get(id)!;
        expect(def, id).toBeTruthy();
        const { w } = start(id);
        const st = w.scenario!;
        expect([...w.buildings(0)].some((b) => b.type === 'town_center'), id).toBe(true);
        if (def.player.keep) expect(w.building(st.keep)?.type, id).toBe(def.player.keep);
        // Every building asked for was placed, docks on the shore.
        for (const [type, n] of def.player.buildings ?? []) expect([...w.buildings(0)].filter((b) => b.type === type).length, `${id} ${type}`).toBeGreaterThanOrEqual(n);
        for (const b of w.buildings()) if (b.type === 'dock') expect(w.besideWater(b.x, b.y, b.size), id).toBe(true);
        if (def.enemy.kind === 'ai') expect([...w.buildings(1)].length, id).toBeGreaterThan(0);
        else expect([...w.units(1)].length + [...w.buildings(1)].length, id).toBe(0);
        if (def.enemy.kind === 'horde') expect(st.spawns.length, id).toBeGreaterThanOrEqual(1);
        expect(planOf(st).objectives.length, id).toBeGreaterThan(0);
      }
  });

  it('completing every objective wins the chapter', () => {
    const { w } = start('ember-1');
    const p = w.players[0];
    p.gathered.food += 600;
    p.gathered.wood += 600;
    for (let k = 0; k < 4; k++) w.placeBuilding('house', 0, 4 + k * 3, 4, true);
    run(w, 2);
    expect(w.winner).toBeNull();
    p.age = 1;
    run(w, 2);
    expect(w.winner).toBe(p.team);
    expect(w.victoryReason).toBe('objectives');
    expect(w.scenario!.outcome).toMatch(/complete/);
  });

  it('the Last Bastion: waves come on schedule and march on the Castle; beaten waves are not a conquest', () => {
    const { w } = start('bastion-1', '20');
    const keep = w.building(w.scenario!.keep)!;
    expect(keep.type).toBe('castle');
    expect(w.players[0].resources.stone).toBeGreaterThanOrEqual(5000);
    expect(nextWaveIn(w)).toBe(6 * 60);
    run(w, 6 * 60 + 2);
    const raiders = [...w.units(1)];
    expect(raiders.length).toBeGreaterThan(5);
    run(w, 3);
    expect(raiders.filter((u) => u.order?.type === 'attack').length).toBeGreaterThan(raiders.length / 2);
    // Wipe the wave out: no victory by conquest, the siege goes on.
    for (const u of raiders) w.remove(u.id);
    run(w, 3);
    expect(w.winner).toBeNull();
    expect(w.players[1].defeated).toBe(false);
  });

  it('the Last Bastion is won by holding the Castle to the end, lost when it falls', () => {
    {
      const { w } = start('bastion-1', '20');
      // A defender who kills everything that arrives.
      for (let t = 0; t < 20 * 60 + 10; t += 5) {
        run(w, 5);
        for (const u of [...w.units(1)]) w.remove(u.id);
        if (w.winner !== null) break;
      }
      expect(w.winner).toBe(w.players[0].team);
      expect(w.time).toBeGreaterThanOrEqual(20 * 60);
    }
    {
      const { w } = start('bastion-1', '20');
      w.remove(w.scenario!.keep);
      run(w, 2);
      expect(w.winner).toBe(w.players[1].team);
      expect(w.scenario!.outcome).toMatch(/fallen/);
    }
  }, 60000);

  it('invaders who cannot reach the Castle break the walls in the way', () => {
    const { w } = start('bastion-1', '20');
    const keep = w.building(w.scenario!.keep)!;
    // Ring the keep with stone wall.
    const ring: Array<{ x: number; y: number }> = [];
    for (let k = -3; k <= keep.size + 2; k++) ring.push({ x: keep.x + k, y: keep.y - 3 }, { x: keep.x + k, y: keep.y + keep.size + 2 }, { x: keep.x - 3, y: keep.y + k }, { x: keep.x + keep.size + 2, y: keep.y + k });
    for (const t of ring) if (w.canPlace('stone_wall', 0, t.x, t.y)) w.placeBuilding('stone_wall', 0, t.x, t.y, true);
    run(w, 6 * 60 + 25);
    const targets = [...w.units(1)].map((u) => (u.order?.type === 'attack' ? w.building(u.order.id)?.type : undefined)).filter(Boolean);
    expect(targets.some((t) => t === 'stone_wall' || t === 'gate')).toBe(true);
  }, 60000);

  it('a chapter survives a save and load mid-siege', () => {
    const { w } = start('bastion-1', '30');
    run(w, 8 * 60 + 5);
    const back = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
    expect(back.scenario!.id).toBe('bastion-1');
    expect(back.scenario!.wave).toBe(w.scenario!.wave);
    expect(back.building(back.scenario!.keep)).toBeTruthy();
    expect(objectiveDone(back, back.scenario!, planOf(back.scenario!).objectives[0])).toBe(false);
  }, 60000);

  it('the Last Bastion grows: longer sieges have more and bigger waves', () => {
    const plan = (v: string) => planOf({ id: 'bastion-1', variant: v } as never);
    expect(plan('45').waves.length).toBeGreaterThan(plan('30').waves.length);
    expect(plan('30').waves.length).toBeGreaterThan(plan('20').waves.length);
    const size = (v: string) => Object.values(plan(v).waves.at(-2)!.units).reduce((a, b) => a + (b ?? 0), 0);
    expect(size('30')).toBeGreaterThan(Object.values(plan('30').waves[0].units).reduce((a, b) => a + (b ?? 0), 0));
  });
});

describe('campaign extras', () => {
  it('a time limit loses the chapter when it runs out', () => {
    const { w } = start('trial-winter');
    run(w, 15 * 60 + 3, () => w.winner !== null);
    expect(w.winner).toBe(w.players[1].team);
    expect(w.scenario!.outcome).toMatch(/Winter/);
  }, 60000);

  it('the Trials are all open from the start; other campaigns unlock in order', async () => {
    const { unlocked } = await import('../src/ui/campaignScreen');
    const empty = { done: {} };
    for (const id of ['trial-winter', 'trial-ironwood', 'trial-wonder', 'trial-king']) expect(unlocked(id, empty)).toBe(true);
    expect(unlocked('isles-1', empty)).toBe(true);
    expect(unlocked('isles-2', empty)).toBe(false);
    expect(unlocked('isles-2', { done: { 'isles-1': 600 } })).toBe(true);
  });
});
