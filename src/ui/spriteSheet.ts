// Debug view (?sheet): every unit pose drawn large, for reviewing the art.
import type { View } from '../render/canvas';
import type { Tool } from '../render/figures';
import type { UnitType } from '../sim/entities';
import { BuildingSprites } from '../render/buildingSprites';
import { UnitSprites } from '../render/unitSprites';
import { shipSprite } from '../render/shipFigures';

export function drawSpriteSheet(view: View, zoom = 4): void {
  const { ctx } = view;
  const sprites = new UnitSprites(Math.round(32 * zoom * view.dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5a8a3c';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const cell = 32 * zoom * view.dpr * 1.05;
  let x = cell * 0.5, row = 0;
  const put = (type: UnitType, player: number, look: number, pose: Parameters<UnitSprites['get']>[3], elite = false) => {
    const sp = sprites.get(type, player, look, pose, elite);
    if (x + sp.c.width > ctx.canvas.width) {
      x = cell * 0.5;
      row++;
    }
    const y = (row + 0.9) * cell * 1.3;
    ctx.drawImage(sp.c, x, y - sp.ay);
    x += sp.c.width + cell * 0.15;
  };
  const next = () => {
    x = cell * 0.5;
    row++;
  };
  const base = { left: false, frame: 0, tool: 'none' as Tool, carry: null };
  for (const v of ['front', 'side', 'back'] as const) put('villager', 0, 0, { ...base, view: v, anim: 'idle' });
  for (let f = 0; f < 3; f++) put('villager', 1, 1, { ...base, view: 'side', anim: 'walk', frame: f * 2 });
  for (const tool of ['axe', 'pick', 'hammer', 'basket', 'spear', 'hoe'] as Tool[]) put('villager', 0, 2 + (x % 3 | 0), { ...base, view: 'side', anim: 'work', frame: 2, tool });
  for (const carry of ['wood', 'food', 'gold'] as const) put('villager', 2, 4, { ...base, view: 'side', anim: 'walk', frame: 1, carry });
  next();
  for (const t of ['militia', 'spearman', 'archer', 'skirmisher', 'monk', 'claymore', 'arbalest_guard', 'king', 'petard'] as const) {
    put(t, 0, 3, { ...base, view: 'front', anim: 'idle' });
    put(t, 1, 5, { ...base, view: 'side', anim: 'idle' });
    put(t, 2, 6, { ...base, view: 'side', anim: 'work', frame: 2, tool: 'rifle' });
  }
  next();
  for (const t of ['militia', 'spearman', 'archer'] as const) put(t, 3, 1, { ...base, view: 'side', anim: 'work', frame: 2, tool: 'rifle' }, true);
  for (const t of ['militia', 'spearman', 'archer', 'skirmisher'] as const) put(t, 0, 2, { ...base, view: 'back', anim: 'walk', frame: 1 });
  for (const t of ['archer', 'skirmisher'] as const) put(t, 0, 2, { ...base, view: 'side', anim: 'walk', frame: 2 });
  next();
  for (const t of ['scout', 'horse_archer', 'knight', 'iron_bear'] as const) {
    put(t, 0, 0, { ...base, view: 'side', anim: 'walk', frame: 1 });
    put(t, 1, 0, { ...base, view: 'side', anim: 'work', frame: 2 });
  }
  next();
  for (const t of ['scout', 'horse_archer', 'knight', 'iron_bear'] as const) {
    put(t, 2, 0, { ...base, view: 'front', anim: 'idle' });
    put(t, 3, 0, { ...base, view: 'back', anim: 'walk', frame: 1 });
  }
  put('scout', 0, 0, { ...base, view: 'side', anim: 'idle' }, true);
  next();
  for (const t of ['ram', 'mangonel', 'scorpion', 'siege_tower'] as const) {
    put(t, 0, 0, { ...base, view: 'side', anim: 'idle' });
    put(t, 1, 0, { ...base, view: 'side', anim: 'work', frame: 2 });
  }
  next();
  put('trebuchet', 0, 0, { ...base, view: 'side', anim: 'idle', packed: true });
  put('trebuchet', 1, 0, { ...base, view: 'side', anim: 'work', frame: 2, packed: false });
  put('trebuchet', 2, 0, { ...base, view: 'side', anim: 'idle', packed: false });
}

/** Debug view (?buildings=zoom): every building at one zoom, on grass. */
export function drawBuildingSheet(view: View, z = 48): void {
  const { ctx } = view;
  const tw = Math.round(z * view.dpr) * 2;
  const sprites = new BuildingSprites(tw);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5f8a3e';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const list: Array<readonly [Parameters<BuildingSprites['get']>[0], number, number]> = [
    ['town_center', 4, 0],
    ['castle', 4, 0],
    ['wonder', 5, 0],
    ['house', 2, 0],
    ['mill', 2, 0],
    ['lumber_camp', 2, 0],
    ['mining_camp', 2, 0],
    ['barracks', 3, 0],
    ['archery_range', 3, 0],
    ['stable', 3, 0],
    ['monastery', 3, 0],
    ['blacksmith', 3, 0],
    ['market', 3, 0],
    ['university', 3, 0],
    ['siege_workshop', 3, 0],
    ['dock', 3, 0],
    ['fish_trap', 3, 3],
    ['farm', 3, 3],
    ['palisade_wall', 1, 17],
    ['palisade_gate', 1, 17],
    ['palisade_gate', 1, 17 | 1024],
    ['stone_wall', 1, 17],
    ['stone_wall', 1, 68 | 256],
    ['gate', 1, 17],
    ['gate', 1, 17 | 1024],
    ['watch_tower', 1, 0],
    ['watch_tower', 1, 1 << 12],
    ['watch_tower', 1, 2 << 12],
  ];
  let x = 10, y = 10, rowH = 0;
  const ages = Number(new URLSearchParams(location.search).get('age') ?? 0);
  for (const [type, size, variant] of list) {
    const sp = sprites.get(type, size, 0, variant, ages);
    if (x + sp.c.width > ctx.canvas.width) {
      x = 10;
      y += rowH;
      rowH = 0;
    }
    ctx.drawImage(sp.c, x, y);
    x += sp.c.width;
    rowH = Math.max(rowH, sp.c.height);
  }
}

/** Debug view (?ships): every ship at all eight headings on a water background. */
export function drawShipSheet(view: View, zoom = 1.6): void {
  const { ctx } = view;
  const s = Math.round(32 * zoom * view.dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b6aa3';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const types = ['fishing_ship', 'transport_ship', 'galley', 'fire_ship', 'demolition_raft', 'siege_barge'] as const;
  const cw = s * 2.2, ch = s * 2.6;
  types.forEach((t, row) =>
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((dir, col) => {
      const sp = shipSprite(t, s, '#2f6fe0', { dir, frame: col % 4, work: t === 'fishing_ship' && col === 7, attack: col === 6, elite: false });
      const k = sp.k ?? 1;
      ctx.drawImage(sp.c, (col + 0.6) * cw - sp.ax * k, (row + 0.75) * ch * 0.62 + s * 0.8 - sp.ay * k, sp.c.width * k, sp.c.height * k);
    }),
  );
}
