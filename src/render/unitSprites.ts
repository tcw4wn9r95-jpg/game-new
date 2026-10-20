// Unit sprites rendered lazily from the articulated figures, per zoom level.
import type { ResourceKind } from '../sim/constants';
import type { UnitType } from '../sim/entities';
import { type Anim, CLOTHS, type FigureSpec, HAIRS, type Look, SKINS, type Tool, type View, drawVillager } from './figures';
import { drawArbalest, drawArcher, drawClaymore, drawKing, drawMilitia, drawMonk, drawPetard, drawSkirmisher, drawSpearman } from './troops';
import { drawHorseArcher, drawIronBear, drawKnight, drawMangonel, drawRam, drawScorpion, drawScout, drawSiegeTower, drawTrebuchet } from './vehicles';
import { grade } from './materials';
import { SHIP_TYPES, type ShipType, shipPortrait, shipSprite } from './shipFigures';
import { PLAYER_COLORS } from './palette';
import { type Sprite, SpriteCache, cropSprite } from './sprites';

/** Per-type size (tiles per 100 figure units) and drawing bounds in figure units. */
const DEFS: Record<Exclude<UnitType, ShipType>, { tilesPer100: number; x0: number; x1: number; y0: number; y1: number; draw: (g: CanvasRenderingContext2D, f: FigureSpec) => void }> = {
  villager: { tilesPer100: 0.82, x0: -45, x1: 55, y0: -150, y1: 12, draw: drawVillager },
  scout: { tilesPer100: 1.15, x0: -62, x1: 62, y0: -95, y1: 12, draw: drawScout },
  militia: { tilesPer100: 0.86, x0: -50, x1: 70, y0: -150, y1: 12, draw: drawMilitia },
  spearman: { tilesPer100: 0.86, x0: -60, x1: 80, y0: -150, y1: 12, draw: drawSpearman },
  archer: { tilesPer100: 0.84, x0: -50, x1: 75, y0: -150, y1: 12, draw: drawArcher },
  skirmisher: { tilesPer100: 0.86, x0: -50, x1: 60, y0: -150, y1: 12, draw: drawSkirmisher },
  knight: { tilesPer100: 1.2, x0: -80, x1: 125, y0: -110, y1: 14, draw: drawKnight },
  monk: { tilesPer100: 0.84, x0: -45, x1: 60, y0: -150, y1: 12, draw: drawMonk },
  petard: { tilesPer100: 0.84, x0: -50, x1: 60, y0: -150, y1: 12, draw: drawPetard },
  ram: { tilesPer100: 0.95, x0: -70, x1: 75, y0: -110, y1: 14, draw: drawRam },
  mangonel: { tilesPer100: 0.95, x0: -70, x1: 100, y0: -140, y1: 14, draw: drawMangonel },
  scorpion: { tilesPer100: 0.95, x0: -60, x1: 60, y0: -90, y1: 12, draw: drawScorpion },
  siege_tower: { tilesPer100: 0.95, x0: -70, x1: 70, y0: -90, y1: 14, draw: drawSiegeTower },
  trebuchet: { tilesPer100: 0.8, x0: -110, x1: 115, y0: -190, y1: 14, draw: drawTrebuchet },
  claymore: { tilesPer100: 0.9, x0: -55, x1: 75, y0: -150, y1: 12, draw: drawClaymore },
  horse_archer: { tilesPer100: 1.15, x0: -62, x1: 62, y0: -95, y1: 12, draw: drawHorseArcher },
  arbalest_guard: { tilesPer100: 0.86, x0: -50, x1: 90, y0: -150, y1: 12, draw: drawArbalest },
  iron_bear: { tilesPer100: 1.25, x0: -85, x1: 140, y0: -115, y1: 14, draw: drawIronBear },
  king: { tilesPer100: 0.9, x0: -45, x1: 55, y0: -150, y1: 12, draw: drawKing },
};

/**
 * Unit sprite px per 32-unit tile, relative to Z. Smaller than trees and
 * scenery so that people stand at about a third of a house's height.
 */
export const UNIT_K = 1.05;

/** Height of a unit's figure in tiles (before UNIT_K), for hit-testing taps. */
export const unitHeight = (type: UnitType) =>
  isShipType(type)
    ? type === 'demolition_raft'
      ? 0.6
      : type === 'fishing_ship'
        ? 1.4
        : 1.9
    : type === 'siege_tower' ? 0.75 : type === 'trebuchet' ? 1.2 : type === 'scout' || type === 'horse_archer' ? 0.85 : type === 'knight' || type === 'iron_bear' ? 0.85 : type === 'ram' || type === 'mangonel' ? 0.95 : type === 'scorpion' ? 0.7 : type === 'villager' ? 0.85 : 0.9;

/** Eight preset looks so crowds vary; picked by unit id. */
const LOOKS: Look[] = Array.from({ length: 8 }, (_, i) => ({
  female: i % 2 === 1,
  skin: SKINS[(i * 7 + 1) % SKINS.length],
  hair: HAIRS[(i * 3) % HAIRS.length],
  cloth: CLOTHS[(i * 5 + 2) % CLOTHS.length],
}));
export const lookIndex = (id: number) => (id * 2654435761) >>> 29;

