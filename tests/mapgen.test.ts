import { describe, expect, it } from 'vitest';
import { Fog } from '../src/sim/fog';
import { generateMap } from '../src/sim/mapgen';
import { Feature, type GameMap, MAP_SIZES, MAP_TYPES, type Point, Terrain, isWater } from '../src/sim/terrain';

function hash(map: GameMap): number {
  let h = 2166136261;
  for (const arr of [map.terrain, map.elevation, map.feature]) for (const v of arr) h = Math.imul(h ^ v, 16777619);
  return h >>> 0;
}

function countNear(map: GameMap, s: Point, r: number, f: number): number {
  let n = 0;
  for (let y = s.y - r; y <= s.y + r; y++)
    for (let x = s.x - r; x <= s.x + r; x++) {
      if (x < 0 || y < 0 || x >= map.size || y >= map.size || Math.hypot(x - s.x, y - s.y) > r) continue;
      if (map.feature[y * map.size + x] === f) n++;
    }
  return n;
}

/** Tiles reachable on foot from a start (land + fords, no resource tiles). */
function landReach(map: GameMap, s: Point): Uint8Array {
  const N = map.size;
  const seen = new Uint8Array(N * N);
  const stack = [s.y * N + s.x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (seen[j] || map.terrain[j] === Terrain.Deep || map.feature[j] !== Feature.None) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

const SEEDS = [1, 2, 3, 99, 12345];

describe('mapgen', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const a = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 7 });
    const b = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 7 });
    const c = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 8 });
    expect(hash(a)).toBe(hash(b));
    expect(a.animals).toEqual(b.animals);
    expect(hash(a)).not.toBe(hash(c));
  });

  for (const type of MAP_TYPES)
    for (const size of MAP_SIZES)
      for (const players of [2, 4])
        it(`${type} ${size} ${players}p: fair, resourced starts`, () => {
          for (const seed of SEEDS) {
            const map = generateMap({ type, size, players, seed });
            expect(map.starts).toHaveLength(players);
            for (const s of map.starts) {
              const i = s.y * map.size + s.x;
              expect(isWater(map.terrain[i])).toBe(false);
              expect(countNear(map, s, 3, Feature.Tree) + countNear(map, s, 3, Feature.Gold)).toBe(0);
              expect(countNear(map, s, 20, Feature.Tree)).toBeGreaterThanOrEqual(25);
              expect(countNear(map, s, 10, Feature.Berries)).toBeGreaterThanOrEqual(6);
              expect(countNear(map, s, 13, Feature.Gold)).toBeGreaterThanOrEqual(7);
              expect(countNear(map, s, 15, Feature.Stone)).toBeGreaterThanOrEqual(5);
              const near = (kind: string, r: number) =>
                map.animals.filter((a) => a.kind === kind && Math.hypot(a.x - s.x, a.y - s.y) <= r).length;
              expect(near('sheep', 9)).toBeGreaterThanOrEqual(4);
              expect(near('deer', 22)).toBeGreaterThanOrEqual(3);
            }

            const reach = landReach(map, map.starts[0]);
            const others = map.starts.slice(1).map((s) => reach[s.y * map.size + s.x]);
            if (type === 'islands') {
              expect(others.every((r) => r === 0)).toBe(true);
            } else {
              expect(others.every((r) => r === 1)).toBe(true);
            }
          }
        });

  it('heartland has a river with walkable fords', () => {
    const map = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: 5 });
    expect(map.terrain.filter((t) => t === Terrain.Deep).length).toBeGreaterThan(100);
    expect(map.terrain.filter((t) => t === Terrain.Shallow).length).toBeGreaterThan(10);
  });

  it('water maps have shore fish and deep-sea fish', () => {
    for (const type of ['coastal', 'lakes', 'islands'] as const) {
      const map = generateMap({ type, size: 'standard', players: 2, seed: 11 });
      expect(map.animals.filter((a) => a.kind === 'fish').length).toBeGreaterThan(type === 'lakes' ? 2 : 8);
    }
  });

  it('generates an Epic map quickly', () => {
    const t = performance.now();
    generateMap({ type: 'islands', size: 'epic', players: 4, seed: 3 });
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe('Fog', () => {
  it('tracks visible and explored tiles', () => {
    const fog = new Fog(32);
    fog.update([{ x: 10.5, y: 10.5, r: 4 }]);
    expect(fog.isVisible(10, 10)).toBe(true);
    expect(fog.isVisible(10, 14)).toBe(true);
    expect(fog.isVisible(20, 20)).toBe(false);
    fog.update([{ x: 25.5, y: 25.5, r: 3 }]);
    expect(fog.isVisible(10, 10)).toBe(false);
    expect(fog.isExplored(10, 10)).toBe(true);
    expect(fog.isExplored(0, 0)).toBe(false);
  });
});
