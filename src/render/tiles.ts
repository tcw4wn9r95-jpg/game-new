import { Terrain } from '../sim/terrain';

/** Stable per-tile hash for picking variants and jitter. */
export function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Higher-ranked ground spills softly over lower-ranked neighbours (grass over dirt, sand over water). */
export const GROUND_RANK: Record<number, number> = {
  [Terrain.Deep]: 0,
  [Terrain.Shallow]: 1,
  [Terrain.Sand]: 2,
  [Terrain.Dirt]: 3,
  [Terrain.Grass]: 4,
};

/** Terrain id for each rank (inverse of GROUND_RANK). */
export const RANK_TERRAIN: number[] = Object.entries(GROUND_RANK)
  .sort((a, b) => a[1] - b[1])
  .map(([t]) => Number(t));
