import buildings from '../data/buildings.json';
import units from '../data/units.json';
import type { ResourceKind } from './constants';
import { WATER } from './grid';

export type UnitType = keyof typeof units;
export type BuildingType = keyof typeof buildings;
export interface UnitDef {
  name: string;
  hp: number;
  speed: number;
  los: number;
  radius: number;
  pop: number;
  cost: Partial<Record<ResourceKind, number>>;
  trainTime: number;
  attack: number;
  meleeArmor: number;
  pierceArmor: number;
  range: number;
  /** Seconds between attacks. */
  reload: number;
  attackType: 'melee' | 'pierce';
  /** Tiles per second; ranged units only. */
  projectileSpeed?: number;
  /** Age (0-3) that unlocks it. */
  age: number;
  /** Armour classes, matched against attackers' bonuses. */
  classes: UnitClass[];
  /** Damage multipliers against classes (counters). */
  bonus: Partial<Record<UnitClass, number>>;
  /** Default stance when trained. */
  stance: Stance;
  description: string;
  strong: string;
  weak: string;
  gatherer?: boolean;
  builder?: boolean;
  healer?: boolean;
  converter?: boolean;
  /** Can't hit closer than this (tiles). */
  minRange?: number;
  /** Area damage radius at the point of impact (friendly fire included). */
  splash?: number;
  /** Bolts that carry on through every enemy in line. */
  pierce?: boolean;
  /** Attacks buildings only (rams, petards). */
  buildingsOnly?: boolean;
  /** Units it can carry inside (rams, siege towers). */
  cargo?: number;
  /** Must unpack to fire and pack to move (trebuchets). */
  packs?: boolean;
  /** Can be ordered to bombard a spot. */
  groundAttack?: boolean;
  /** Blows itself up on its first blow (petards). */
  selfDestruct?: boolean;
  /** Extra flat damage against buildings (Sappers), and a multiplier on it (Siege Engineers). */
  buildingAttack?: number;
  buildingMult?: number;
  /** Sails on deep water (ships). */
  naval?: boolean;
  /** Load carried before returning to a drop-off (fishing ships), instead of the villager amount. */
  carry?: number;
  /** Only this faction can train it (unique units). */
  faction?: string;
  /** Attack the counter bonuses multiply (Blacksmith upgrades add on top, unmultiplied). */
  baseAttack?: number;
}

export type UnitClass =
  | 'villager'
  | 'infantry'
  | 'spear'
  | 'archer'
  | 'skirmisher'
  | 'cavalry'
  | 'siege'
  | 'monk'
  | 'building'
  | 'wall'
  | 'tower'
  | 'castle'
  | 'ram'
  | 'ship'
  | 'galley'
  | 'fireship'
  | 'raft'
  | 'barge'
  | 'transport'
  | 'king'
  | 'wonder';

/** aggressive: chase anything seen; defensive: chase a short way then return; stand: hold position; passive: never attack. */
export type Stance = 'aggressive' | 'defensive' | 'stand' | 'passive';
export const STANCES: Stance[] = ['aggressive', 'defensive', 'stand', 'passive'];

export interface BuildingDef {
  name: string;
  size: number;
  hp: number;
  buildTime: number;
  cost: Partial<Record<ResourceKind, number>>;
  pop: number;
  los: number;
  dropoff: ResourceKind[];
  age: number;
  buildable: boolean;
  description: string;
  meleeArmor: number;
  pierceArmor: number;
  classes: UnitClass[];
  /** Units this building can train. */
  trains: UnitType[];
  /** Units can walk over it (farms). */
  walkable?: boolean;
  /** Food a farm yields per planting. */
  food?: number;
  /** A completed building of this type is needed before this one can be placed. */
  requires?: BuildingType;
  /** Counts toward the buildings needed to advance an age. */
  advance?: boolean;
  /** Wall material for segments (one tile each) that join up into lines. */
  wall?: 'palisade' | 'stone';
  /** A gate segment: open to its owner. */
  gate?: boolean;
  /** Arrows the building shoots (towers, castles, town centres). */
  attack?: { attack: number; range: number; reload: number; arrows: number; minRange: number };
  /** How many units fit inside. */
  garrison?: number;
  /** Stands on deep water and is built by ships (fish traps). */
  naval?: boolean;
  /** Stands on the shore with water beside it (docks). */
  shore?: boolean;
}

export const UNIT_DEFS = units as unknown as Record<UnitType, UnitDef>;
export const BUILDING_DEFS = buildings as unknown as Record<BuildingType, BuildingDef>;

/** Something a villager can gather: a resource tile (tree, mine, bush) or an entity (animal, fish, farm). */
export type GatherTarget = { kind: 'tile'; x: number; y: number } | { kind: 'entity'; id: number };

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'gather'; target: GatherTarget; res: ResourceKind; source: string }
  | { type: 'build'; id: number }
  | { type: 'dropoff'; id: number }
  /** Attack a unit or building; `auto` when the unit picked the target itself (stance behaviour). */
  | { type: 'attack'; id: number; auto?: boolean }
  /** Monks: heal a friendly unit or convert an enemy one. */
  | { type: 'heal'; id: number; auto?: boolean }
  | { type: 'convert'; id: number }
  /** Shelter inside a building or ride in a vehicle. */
  | { type: 'garrison'; id: number }
  /** Bombard a spot on the ground. */
  | { type: 'attackGround'; x: number; y: number }
  /** Restore a damaged building, paying half its cost per HP. */
  | { type: 'repair'; id: number }
  /** Transports: sail to the shore by this point and let everyone off. */
  | { type: 'unload'; x: number; y: number; at?: { x: number; y: number } }
  /** Monks: pick up a relic and take it to a Monastery. */
  | { type: 'relic'; id: number };

