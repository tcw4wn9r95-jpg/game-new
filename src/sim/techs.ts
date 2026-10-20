// Technologies and ages: what each player has researched, the effective unit and
// building stats that follow from it, and the rules for what can be researched,
// trained and built in each age.
import ages from '../data/ages.json';
import factions from '../data/factions.json';
import techs from '../data/techs.json';
import type { ResourceKind } from './constants';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type UnitClass, type UnitDef, type UnitType } from './entities';
import type { World } from './world';

export type TechId = keyof typeof techs;

export type TechEffect =
  | { type: 'age'; age: number }
  | {
      type: 'unit';
      units?: UnitType[];
      classes?: UnitClass[];
      attack?: number;
      meleeArmor?: number;
      pierceArmor?: number;
      range?: number;
      hp?: number;
      los?: number;
      speedMult?: number;
      buildingAttack?: number;
      buildingMult?: number;
      hpMult?: number;
    }
  /** Training time multiplier at one kind of building. */
  | { type: 'train'; building: BuildingType; mult: number }
  /** Unit cost multiplier by class. */
  | { type: 'cost'; classes: UnitClass[]; mult: number }
  /** Building cost multiplier (optionally one resource only). */
  | { type: 'buildingCost'; buildings: BuildingType[]; resource?: ResourceKind; mult: number }
  | { type: 'market'; sellShare: number }
  | { type: 'ballistics' }
  | { type: 'upgrade'; unit: UnitType; name: string }
  | { type: 'gather'; sources: string[]; mult: number }
  | { type: 'carry'; add: number }
  | { type: 'farm'; add: number }
  | { type: 'building'; los?: number; hpMult?: number; meleeArmor?: number; pierceArmor?: number }
  | { type: 'buildSpeed'; mult: number }
  | {
      type: 'defense';
      tower?: { hp?: number; attack?: number; range?: number; name?: string };
      wallHpMult?: number;
      castleHpMult?: number;
      murderHoles?: boolean;
      heatedShot?: boolean;
    }
  | { type: 'naval'; trainMult?: number; woodMult?: number };

export interface TechDef {
  name: string;
  building: BuildingType;
  /** Age (0-3) needed to research it. */
  age: number;
  cost: Partial<Record<ResourceKind, number>>;
  /** Research time, seconds. */
  time: number;
  description: string;
  effects: TechEffect[];
  requires?: TechId;
  icon?: string;
}

export const TECH_DEFS = techs as unknown as Record<TechId, TechDef>;
export const TECH_IDS = Object.keys(TECH_DEFS) as TechId[];

export interface AgeDef {
  name: string;
  numeral: string;
  cost: Partial<Record<ResourceKind, number>>;
  researchSeconds: number;
  requires?: { age: number; buildings: number };
}
export const AGES = ages as AgeDef[];

/** Everything a player's research changes. Rebuilt from scratch whenever a tech completes. */
export interface PlayerMods {
  units: Record<UnitType, UnitDef>;
  /** Gather-rate multiplier per source (tree, gold, farm, ...). */
  gather: Record<string, number>;
  carry: number;
  farmFood: number;
  buildSpeed: number;
  building: { los: number; hpMult: number; meleeArmor: number; pierceArmor: number };
  /** Projectiles lead moving targets. */
  ballistics: boolean;
  /** Towers, walls and castles. */
  defense: {
    towerHp: number;
    towerAttack: number;
    towerRange: number;
    towerName: string | null;
    wallHpMult: number;
    castleHpMult: number;
    murderHoles: boolean;
    /** Arrows from buildings do double damage to ships. */
    heatedShot: boolean;
  };
  /** Docks: training-time and ship wood-cost multipliers. */
  naval: { trainMult: number; woodMult: number };
  /** Training-time multiplier per building (faction bonuses). */
  trainAt: Partial<Record<BuildingType, number>>;
  /** Unit cost multiplier per unit type. */
  unitCost: Partial<Record<UnitType, number>>;
  /** Building cost multipliers per type and resource. */
  buildingCost: Partial<Record<BuildingType, Partial<Record<ResourceKind, number>>>>;
  /** Share of the price a sale at the market returns. */
  sellShare: number;
}

