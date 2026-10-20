// A build-order economy player. It plays through the same commands as touch
// input: keeps villagers training, houses ahead of the cap, workers split across
// resources by an age-dependent ratio, drop-off camps beside resources, farms
// once wild food runs out, the buildings each age-up needs, and the core
// economy techs. The full AI opponent (M9) builds on this.
import economy from '../../data/economy.json';
import type { Command } from '../commands';
import type { ResourceKind } from '../constants';
import { type Source, findResource, gatherOrder, isGatherer } from '../economy';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit, distToRect } from '../entities';
import { AGES, TECH_DEFS, type TechId, buildingCost, researchBlock } from '../techs';
import type { World } from '../world';

/** How a bot paces itself; the defaults are a steady, unhurried player. */
export interface BotProfile {
  /** Villagers wanted per age. */
  villagers: [number, number, number, number];
  /** Villager count at which the bot stops and saves to advance (per age I-III). */
  clickUp: [number, number, number];
  /** Earliest match time (seconds) to advance out of each age (a lazy bot waits). */
  minAgeTime?: [number, number, number];
  /** Share of villagers on food, wood, gold, stone per age. */
  ratios: Array<Record<ResourceKind, number>>;
  /** Economy techs worth buying, in order of preference. */
  techs: TechId[];
  /** Buildings put up in each age to qualify for the next, in order. */
  ageBuildings: BuildingType[][];
  /** Seconds between decisions (reaction time). */
  think: number;
}

export const NORMAL: BotProfile = {
  villagers: [24, 34, 46, 55],
  clickUp: [20, 30, 40],
  ratios: [
    { food: 0.55, wood: 0.4, gold: 0.05, stone: 0 },
    { food: 0.45, wood: 0.33, gold: 0.17, stone: 0.05 },
    { food: 0.42, wood: 0.3, gold: 0.23, stone: 0.05 },
    { food: 0.4, wood: 0.3, gold: 0.25, stone: 0.05 },
  ],
  techs: ['loom', 'double_bit_axe', 'horse_collar', 'wheelbarrow', 'gold_mining', 'bow_saw', 'heavy_plow', 'hand_cart'],
  ageBuildings: [['lumber_camp', 'mill', 'barracks'], ['blacksmith', 'market'], ['university', 'monastery'], []],
  think: 2,
};

const SOURCES: Record<ResourceKind, Source[]> = {
  food: ['sheep', 'deer', 'berries', 'farm'],
  wood: ['tree'],
  gold: ['gold'],
  stone: ['stone'],
};
const CAMP: Partial<Record<ResourceKind, BuildingType>> = { wood: 'lumber_camp', gold: 'mining_camp', stone: 'mining_camp', food: 'mill' };

export class EconomyBot {
  protected next = 0;
  /** Villager ids sent to build, so they aren't reassigned before they start. */
  protected builders = new Map<number, number>();

  constructor(
    readonly player: number,
    readonly profile: BotProfile = NORMAL,
  ) {}

  protected issue(w: World, cmd: Command): void {
    w.issue(this.player, cmd);
  }

  tick(w: World): void {
    if (w.time < this.next) return;
    this.next = w.time + this.profile.think;
    const tc = this.townCenter(w);
    if (!tc) return;
    this.economy(w, tc, this.villagers(w));
  }

  /** Land villagers (fishing ships are handled separately). */
  protected villagers(w: World): Unit[] {
    return [...w.units(this.player)].filter((u) => isGatherer(u) && !UNIT_DEFS[u.type].naval);
  }

  /** One round of economic decisions. Returns true if it started a building. */
  protected economy(w: World, tc: Building, villagers: Unit[], saving = false): boolean {
    for (const [id, until] of this.builders) if (until < w.time || !w.unit(id)) this.builders.delete(id);
    this.ageUp(w, tc);
    this.train(w, tc, villagers.length);
    if (this.houses(w, tc, villagers)) return true;
    if (!saving && this.buildings(w, tc, villagers)) return true;
    if (!saving) this.researchEconomy(w);
    this.assign(w, tc, villagers);
    return false;
  }

  protected townCenter(w: World): Building | null {
    for (const b of w.buildings(this.player)) if (b.type === 'town_center' && b.complete) return b;
    return null;
  }

  // ---------- production ----------

  protected train(w: World, tc: Building, count: number): void {
    const p = w.players[this.player];
    const want = this.profile.villagers[p.age];
    const queued = tc.queue.filter((q) => q.unit === 'villager').length;
    if (tc.queue.some((q) => q.tech)) return; // advancing: the Town Center is busy
    // Enough hands to advance: stop and save the food for it.
    if (p.age < 3 && count + queued >= this.profile.clickUp[p.age]) return;
    if (count + queued < want && queued < 2 && p.resources.food >= 50) this.issue(w, { type: 'train', id: tc.id, unit: 'villager' });
  }