export interface Unit {
  id: number;
  kind: 'unit';
  type: UnitType;
  owner: number;
  /** Position in tiles (centre of tile = +0.5). */
  x: number;
  y: number;
  /** Position at the start of the current tick, for render interpolation. */
  px: number;
  py: number;
  hp: number;
  /** Facing: -1 left, 1 right. */
  face: number;
  order: Order | null;
  /** Waypoints (tile coords) of the current path. */
  path: Array<{ x: number; y: number }> | null;
  pathIdx: number;
  /** True while waiting for the path service. */
  pathPending: boolean;
  /** What the unit is doing this tick, for animation and the HUD. */
  state: 'idle' | 'walk' | 'gather' | 'build' | 'attack' | 'heal' | 'convert' | 'repair' | 'pack';
  carry: { res: ResourceKind; amount: number } | null;
  /** Fractional gather progress not yet moved into `carry`. */
  gatherAcc: number;
  /** Resumes this gather order after a drop-off. */
  resume: Order | null;
  /** Path searches for the current order that ended without reaching it (gives up after a few). */
  repaths: number;
  stance: Stance;
  /** Ticks until the next attack can land. */
  cooldown: number;
  /** Where a defensive or stand-ground unit returns to after a chase. */
  guard: { x: number; y: number } | null;
  /** Shared flow field for a group move, followed instead of an A* path. */
  flow: FlowRef | null;
  /** The building or vehicle this unit is inside (0 = outside). */
  inside: number;
  /** Units riding inside this one (rams, siege towers). */
  cargo: number[];
  /** Trebuchets: packed for moving (true) or set up to fire. */
  packed: boolean;
  /** Ticks left of packing or unpacking. */
  packTimer: number;
  /** Last enemy that hit this unit, and when (tick), for retaliation and alerts. */
  attackedBy: number;
  attackedAt: number;
  /** Monk conversion progress, 0..1. */
  faith: number;
  /** Transports ferrying a group: who is coming aboard, where they board, and where they are going. */
  ferry: Ferry | null;
  /** Villagers sheltering at the town bell: what they were doing, to go back to it. */
  bell?: { order: Order | null; resume: Order | null } | null;
}

export interface Ferry {
  riders: number[];
  /** Water tile by the shore where the riders board. */
  pickup: { x: number; y: number };
  /** Where the riders were ordered to go (null: just take them aboard). */
  dest: { x: number; y: number } | null;
  /** Match time the ferry was arranged (it stops waiting for stragglers after a while). */
  since?: number;
}

/** Navigation layer a unit moves on: ships the water, everyone else their own side's land. */
export const navOf = (u: Unit): number => (UNIT_DEFS[u.type].naval ? WATER : u.owner);
export const isShip = (u: { type: UnitType }): boolean => !!UNIT_DEFS[u.type].naval;

/** A unit's handle on a group flow field and its own destination slot. */
export interface FlowRef {
  field: import('./flowfield').FlowField;
  x: number;
  y: number;
}

export interface Building {
  id: number;
  kind: 'building';
  type: BuildingType;
  owner: number;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  size: number;
  hp: number;
  /** Construction progress 0..1. */
  progress: number;
  complete: boolean;
  /** Units waiting to be trained and technologies to research; the head is in progress. */
  queue: QueueItem[];
  /** Where trained units go: a point, or a resource to start gathering. */
  rally: { x: number; y: number; target: GatherTarget | null } | null;
  /** Re-queue each unit as it finishes (if affordable). */
  repeat: boolean;
  /** Farms: food left in the current planting. */
  amount: number;
  /** Production is waiting for population room (for a one-off alert). */
  housed: boolean;
  /** Units sheltering inside. */
  garrison: number[];
  /** Ticks until its arrows can fly again. */
  cooldown: number;
  /** Gates: closed to everyone, owner included. */
  locked: boolean;
}

/** Food on the hoof or in the water, gathered where it stands. */
export interface ResourceEntity {
  id: number;
  kind: 'resource';
  type: 'sheep' | 'deer' | 'fish' | 'relic';
  x: number;
  y: number;
  amount: number;
  /** Relics: the monk carrying it, or the Monastery keeping it (0 = lying on the ground). */
  carrier?: number;
  holder?: number;
}

export type Entity = Unit | Building | ResourceEntity;

/** One entry in a building's queue: a unit to train or a technology to research. */
export interface QueueItem {
  unit?: UnitType;
  tech?: import('./techs').TechId;
  progress: number;
  /** What was paid (refunded on cancel). */
  cost?: Partial<Record<ResourceKind, number>>;
}

/** Distance from a point to a building footprint (0 inside). */
export function distToRect(px: number, py: number, x: number, y: number, size: number): number {
  const dx = Math.max(x - px, 0, px - (x + size));
  const dy = Math.max(y - py, 0, py - (y + size));
  return Math.hypot(dx, dy);
}
