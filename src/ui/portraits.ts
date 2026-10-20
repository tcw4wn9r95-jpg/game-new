// HUD portraits: units and buildings rendered large from the same procedural art.
import { BuildingSprites } from '../render/buildingSprites';
import { UnitSprites, lookIndex } from '../render/unitSprites';
import { BUILDING_DEFS, type Building, type Entity, UNIT_DEFS, type UnitType } from '../sim/entities';
import { ICONS, UPGRADE_OF, techIcon } from './icons';

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
    return `<img alt="" src="${buildingArt(e.type, e.owner)}">`;
  }
  return (ICONS as Record<string, string>)[e.type] ?? '';
}

/** A painted image as an SVG icon, with optional extra SVG markup drawn over it. */
const artSvg = (url: string, over = '') =>
  `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><image href="${url}" x="-1" y="-1" width="26" height="26"/>${over}</svg>`;

function buildingArt(type: Building['type'], owner: number): string {
  return once(`b|${type}|${owner}`, () => {
    const sp = buildings.get(type, BUILDING_DEFS[type].size, owner, type === 'farm' ? 3 : type === 'palisade_wall' || type === 'stone_wall' || type === 'palisade_gate' || type === 'gate' ? 17 : 0);
    const c = document.createElement('canvas');
    c.width = c.height = PX;
    const g = c.getContext('2d')!;
    const k = Math.min(PX / sp.c.width, PX / sp.c.height) * 1.05;
    g.drawImage(sp.c, (PX - sp.c.width * k) / 2, (PX - sp.c.height * k) / 2 + 4, sp.c.width * k, sp.c.height * k);
    return c;
  });
}

/** Button art for a unit or building type: the same painted image as its portrait. */
export function artIcon(type: string, owner: number): string {
  if (type in UNIT_DEFS) return artSvg(once(`u|${type}|${owner}|0`, () => units.portrait(type as UnitType, owner, 0, PX)));
  if (type in BUILDING_DEFS) return artSvg(buildingArt(type as Building['type'], owner));
  return (ICONS as Record<string, string>)[type] ?? '';
}

/** Technology icon; unit and tower upgrades show the unit's art with an upgrade chevron. */
export function techArt(id: string, owner: number): string {
  const base = UPGRADE_OF[id];
  if (!base) return techIcon(id);
  const chevron = '<path d="M15 9l4-4 4 4" fill="none" stroke="#0a1018" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 9l4-4 4 4" fill="none" stroke="#7fe9ff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return artIcon(base, owner).replace('</svg>', `${chevron}</svg>`);
}
