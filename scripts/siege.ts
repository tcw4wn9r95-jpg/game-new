// Plays the Last Bastion headless with a scripted defender, to check the siege
// is winnable when prepared for and lost when not. Usage: node dist-scripts/siege.mjs <minutes> <passive|prepared>
import '../src/sim/campaigns';
import { generateMap } from '../src/sim/mapgen';
import { SCENARIOS } from '../src/sim/scenario';
import { completeTech, type TechId } from '../src/sim/techs';
import { TICK_RATE, World } from '../src/sim/world';

const variant = process.argv[2] ?? '30';
const style = process.argv[3] ?? 'prepared';
const def = SCENARIOS.get('bastion-1')!;
const w = new World(generateMap({ type: def.map.type, size: def.map.size, players: 2, seed: def.map.seed }), { factions: def.factions, scenario: { def, variant } });
const keep = w.building(w.scenario!.keep)!;
const tc = [...w.buildings(0)].find((b) => b.type === 'town_center')!;
if (style === 'prepared') {
  const p = w.players[0];
  for (const t of ['forging', 'fletching', 'scale_mail', 'scale_barding', 'padded_archer', 'iron_casting', 'bodkin_arrow', 'chain_mail', 'chain_barding', 'leather_archer', 'pikeman', 'crossbowman', 'masonry'] as TechId[]) completeTech(w, 0, t);
  p.resources.food -= 3000; p.resources.gold -= 2500; p.resources.wood -= 1000;
  // A stone ring round the Castle and Town Center, towers inside it.
  const cx = (keep.x + tc.x + 4) / 2, cy = (keep.y + tc.y + 4) / 2, r = 14;
  const ring: Array<{ x: number; y: number; gate?: boolean }> = [];
  for (let k = -r; k <= r; k++) ring.push({ x: Math.round(cx + k), y: Math.round(cy - r) }, { x: Math.round(cx + k), y: Math.round(cy + r) }, { x: Math.round(cx - r), y: Math.round(cy + k) }, { x: Math.round(cx + r), y: Math.round(cy + k) });
  let walls = 0;
  for (const t of ring) if (w.canPlace('stone_wall', 0, t.x, t.y)) (w.placeBuilding('stone_wall', 0, t.x, t.y, true), walls++);
  p.resources.stone -= walls * 5;
  let towers = 0;
  for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, -10], [0, 10], [-10, 0], [10, 0]]) {
    for (let j = 0; j < 4; j++) if (w.canPlace('watch_tower', 0, Math.round(cx + dx) + j, Math.round(cy + dy))) { w.placeBuilding('watch_tower', 0, Math.round(cx + dx) + j, Math.round(cy + dy), true); towers++; break; }
  }
  const spawn = (t: Parameters<typeof w.spawnUnit>[0], n: number) => { for (let k = 0; k < n; k++) w.spawnUnit(t, 0, cx + (k % 6) - 3, cy + Math.floor(k / 6) - 2).stance = 'defensive'; };
  spawn('spearman', 12); spawn('archer', 14); spawn('knight', 6); spawn('mangonel', 2);
  console.log(`prepared: ${walls} wall segments, ${towers} towers`);
}
let last = 0;
for (let t = 0; t < (Number(variant) * 60 + 10) * TICK_RATE && w.winner === null; t++) {
  w.step();
  // The defender sallies out at whatever comes within 20 tiles of the Castle, siege first.
  if (style === 'prepared' && t % 50 === 0) {
    const near = [...w.units(1)].filter((u) => !u.inside && Math.hypot(u.x - keep.x - 2, u.y - keep.y - 2) < 22);
    near.sort((a, b) => (b.type === 'trebuchet' || b.type === 'ram' || b.type === 'mangonel' ? 1 : 0) - (a.type === 'trebuchet' || a.type === 'ram' || a.type === 'mangonel' ? 1 : 0));
    const idle = [...w.units(0)].filter((u) => u.type !== 'villager' && !u.order);
    if (near[0] && idle.length) w.issue(0, { type: 'attack', ids: idle.map((u) => u.id), id: near[0].id });
    // Villagers keep the walls and the Castle repaired.
    if (t % 100 === 0) {
      const hurt = [...w.buildings(0)].filter((b) => b.complete && b.hp < 0.8 * (b.type === 'castle' ? 6072 : 2000)).sort((a, b) => a.hp - b.hp)[0];
      const vs = [...w.units(0)].filter((u) => u.type === 'villager' && u.order?.type !== 'repair').slice(0, 6);
      if (hurt && vs.length) w.issue(0, { type: 'repair', ids: vs.map((u) => u.id), id: hurt.id });
    }
  }
  if (w.time - last >= 120) {
    last = w.time;
    const mine = [...w.units(0)].filter((u) => u.type !== 'villager').length;
    console.log(`${(w.time / 60).toFixed(0)}m keep ${Math.round(keep.hp)} army ${mine} invaders ${[...w.units(1)].length} walls ${[...w.buildings(0)].filter((b) => b.type === 'stone_wall').length}`);
  }
}
console.log(JSON.stringify({ variant, style, winner: w.winner, minutes: +(w.time / 60).toFixed(1), outcome: w.scenario!.outcome }));