  protected ageUp(w: World, tc: Building): void {
    const p = w.players[this.player];
    if (p.age >= 3) return;
    const id = (['age2', 'age3', 'age4'] as TechId[])[p.age];
    if (w.time < (this.profile.minAgeTime?.[p.age] ?? 0)) return;
    if (researchBlock(w, this.player, id)) return;
    const cost = TECH_DEFS[id].cost;
    if (Object.entries(cost).every(([k, v]) => p.resources[k as ResourceKind] >= (v ?? 0))) {
      // Let the current villager finish, then advance.
      if (tc.queue.length <= 1) this.issue(w, { type: 'research', id: tc.id, tech: id });
    }
  }

  protected researchEconomy(w: World): void {
    const p = w.players[this.player];
    // Save for the next age first once it is within reach.
    const nextAge = AGES[p.age + 1];
    for (const id of this.profile.techs) {
      const t = TECH_DEFS[id];
      if (researchBlock(w, this.player, id)) continue;
      const at = [...w.buildings(this.player)].find((b) => b.type === t.building && b.complete && b.queue.length === 0);
      if (!at) continue;
      const spare = Object.entries(t.cost).every(([k, v]) => p.resources[k as ResourceKind] - (nextAge?.cost[k as ResourceKind] ?? 0) * 0.5 >= (v ?? 0));
      if (spare) {
        this.issue(w, { type: 'research', id: at.id, tech: id });
        return;
      }
    }
  }

  // ---------- construction ----------

  protected houses(w: World, tc: Building, villagers: Unit[]): boolean {
    const p = w.players[this.player];
    const building = [...w.buildings(this.player)].some((b) => b.type === 'house' && !b.complete);
    if (p.popCap - p.pop > 4 || building || p.resources.wood < 30 || p.popCap >= 200) return false;
    return this.build(w, 'house', tc.x + tc.size / 2, tc.y + tc.size / 2, villagers, 1, 6);
  }

  /** Camps beside the resources being worked, then the buildings the next age needs. */
  protected buildings(w: World, tc: Building, villagers: Unit[]): boolean {
    const p = w.players[this.player];
    const have = (t: BuildingType) => [...w.buildings(this.player)].filter((b) => b.type === t);
    for (const res of ['wood', 'gold', 'stone', 'food'] as ResourceKind[]) {
      const camp = CAMP[res]!;
      const workers = villagers.filter((u) => u.order?.type === 'gather' && u.order.res === res && u.order.source !== 'farm');
      if (workers.length < (res === 'food' ? 4 : 3)) continue;
      // A camp is useful when the workers are far from any drop-off.
      const farWorkers = workers.filter((u) => this.dropDistance(w, u, res) > 6);
      if (farWorkers.length < 3 || have(camp).some((b) => !b.complete) || have(camp).length >= 8 || BUILDING_DEFS[camp].age > p.age) continue;
      const t = farWorkers[0].order?.type === 'gather' ? farWorkers[0].order.target : null;
      const pos = t?.kind === 'tile' ? { x: t.x, y: t.y } : { x: farWorkers[0].x, y: farWorkers[0].y };
      // Only worth it right beside the work; a camp put up far off helps nobody (and invites another).
      const spot = this.findSpot(w, camp, pos.x, pos.y, 3);
      if (!spot || Math.hypot(spot.x + 1 - pos.x, spot.y + 1 - pos.y) > 5) continue;
      if (this.build(w, camp, pos.x, pos.y, farWorkers, 2, 3)) return true;
    }
    // Farms when the wild food is gone.
    const food = villagers.filter((u) => u.order?.type === 'gather' && u.order.res === 'food').length;
    const wantFood = Math.round(villagers.length * this.profile.ratios[p.age].food);
    const freeFarms = have('farm').filter((f) => !f.complete || ![...w.units(this.player)].some((u) => u.order?.type === 'gather' && u.order.target.kind === 'entity' && u.order.target.id === f.id)).length;
    if (food < wantFood && freeFarms === 0 && this.wildFoodNear(w, tc) === 0 && have('mill').some((m) => m.complete) && p.resources.wood >= 60) {
      const mill = have('mill').find((m) => m.complete)!;
      const near = [tc, mill][have('farm').length % 2];
      if (this.build(w, 'farm', near.x + near.size / 2, near.y + near.size / 2, villagers, 1, 2)) return true;
    }
    for (const t of this.profile.ageBuildings[p.age]) {
      if (have(t).length || BUILDING_DEFS[t].age > p.age) continue;
      if (this.build(w, t, tc.x + tc.size / 2, tc.y + tc.size / 2, villagers, 2, 8)) return true;
      break;
    }
    return false;
  }

  private dropDistance(w: World, u: Unit, res: ResourceKind): number {
    let best = Infinity;
    for (const b of w.buildings(this.player))
      if (b.complete && (BUILDING_DEFS[b.type].dropoff as string[]).includes(res)) best = Math.min(best, distToRect(u.x, u.y, b.x, b.y, b.size));
    return best;
  }