/** The tech that upgrades each unit line (and changes its kit). */
export const UPGRADE_TECH: Partial<Record<UnitType, string>> = {
  militia: 'swordsman',
  spearman: 'pikeman',
  archer: 'crossbowman',
  scout: 'light_cavalry',
  ram: 'capped_ram',
  mangonel: 'onager',
  galley: 'war_galley',
};

/** Ships are drawn larger than their footprint in the simulation, as in AoE, so they read at sea. */
const SHIP_K = 1.5;
/** Most device px per tile a ship sprite is painted at. */
const SHIP_PX_CAP = 110;

const isShipType = (t: UnitType): t is ShipType => (SHIP_TYPES as string[]).includes(t);

export interface UnitPose {
  /** Ships: heading 0-7. */
  dir?: number;
  /** Ships: firing. */
  attack?: boolean;
  view: View;
  /** Side view facing left. */
  left: boolean;
  /** Trebuchets: packed for travel. */
  packed?: boolean;
  anim: Anim;
  frame: number;
  tool: Tool;
  carry: ResourceKind | null;
}

/** Memory allowed for one zoom level's unit and ship sprites. */
const UNIT_BUDGET = 40 * 1024 * 1024;

export class UnitSprites {
  private readonly cache = new SpriteCache(UNIT_BUDGET);

  constructor(readonly s: number) {}

  get(type: UnitType, player: number, look: number, p: UnitPose, elite = false): Sprite {
    if (isShipType(type)) {
      const work = p.anim === 'work' && !p.attack;
      // Two swell frames: rolled to port and to starboard.
      const frame = p.frame % 2;
      const key = `${type}|${player}|${p.dir ?? 1}|${frame}|${work ? 1 : 0}|${p.attack ? 1 : 0}|${elite ? 1 : 0}`;
      return this.cache.get(key, () => {
        // Big ships at close zoom on dense screens would take megabytes each: paint them
        // at a capped resolution and scale up when drawn.
        const want = (this.s / UNIT_K) * SHIP_K, paint = Math.min(want, SHIP_PX_CAP);
        const sp = cropSprite(shipSprite(type, paint, PLAYER_COLORS[player % PLAYER_COLORS.length], { dir: p.dir ?? 1, frame, work, attack: !!p.attack, elite }));
        sp.k = want / paint;
        return sp;
      });
    }
    const key = `${type}|${player}|${look}|${p.view}|${p.left ? 1 : 0}|${p.anim}|${p.frame}|${p.tool}|${p.carry ?? ''}|${elite ? 1 : 0}|${p.packed === false ? 0 : 1}`;
    return this.cache.get(key, () => this.render(type as Exclude<UnitType, ShipType>, player, look, p, elite));
  }

  /** Releases every cached sprite. */
  dispose(): void {
    this.cache.clear();
  }

  /** A large head-and-shoulders render for the HUD portrait. */
  portrait(type: UnitType, player: number, look: number, px: number): HTMLCanvasElement {
    if (isShipType(type)) return shipPortrait(type, px, PLAYER_COLORS[player % PLAYER_COLORS.length]);
    const d = DEFS[type];
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    // Frame foot soldiers from the waist up; vehicles and heavy weapons are shown whole.
    const engine = ['ram', 'mangonel', 'scorpion', 'siege_tower', 'trebuchet', 'scout', 'knight', 'horse_archer', 'iron_bear'].includes(type);
    if (engine) {
      const k = Math.min(px / (d.x1 - d.x0), px / (d.y1 - d.y0)) * 0.95;
      g.translate(px / 2 - ((d.x0 + d.x1) / 2) * k, px / 2 - ((d.y0 + d.y1) / 2) * k);
      g.scale(k, k);
      d.draw(g, this.spec(player, look, { view: 'side', left: false, anim: 'idle', frame: 0, tool: 'none', carry: null, packed: false }));
      return c;
    }
    const k = px / 70;
    g.translate(px / 2, px * 1.72);
    g.scale(k, k);
    d.draw(g, this.spec(player, look, { view: 'front', left: false, anim: 'idle', frame: 0, tool: 'none', carry: null }));
    return c;
  }

  private spec(player: number, look: number, p: UnitPose, elite = false): FigureSpec {
    return { view: p.view, anim: p.anim, frame: p.frame, tool: p.tool, carry: p.carry, team: PLAYER_COLORS[player % PLAYER_COLORS.length], look: LOOKS[look % LOOKS.length], elite, packed: p.packed };
  }

  private render(type: Exclude<UnitType, ShipType>, player: number, look: number, p: UnitPose, elite: boolean): Sprite {
    const d = DEFS[type];
    const k = (this.s * d.tilesPer100) / 100; // device px per figure unit
    const c = document.createElement('canvas');
    c.width = Math.ceil((d.x1 - d.x0) * k);
    c.height = Math.ceil((d.y1 - d.y0) * k);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const ax = -d.x0 * k, ay = -d.y0 * k;
    g.translate(ax, ay);
    if (p.left) g.scale(-1, 1);
    g.scale(k, k);
    d.draw(g, this.spec(player, look, p, elite));
    grade(c, 0.05, look * 13 + p.frame);
    return { c, ax, ay };
  }
}
