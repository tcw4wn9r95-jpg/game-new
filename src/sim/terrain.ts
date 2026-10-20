/** Ground type per tile. Values are stored in GameMap.terrain. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  /** Fords: walkable by land units, blocks ships. */
  Shallow: 3,
  /** Ship-only. */
  Deep: 4,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

/** Static resource occupying a whole tile. Values are stored in GameMap.feature. */
export const Feature = {
  None: 0,
  Tree: 1,
  Gold: 2,
  Stone: 3,
  Berries: 4,
} as const;
export type FeatureId = (typeof Feature)[keyof typeof Feature];

export type MapType = 'heartland' | 'coastal' | 'lakes' | 'islands';
export type MapSize = 'skirmish' | 'standard' | 'epic';
export const MAP_TYPES: MapType[] = ['heartland', 'coastal', 'lakes', 'islands'];
export const MAP_SIZES: MapSize[] = ['skirmish', 'standard', 'epic'];

export interface Animal {
  kind: 'sheep' | 'deer' | 'fish';
  /** Tile coordinates (centre of tile = +0.5). */
  x: number;
  y: number;
  amount: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GameMap {
  type: MapType;
  sizeName: MapSize;
  seed: number;
  size: number;
  terrain: Uint8Array;
  /** 0 = lowland, 1-2 = hills. */
  elevation: Uint8Array;
  feature: Uint8Array;
  amount: Uint16Array;
  animals: Animal[];
  /** Town Center tile per player slot. */
  starts: Point[];
}

export const isWater = (t: number) => t === Terrain.Shallow || t === Terrain.Deep;

/** Land units can stand here (ignoring buildings and units). */
export function landWalkable(map: GameMap, i: number): boolean {
  return map.terrain[i] !== Terrain.Deep && map.feature[i] === Feature.None;
}