  private wildFoodNear(w: World, tc: Building): number {
    let n = 0;
    for (const r of w.resources()) if (r.type !== 'fish' && r.amount > 0 && Math.hypot(r.x - tc.x, r.y - tc.y) < 22) n++;
    const N = w.map.size;
    for (let y = Math.max(0, tc.y - 20); y < Math.min(N, tc.y + 24); y++)
      for (let x = Math.max(0, tc.x - 20); x < Math.min(N, tc.x + 24); x++) if (w.map.feature[y * N + x] === 4 && w.map.amount[y * N + x] > 0) n++;
    return n;
  }

  /** Places a building near (x, y) with up to `crew` villagers (nearest first). */
  protected build(w: World, type: BuildingType, x: number, y: number, villagers: Unit[], crew: number, minR: number): boolean {
    const p = w.players[this.player];
    if (Object.entries(buildingCost(w, this.player, type)).some(([k, v]) => p.resources[k as ResourceKind] < (v ?? 0))) return false;
    const spot = this.findSpot(w, type, x, y, minR);
    if (!spot) return false;
    const free = villagers
      .filter((u) => !this.builders.has(u.id) && u.order?.type !== 'build')
      .sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))
      .slice(0, crew);
    if (!free.length) return false;
    for (const u of free) this.builders.set(u.id, w.time + 40);
    this.issue(w, { type: 'build', ids: free.map((u) => u.id), building: type, x: spot.x, y: spot.y });
    return true;
  }

  /** A legal spot near (x, y) that leaves a walkable margin around it. */
  protected findSpot(w: World, type: BuildingType, x: number, y: number, minR: number): { x: number; y: number } | null {
    const size = BUILDING_DEFS[type].size;
    const cx = Math.round(x - size / 2), cy = Math.round(y - size / 2);
    for (let r = minR > 6 ? 3 : 1; r < 26; r++)
      for (let k = 0; k < r * 8; k++) {
        const a = (k / (r * 8)) * Math.PI * 2 + this.player;
        const tx = Math.round(cx + Math.cos(a) * r), ty = Math.round(cy + Math.sin(a) * r);
        if (!w.canPlace(type, this.player, tx, ty)) continue;
        // Keep a one-tile lane around it so the town never walls itself in.
        if (type !== 'farm' && !this.margin(w, tx, ty, size)) continue;
        return { x: tx, y: ty };
      }
    return null;
  }

  private margin(w: World, x: number, y: number, size: number): boolean {
    for (let ty = y - 1; ty <= y + size; ty++)
      for (let tx = x - 1; tx <= x + size; tx++) {
        if (tx >= x && tx < x + size && ty >= y && ty < y + size) continue;
        if (!w.grid.inside(tx, ty) || w.grid.building[ty * w.map.size + tx] !== 0) return false;
      }
    return true;
  }

  // ---------- workers ----------

  /** Sends idle villagers to the resource furthest below its target share. */
  protected assign(w: World, tc: Building, villagers: Unit[]): void {
    const p = w.players[this.player];
    const ratio = this.profile.ratios[p.age];
    const count: Record<ResourceKind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of villagers) if (u.order?.type === 'gather' || u.order?.type === 'dropoff') count[(u.order.type === 'gather' ? u.order.res : u.carry?.res) ?? 'food']++;
    const idle = villagers.filter((u) => !u.order && !this.builders.has(u.id));
    for (const u of idle) {
      const order = (['food', 'wood', 'gold', 'stone'] as ResourceKind[])
        .filter((r) => ratio[r] > 0)
        .sort((a, b) => count[a] / villagers.length - ratio[a] - (count[b] / villagers.length - ratio[b]));
      for (const res of order) {
        // Mines further afield once the ones at home are worked out.
        const t =
          findResource(w, u, SOURCES[res], tc.x + tc.size / 2, tc.y + tc.size / 2, res === 'food' ? 24 : 40) ??
          (res === 'gold' || res === 'stone' ? findResource(w, u, SOURCES[res], tc.x + tc.size / 2, tc.y + tc.size / 2, 85) : null);
        const o = t && gatherOrder(w, t);
        if (o) {
          this.issue(w, { type: 'gather', ids: [u.id], target: t });
          count[res]++;
          break;
        }
      }
    }
    // Rebalance slowly: move one surplus worker to the scarcest resource now and then.
    if (Math.floor(w.time) % 20 < this.profile.think && villagers.length > 10) {
      const res = (['food', 'wood', 'gold', 'stone'] as ResourceKind[]).sort((a, b) => count[a] / villagers.length - ratio[a] - (count[b] / villagers.length - ratio[b]));
      const short = res[0], over = res[res.length - 1];
      if (count[short] / villagers.length < ratio[short] - 0.08) {
        const mover = villagers.find((u) => u.order?.type === 'gather' && u.order.res === over && !u.carry);
        const t = mover && findResource(w, mover, SOURCES[short], tc.x + tc.size / 2, tc.y + tc.size / 2, short === 'food' ? 24 : 40);
        if (mover && t) this.issue(w, { type: 'gather', ids: [mover.id], target: t });
      }
    }
  }
}

export const CARRY = economy.carryCapacity;