export type FactionId = keyof typeof factions;
export interface FactionDef {
  name: string;
  /** Flag shape on buildings. */
  banner: 'swallowtail' | 'pennant' | 'square' | 'tongued';
  unique: UnitType;
  bonuses: string[];
  effects: TechEffect[];
  description: string;
}
export const FACTIONS = factions as unknown as Record<FactionId, FactionDef>;
export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

/** A player's starting modifiers: the base rules plus their faction's bonuses. */
export function baseMods(faction?: FactionId | string): PlayerMods {
  const m = rawMods();
  const f = faction ? FACTIONS[faction as FactionId] : undefined;
  if (f) applyList(m, f.effects);
  return m;
}

function rawMods(): PlayerMods {
  const units = {} as Record<UnitType, UnitDef>;
  for (const k of Object.keys(UNIT_DEFS) as UnitType[]) units[k] = { ...UNIT_DEFS[k], bonus: { ...UNIT_DEFS[k].bonus }, baseAttack: UNIT_DEFS[k].attack };
  return {
    units,
    gather: {},
    carry: 0,
    farmFood: 0,
    buildSpeed: 1,
    ballistics: false,
    building: { los: 0, hpMult: 1, meleeArmor: 0, pierceArmor: 0 },
    defense: { towerHp: 0, towerAttack: 0, towerRange: 0, towerName: null, wallHpMult: 1, castleHpMult: 1, murderHoles: false, heatedShot: false },
    naval: { trainMult: 1, woodMult: 1 },
    trainAt: {},
    unitCost: {},
    buildingCost: {},
    sellShare: 0.7,
  };
}

/** Applies one tech's effects to a player's modifiers (age changes are applied by the caller). */
export function applyEffects(m: PlayerMods, id: TechId): void {
  applyList(m, TECH_DEFS[id].effects);
}

function applyList(m: PlayerMods, effects: TechEffect[]): void {
  for (const e of effects) {
    switch (e.type) {
      case 'unit':
        for (const k of Object.keys(m.units) as UnitType[]) {
          const d = m.units[k];
          if (!(e.units?.includes(k) || e.classes?.some((c) => d.classes.includes(c)))) continue;
          if (e.attack && d.attack > 0) {
            d.attack += e.attack;
            // A unit's own line upgrade (Swordsman, Pikeman...) improves the weapon the counter
            // bonus scales with; Blacksmith upgrades for whole classes add flat damage on top.
            if (e.units?.includes(k)) d.baseAttack = (d.baseAttack ?? 0) + e.attack;
          }
          if (e.meleeArmor) d.meleeArmor += e.meleeArmor;
          if (e.pierceArmor) d.pierceArmor += e.pierceArmor;
          if (e.range && d.range > 0) d.range += e.range;
          if (e.hp) d.hp += e.hp;
          if (e.los) d.los += e.los;
          if (e.speedMult) d.speed *= e.speedMult;
          if (e.buildingAttack) d.buildingAttack = (d.buildingAttack ?? 0) + e.buildingAttack;
          if (e.buildingMult) d.buildingMult = (d.buildingMult ?? 1) * e.buildingMult;
          if (e.hpMult) d.hp = Math.round(d.hp * e.hpMult);
        }
        break;
      case 'train':
        m.trainAt[e.building] = (m.trainAt[e.building] ?? 1) * e.mult;
        break;
      case 'cost':
        for (const k of Object.keys(m.units) as UnitType[])
          if (e.classes.some((c) => m.units[k].classes.includes(c))) m.unitCost[k] = (m.unitCost[k] ?? 1) * e.mult;
        break;
      case 'buildingCost':
        for (const b of e.buildings) {
          const per = (m.buildingCost[b] ??= {});
          for (const r of e.resource ? [e.resource] : (['food', 'wood', 'gold', 'stone'] as ResourceKind[])) per[r] = (per[r] ?? 1) * e.mult;
        }
        break;
      case 'market':
        m.sellShare = e.sellShare;
        break;
      case 'upgrade':
        m.units[e.unit].name = e.name;
        break;
      case 'gather':
        for (const s of e.sources) m.gather[s] = (m.gather[s] ?? 1) * e.mult;
        break;
      case 'carry':
        m.carry += e.add;
        break;
      case 'farm':
        m.farmFood += e.add;
        break;
      case 'building':
        m.building.los += e.los ?? 0;
        m.building.hpMult *= e.hpMult ?? 1;
        m.building.meleeArmor += e.meleeArmor ?? 0;
        m.building.pierceArmor += e.pierceArmor ?? 0;
        break;
      case 'buildSpeed':
        m.buildSpeed *= e.mult;
        break;
      case 'defense': {
        const d = m.defense;
        if (e.tower) {
          d.towerHp += e.tower.hp ?? 0;
          d.towerAttack += e.tower.attack ?? 0;
          d.towerRange += e.tower.range ?? 0;
          if (e.tower.name) d.towerName = e.tower.name;
        }
        d.wallHpMult *= e.wallHpMult ?? 1;
        d.castleHpMult *= e.castleHpMult ?? 1;
        if (e.murderHoles) d.murderHoles = true;
        if (e.heatedShot) d.heatedShot = true;
        break;
      }
      case 'naval':
        m.naval.trainMult *= e.trainMult ?? 1;
        m.naval.woodMult *= e.woodMult ?? 1;
        break;
      case 'ballistics':
        m.ballistics = true;
        break;
      case 'age':
        break;
    }
  }
}

