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
  let col = 0, row = 0;
  const put = (type: UnitType, player: number, look: number, pose: Parameters<UnitSprites['get']>[3]) => {
    const sp = sprites.get(type, player, look, pose);
    const x = (col + 0.5) * cell * (type === 'scout' || type === 'knight' ? 1.5 : 1), y = (row + 0.9) * cell * 1.3;
    ctx.drawImage(sp.c, x - sp.ax, y - sp.ay);
    col++;
  };
  const base = { left: false, frame: 0, tool: 'none' as Tool, carry: null };
  for (const v of ['front', 'side', 'back'] as const) put('villager', 0, 0, { ...base, view: v, anim: 'idle' });
  for (let f = 0; f < 6; f++) put('villager', 1, 1, { ...base, view: 'side', anim: 'walk', frame: f });
  row++;
  col = 0;
  for (const tool of ['axe', 'pick', 'hammer', 'basket', 'knife', 'spear'] as Tool[]) put('villager', 0, 2 + (col % 2), { ...base, view: 'side', anim: 'work', frame: tool === 'axe' ? 0 : 2, tool });
  for (const carry of ['wood', 'food', 'gold'] as const) put('villager', 2, 4, { ...base, view: 'side', anim: 'walk', frame: 1, carry });
  row++;
  col = 0;
  for (const v of ['front', 'back'] as const) put('villager', 3, 5, { ...base, view: v, anim: 'walk', frame: 1, carry: 'stone' });
  for (const v of ['front', 'side', 'back'] as const) put('militia', 0, 1, { ...base, view: v, anim: 'idle' });
  put('militia', 1, 2, { ...base, view: 'side', anim: 'work', frame: 2 });
  row++;
  col = 0;
  for (const t of ['spearman', 'archer', 'skirmisher', 'monk'] as const) {
    const tool: Tool = t === 'spearman' ? 'spear' : t === 'archer' ? 'bow' : t === 'skirmisher' ? 'javelin' : 'staff';
    put(t, 0, 3, { ...base, view: 'front', anim: 'idle' });
    put(t, 1, 3, { ...base, view: 'side', anim: 'work', frame: 2, tool });
  }
  put('knight', 0, 0, { ...base, view: 'side', anim: 'idle' });
  put('knight', 1, 0, { ...base, view: 'front', anim: 'walk', frame: 1 });
  row++;
  col = 0;
  for (const t of ['ram', 'mangonel', 'scorpion', 'siege_tower'] as const) {
    put(t, 0, 0, { ...base, view: 'side', anim: 'idle' });
    col += 0.5;
  }
  put('trebuchet', 0, 0, { ...base, view: 'side', anim: 'idle', packed: true });
  col += 0.8;
  put('trebuchet', 1, 0, { ...base, view: 'side', anim: 'work', frame: 2, packed: false });
  col += 0.5;
  put('petard', 0, 0, { ...base, view: 'side', anim: 'walk', frame: 1 });
  row++;
  col = 0;
  put('scout', 0, 0, { ...base, view: 'side', anim: 'idle' });
  put('scout', 1, 0, { ...base, view: 'side', anim: 'walk', frame: 2 });
  put('scout', 2, 0, { ...base, view: 'front', anim: 'walk', frame: 1 });
  put('scout', 3, 0, { ...base, view: 'back', anim: 'walk', frame: 3 });
}

/** Debug view (?buildings=zoom): every building at one zoom, on grass. */
export function drawBuildingSheet(view: View, z = 48): void {
  const { ctx } = view;
  const tw = Math.round(z * view.dpr) * 2;
  const sprites = new BuildingSprites(tw);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5f8a3e';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const list = [
    ['blacksmith', 3, 0],
    ['market', 3, 0],
    ['university', 3, 0],
    ['town_center', 4, 0],
    ['house', 2, 0],
    ['mill', 2, 0],
    ['lumber_camp', 2, 0],
    ['mining_camp', 2, 0],
    ['barracks', 3, 0],
    ['archery_range', 3, 0],
    ['stable', 3, 0],
    ['monastery', 3, 0],
    ['farm', 3, 3],
  ] as const;
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
