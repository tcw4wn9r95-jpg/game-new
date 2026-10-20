import { BIOMES } from '../render/biome';
import { Feature, type GameMap, Terrain } from '../sim/terrain';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const FEATURE_RGB: Record<number, [number, number, number]> = {
  [Feature.Tree]: [30, 82, 34],
  [Feature.Gold]: [250, 204, 52],
  [Feature.Stone]: [196, 196, 192],
  [Feature.Berries]: [214, 70, 130],
};

/** One pixel per tile: terrain in the map's biome colours, resources on top. */
export function mapImage(map: GameMap): HTMLCanvasElement {
  const N = map.size;
  const b = BIOMES[map.type];
  const terrain: Record<number, [number, number, number]> = {
    [Terrain.Grass]: rgb(b.grass),
    [Terrain.Dirt]: rgb(b.dirt),
    [Terrain.Sand]: rgb(b.sand),
    [Terrain.Shallow]: rgb(b.shallow),
    [Terrain.Deep]: rgb(b.deep),
  };
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const col = FEATURE_RGB[map.feature[i]] ?? terrain[map.terrain[i]];
    const lift = map.elevation[i] * 10;
    img.data.set([Math.min(255, col[0] + lift), Math.min(255, col[1] + lift), Math.min(255, col[2] + lift), 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}