// ---------- effective stats ----------

/** A unit type's stats for its owner, after research. */
export function unitStats(w: World, owner: number, type: UnitType): UnitDef {
  return w.players[owner]?.mods.units[type] ?? UNIT_DEFS[type];
}

/** What a unit costs its owner (faction discounts, Shipwright for ships). */
export function unitCost(w: World, owner: number, type: UnitType): Partial<Record<ResourceKind, number>> {
  const cost = UNIT_DEFS[type].cost;
  const m = w.players[owner]?.mods;
  if (!m) return cost;
  const all = m.unitCost[type] ?? 1;
  const wood = UNIT_DEFS[type].naval ? m.naval.woodMult : 1;
  if (all === 1 && wood === 1) return cost;
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const [k, v] of Object.entries(cost)) out[k as ResourceKind] = Math.round((v ?? 0) * all * (k === 'wood' ? wood : 1));
  return out;
}

/** What a building costs its owner (faction discounts). */
export function buildingCost(w: World, owner: number, type: BuildingType): Partial<Record<ResourceKind, number>> {
  const cost = BUILDING_DEFS[type].cost;
  const per = w.players[owner]?.mods.buildingCost[type];
  if (!per) return cost;
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const [k, v] of Object.entries(cost)) out[k as ResourceKind] = Math.round((v ?? 0) * (per[k as ResourceKind] ?? 1));
  return out;
}

/** Seconds to train a unit (Dry Dock speeds up ships; some factions train faster at a building). */
export function trainTime(w: World, owner: number, type: UnitType, at?: BuildingType): number {
  const m = w.players[owner]?.mods;
  let t = UNIT_DEFS[type].trainTime;
  if (UNIT_DEFS[type].naval) t *= m?.naval.trainMult ?? 1;
  if (at) t *= m?.trainAt[at] ?? 1;
  return t;
}

/** Max HP of a building for its owner (masonry, fortified walls, tower upgrades, hoardings). */
export function buildingMaxHp(w: World, b: Building): number {
  const def = BUILDING_DEFS[b.type];
  const m = w.players[b.owner]?.mods;
  if (!m) return def.hp;
  let hp = def.hp;
  if (def.classes.includes('tower')) hp += m.defense.towerHp;
  hp *= m.building.hpMult;
  if (def.wall === 'stone') hp *= m.defense.wallHpMult;
  if (def.classes.includes('castle')) hp *= m.defense.castleHpMult;
  return Math.round(hp);
}

/** A building's arrows after research, or null if it doesn't shoot. */
export function buildingAttack(w: World, b: Building): { attack: number; range: number; reload: number; arrows: number; minRange: number } | null {
  const a = BUILDING_DEFS[b.type].attack;
  if (!a) return null;
  const d = w.players[b.owner]?.mods.defense;
  if (!d) return a;
  const tower = BUILDING_DEFS[b.type].classes.includes('tower');
  return {
    ...a,
    attack: a.attack + (tower ? d.towerAttack : 0),
    range: a.range + (tower ? d.towerRange : 0),
    minRange: d.murderHoles ? 0 : a.minRange,
  };
}

