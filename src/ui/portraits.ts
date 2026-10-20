// HUD portraits: units and buildings rendered large from the same procedural art.
import { BuildingSprites } from '../render/buildingSprites';
import { UnitSprites, lookIndex } from '../render/unitSprites';
import { BUILDING_DEFS, type Building, type Entity } from '../sim/entities';
import { ICONS } from './icons';

const PX = 128;
const units = new UnitSprites(PX);
const buildings = new BuildingSprites(56);
const cache = new Map<string, string>();

function once(key: string, make: () => HTMLCanvasElement): string {
  let url = cache.get(key);
  if (!url) {
    url = make().toDataURL('image/png');
    cache.set(key, url);
  }
  return url;
}

/** Portrait markup for an entity: a painted image for units and buildings, an icon otherwise. */
export function portrait(e: Entity | { kind: 'building'; type: Building['type']; owner: number }): string {
  if (e.kind === 'unit') {
    const look = lookIndex(e.id);
    return `<img alt="" src="${once(`u|${e.type}|${e.owner}|${look}`, () => units.portrait(e.type, e.owner, look, PX))}">`;
  }
  if (e.kind === 'building') {
    return `<img alt="" src="${once(`b|${e.type}|${e.owner}`, () => {
      const sp = buildings.get(e.type, BUILDING_DEFS[e.type].size, e.owner, e.type === 'farm' ? 3 : 0);
      const c = document.createElement('canvas');
      c.width = c.height = PX;
      const g = c.getContext('2d')!;
      const k = Math.min(PX / sp.c.width, PX / sp.c.height) * 1.05;
      g.drawImage(sp.c, (PX - sp.c.width * k) / 2, (PX - sp.c.height * k) / 2 + 4, sp.c.width * k, sp.c.height * k);
      return c;
    })}">`;
  }
  return (ICONS as Record<string, string>)[e.type] ?? '';
}