/** Display name (towers are renamed by their upgrades). */
export function buildingName(w: World, b: { type: BuildingType; owner: number }): string {
  const def = BUILDING_DEFS[b.type];
  const d = w.players[b.owner]?.mods.defense;
  return def.classes.includes('tower') && d?.towerName ? d.towerName : def.name;
}

export function buildingArmor(w: World, b: Building): { melee: number; pierce: number } {
  const def = BUILDING_DEFS[b.type], m = w.players[b.owner]?.mods.building;
  return { melee: def.meleeArmor + (m?.meleeArmor ?? 0), pierce: def.pierceArmor + (m?.pierceArmor ?? 0) };
}

// ---------- rules ----------

/** Distinct building types of an age the player has completed (each age-up needs two). */
export function ageBuildings(w: World, owner: number, age: number): BuildingType[] {
  const seen = new Set<BuildingType>();
  for (const b of w.buildings(owner)) {
    const def = BUILDING_DEFS[b.type];
    if (b.complete && def.advance && def.age === age) seen.add(b.type);
  }
  return [...seen];
}

/** Why a tech can't be researched now, or null if it can. */
export function researchBlock(w: World, owner: number, id: TechId): string | null {
  const p = w.players[owner];
  const t = TECH_DEFS[id];
  if (p.techs.includes(id)) return 'Already researched';
  if (isResearching(w, owner, id)) return 'Already being researched';
  if (t.age > p.age) return `Requires the ${AGES[t.age].name} Age`;
  if (t.requires && !p.techs.includes(t.requires)) return `Requires ${TECH_DEFS[t.requires].name}`;
  const ageUp = t.effects.find((e) => e.type === 'age');
  if (ageUp) {
    const req = AGES[ageUp.age].requires;
    if (p.age !== ageUp.age - 1) return 'Not available';
    if (req) {
      const have = ageBuildings(w, owner, req.age).length;
      if (have < req.buildings) return `Needs ${req.buildings} ${AGES[req.age].name} Age buildings (you have ${have})`;
    }
    if (ageUpInProgress(w, owner)) return 'Already advancing';
  }
  return null;
}

export function isResearching(w: World, owner: number, id: TechId): boolean {
  for (const b of w.buildings(owner)) if (b.queue.some((q) => q.tech === id)) return true;
  return false;
}

function ageUpInProgress(w: World, owner: number): boolean {
  for (const b of w.buildings(owner)) if (b.queue.some((q) => q.tech && TECH_DEFS[q.tech].effects.some((e) => e.type === 'age'))) return true;
  return false;
}

/** Techs a building offers, in display order: the ones still to research and possible now or later. */
export function techsAt(type: BuildingType): TechId[] {
  return TECH_IDS.filter((id) => TECH_DEFS[id].building === type);
}

/** Finishes a tech: records it and applies its effects (raising existing units' HP with their max). */
export function completeTech(w: World, owner: number, id: TechId): void {
  const p = w.players[owner];
  if (p.techs.includes(id)) return;
  const before = baseMods(p.faction);
  for (const t of p.techs) applyEffects(before, t);
  p.techs.push(id);
  const after = baseMods(p.faction);
  for (const t of p.techs) applyEffects(after, t);
  p.mods = after;
  for (const e of TECH_DEFS[id].effects) if (e.type === 'age') p.age = e.age;
  // Existing units and buildings gain any added HP straight away.
  for (const u of w.units(owner)) u.hp += after.units[u.type].hp - before.units[u.type].hp;
  // Buildings keep their health fraction as their maximum rises.
  for (const b of w.buildings(owner)) {
    if (!b.complete) continue;
    const oldMax = maxWith(before, b), newMax = maxWith(after, b);
    if (newMax !== oldMax) b.hp *= newMax / oldMax;
  }
  // Farms planted from now on yield more.
  w.events.push({ type: 'researched', owner, tech: id });
}

function maxWith(m: PlayerMods, b: Building): number {
  const def = BUILDING_DEFS[b.type];
  let hp = def.hp + (def.classes.includes('tower') ? m.defense.towerHp : 0);
  hp *= m.building.hpMult;
  if (def.wall === 'stone') hp *= m.defense.wallHpMult;
  if (def.classes.includes('castle')) hp *= m.defense.castleHpMult;
  return hp;
}
