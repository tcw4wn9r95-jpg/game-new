// The AI opponent: the build-order economy (EconomyBot) plus everything a
// player does with it: scouting, a mixed army that counters what the enemy
// fields, defending the town, attacking in waves (retreating the wounded and
// calling off a wave that has bled out), bringing siege against walls,
// walling its own base, and on water maps docks, fishing, warships and
// transports. It acts only through commands, like a player, and respects the
// Peace Treaty. Difficulty changes villager targets, reaction time, army size,
// wave thresholds, counter-building, walls and siege, and (Hard only) gives a
// disclosed +10% gather bonus.
import type { ResourceKind } from '../constants';
import { findResource, gatherOrder, isGatherer } from '../economy';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit, type UnitClass, type UnitType, distToRect } from '../entities';
import { wallLine } from '../fortify';
import { WATER } from '../grid';
import { FACTIONS, type FactionId, TECH_DEFS, type TechId, buildingCost, buildingMaxHp, researchBlock, unitCost } from '../techs';
import { CAPTURE_TIME, type Site, carried, kingOf, relics } from '../modes';
import { canShelter, shelterRoom } from '../fortify';
import { Terrain } from '../terrain';
import type { World } from '../world';
import { type BotProfile, EconomyBot, NORMAL } from './bot';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

interface AiProfile extends BotProfile {
  /** Gather-rate multiplier (Hard only, disclosed in the menu). */
  gatherBonus: number;
  /** Most military population per age. */
  armyCap: [number, number, number, number];
  /** Army value (resources spent) that launches a wave, per age. */
  wave: [number, number, number, number];
  /** Earliest attack, match seconds. */
  firstAttack: number;
  /** How strongly production follows what the enemy fields (0-1). */
  counter: number;
  walls: 'none' | 'partial' | 'full';
  /** Builds siege to break walls. */
  siege: boolean;
  /** Fishing ships on water maps. */
  fishers: number;
  /** Warships kept on water maps from Age II. */
  warships: number;
  /** Military techs, in order of preference. */
  militaryTechs: TechId[];
  /** Extra production buildings from Age III. */
  extraProduction: number;
}

const MILITARY_TECHS: TechId[] = [
  'forging',
  'scale_mail',
  'fletching',
  'padded_archer',
  'scale_barding',
  'pikeman',
  'crossbowman',
  'swordsman',
  'iron_casting',
  'bodkin_arrow',
  'chain_mail',
  'chain_barding',
  'leather_archer',
  'light_cavalry',
  'ballistics',
  'capped_ram',
  'war_galley',
  'careening',
];

export const PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    ...NORMAL,
    villagers: [16, 22, 28, 32],
    clickUp: [15, 21, 26],
    minAgeTime: [17 * 60, 36 * 60, 56 * 60],
    think: 4,
    gatherBonus: 1,
    armyCap: [4, 8, 14, 18],
    wave: [99999, 1600, 2600, 3600],
    firstAttack: 15 * 60,
    counter: 0,
    walls: 'none',
    siege: false,
    fishers: 2,
    warships: 1,
    militaryTechs: ['forging', 'fletching', 'scale_mail'],
    extraProduction: 0,
    techs: ['loom', 'double_bit_axe', 'horse_collar', 'gold_mining'],
  },
  normal: {
    ...NORMAL,
    clickUp: [18, 25, 33],
    think: 2,
    gatherBonus: 1,
    armyCap: [6, 18, 36, 90],
    wave: [99999, 1200, 2200, 3000],
    firstAttack: 10 * 60,
    counter: 0.5,
    walls: 'partial',
    siege: true,
    fishers: 4,
    warships: 3,
    militaryTechs: MILITARY_TECHS.slice(0, 12),
    extraProduction: 1,
  },
  hard: {
    ...NORMAL,
    villagers: [26, 40, 54, 64],
    clickUp: [22, 34, 46],
    think: 1,
    gatherBonus: 1.1,
    armyCap: [8, 30, 50, 70],
    wave: [99999, 1500, 2600, 4000],
    firstAttack: 9 * 60,
    counter: 0.85,
    walls: 'full',
    siege: true,
    fishers: 6,
    warships: 5,
    militaryTechs: MILITARY_TECHS,
    extraProduction: 2,
    techs: [...NORMAL.techs, 'gold_shaft', 'bow_saw', 'stone_mining', 'town_watch'],
  },
};

export type Style = 'standard' | 'rush' | 'boom';
const STYLES: Style[] = ['standard', 'rush', 'boom'];

/** A profile adjusted for a playing style. */
function withStyle(p: AiProfile, style: Style): AiProfile {
  if (style === 'rush')
    return {
      ...p,
      clickUp: [17, p.clickUp[1] - 2, p.clickUp[2]],
      armyCap: [p.armyCap[0], p.armyCap[1] + 18, p.armyCap[2] + 6, p.armyCap[3]],
      wave: [p.wave[0], p.wave[1] * 0.6, p.wave[2] * 0.85, p.wave[3]],
      firstAttack: p.firstAttack - 180,
    };
  if (style === 'boom')
    return {
      ...p,
      villagers: [p.villagers[0], p.villagers[1] + 4, p.villagers[2] + 8, p.villagers[3] + 10],
      clickUp: [p.clickUp[0] + 2, p.clickUp[1] + 3, p.clickUp[2] + 4],
      wave: [p.wave[0], p.wave[1] * 1.3, p.wave[2] * 1.15, p.wave[3]],
      firstAttack: p.firstAttack + 120,
    };
  return p;
}

/** Army make-up per age: unit and share. */
const COMPOSITION: Array<Partial<Record<UnitType, number>>> = [
  { militia: 1 },
  { militia: 0.25, spearman: 0.25, archer: 0.35, scout: 0.15 },
  { knight: 0.3, archer: 0.25, spearman: 0.2, militia: 0.15, skirmisher: 0.1 },
  { knight: 0.32, archer: 0.25, spearman: 0.18, militia: 0.15, skirmisher: 0.1 },
];

/** What beats what (unit to add more of, per enemy class). */
const COUNTERS: Partial<Record<UnitClass, UnitType[]>> = {
  archer: ['skirmisher', 'knight'],
  skirmisher: ['militia', 'knight'],
  cavalry: ['spearman'],
  spear: ['archer', 'militia'],
  infantry: ['archer'],
  siege: ['knight', 'scout'],
  monk: ['knight', 'scout'],
};

/** Where each unit is trained. */
const TRAINED_AT: Partial<Record<UnitType, BuildingType>> = {};
for (const [b, def] of Object.entries(BUILDING_DEFS)) for (const u of def.trains) TRAINED_AT[u] ??= b as BuildingType;

const valueOf = (t: UnitType) => Object.values(UNIT_DEFS[t].cost).reduce((a, b) => a + (b ?? 0), 0);
const isSiege = (u: Unit) => UNIT_DEFS[u.type].classes.includes('siege');
const SITE_RADIUS_AI = 4;
const buildingMaxHpOf = (w: World, b: Building) => buildingMaxHp(w, b);

export class Opponent extends EconomyBot {
  readonly difficulty: Difficulty;
  private readonly ai: AiProfile;
  /** Enemy unit types seen, by id (for counter-building). */
  private readonly seen = new Map<number, UnitType>();
  /** Current attack: its units, its target and what it was worth at launch. */
  private wave: { ids: Set<number>; target: number; value: number; since: number; staged: boolean } | null = null;
  private lastWave = -1e9;
  /** A cavalry raid on the enemy's outlying workers. */
  private raid: { ids: Set<number>; camp: number; since: number } | null = null;
  private lastRaid = -1e9;
  private walled = 0;
  private scoutSent = false;
  private coastLap = 0;
  /** Targets found to be out of reach (no way through), skipped from then on. */
  private readonly unreachable = new Set<number>();
  private geography: { water: boolean; naval: boolean } | null = null;
  /** Recent decisions, for tuning and debugging. */
  readonly notes: string[] = [];
  /** Hold back on other buildings and research this round (saving for a key building). */
  private saving = false;
  /** Domination: soldiers posted to hold each site (by site index). */
  private readonly guards = new Map<number, number>();
  /** Domination: the soldiers sent to take a site, and which. */
  private push: { ids: Set<number>; site: number; since: number } | null = null;

  private note(w: World, s: string): void {
    this.notes.push(`${(w.time / 60).toFixed(1)}m ${s}`);
    if (this.notes.length > 60) this.notes.shift();
  }

  /** Playing style (Normal only): rushers strike in Age II, boomers build up then hit hard. */
  readonly style: Style;

  constructor(player: number, difficulty: Difficulty = 'normal', seed = 0) {
    const style: Style = difficulty === 'normal' ? STYLES[(seed + player * 2) % STYLES.length] : 'standard';
    const ai = withStyle(PROFILES[difficulty], style);
    super(player, { ...ai, ageBuildings: [['lumber_camp', 'mill', 'barracks'], ['archery_range', 'blacksmith', 'stable', 'market'], ['siege_workshop', 'university', 'monastery'], []] });
    this.difficulty = difficulty;
    this.ai = ai;
    this.style = style;
  }

  /** Applies the difficulty's (disclosed) handicap. Call once when the match starts. */
  setup(w: World): void {
    const p = w.players[this.player];
    if (p) p.gatherBonus = this.ai.gatherBonus;
  }

  override tick(w: World): void {
    if (w.time < this.next) return;
    this.next = w.time + this.ai.think;
    const p = w.players[this.player];
    if (!p || p.defeated || w.winner !== null) return;
    if (p.gatherBonus !== this.ai.gatherBonus) this.setup(w);
    const tc = this.townCenter(w);
    if (this.hopeless(w)) {
      this.note(w, 'resigns');
      w.resign(this.player);
      return;
    }
    this.geography ??= this.survey(w);
    const villagers = this.villagers(w);
    this.observe(w);
    if (tc) {
      this.saving = false;
      if (!this.naval(w, tc, villagers) && (this.saving || (!this.fortify(w, tc, villagers) && !this.militaryBuildings(w, tc, villagers)))) this.economy(w, tc, villagers, this.saving);
      this.repairs(w, villagers);
    }
    this.scout(w);
    this.produce(w);
    this.trade(w);
    this.researchMilitary(w);
    if (tc) this.relicHunt(w);
    if (w.mode === 'regicide') this.guardKing(w);
    if (w.mode === 'domination' && tc) this.holdSites(w, tc, villagers);
    if (tc && w.mode !== 'domination') this.wonder(w, tc, villagers);
    this.command(w, tc);
  }

  /**
   * Concede when there is no way back: nothing left that can train a unit
   * and no villagers; or no Town Center, a handful of villagers and an army a
   * fraction of the enemy's.
   */
  private hopeless(w: World): boolean {
    let tc = false, producers = false, villagers = 0, mine = 0, theirs = 0;
    for (const b of w.buildings(this.player)) {
      if (b.type === 'town_center') tc = true;
      if (b.complete && BUILDING_DEFS[b.type].trains.length) producers = true;
    }
    for (const u of w.units()) {
      if (u.owner === this.player && u.type === 'villager') villagers++;
      else if (!isGatherer(u) && !UNIT_DEFS[u.type].naval) {
        if (u.owner === this.player) mine += valueOf(u.type);
        else if (w.isEnemy(this.player, u.owner)) theirs += valueOf(u.type);
      }
    }
    if (!producers && !tc && villagers === 0) return true;
    return !tc && villagers < 5 && mine < theirs * 0.15 && theirs > 1500;
  }

  // ---------- knowledge ----------

  /** Is there water here, and must armies cross it to reach the enemy? */
  private survey(w: World): { water: boolean; naval: boolean } {
    const m = w.map, N = m.size;
    const home = m.starts[this.player];
    let deep = 0;
    for (let y = Math.max(0, home.y - 40); y < Math.min(N, home.y + 40); y++)
      for (let x = Math.max(0, home.x - 40); x < Math.min(N, home.x + 40); x++) if (m.terrain[y * N + x] === Terrain.Deep) deep++;
    // Flood the dry land (fords included, ignoring trees and buildings) from home.
    const seen = new Uint8Array(N * N);
    const stack = [home.y * N + home.x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % N, y = (i / N) | 0;
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (j < 0 || j >= N * N || seen[j] || m.terrain[j] === Terrain.Deep) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === N - 1)) continue;
        void y;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const naval = m.starts.some((s, i) => w.isEnemy(this.player, i) && !seen[s.y * N + s.x]);
    return { water: naval || deep > 60, naval };
  }

  /** Remembers enemy units in sight (for counters). */
  private observe(w: World): void {
    const fog = w.fog[this.player];
    for (const u of w.field()) if (w.isEnemy(this.player, u.owner) && !isGatherer(u) && fog?.isVisible(u.x, u.y)) this.seen.set(u.id, u.type);
    for (const id of this.seen.keys()) if (!w.get(id)) this.seen.delete(id);
  }

  private enemyStarts(w: World): Array<{ x: number; y: number; i: number }> {
    return w.map.starts.map((s, i) => ({ x: s.x, y: s.y, i })).filter((s) => w.isEnemy(this.player, s.i) && !w.players[s.i].defeated);
  }

  /**
   * Known enemy buildings: those explored by our fog. Once none of those are
   * left, the last hidden ones are given away so a beaten enemy can't hold
   * out forever in an unexplored corner.
   */
  private enemyBuildings(w: World): Building[] {
    const fog = w.fog[this.player];
    const all = [...w.buildings()].filter((b) => w.isEnemy(this.player, b.owner));
    const known = all.filter((b) => fog?.isExplored(b.x + b.size / 2, b.y + b.size / 2));
    return known.some((b) => !BUILDING_DEFS[b.type].wall && !BUILDING_DEFS[b.type].naval) ? known : all;
  }

  // ---------- economy additions ----------

  /** The scout rides to the enemy base so its town is on our map. */
  private scout(w: World): void {
    const s = [...w.units(this.player)].find((u) => u.type === 'scout' && !this.wave?.ids.has(u.id));
    if (!s || s.order) return;
    const e = this.enemyStarts(w)[0];
    if (!e) return;
    // On water maps, first ride round the home coast so there is somewhere to put a dock.
    if (this.geography?.water && this.coastLap < 12) {
      const home = w.map.starts[this.player];
      const a = (this.coastLap / 12) * Math.PI * 2 + this.player;
      const r = this.coastLap < 6 ? 22 : 34;
      this.coastLap++;
      this.issue(w, { type: 'move', ids: [s.id], x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r });
      return;
    }
    if (!this.scoutSent) {
      this.scoutSent = true;
      this.issue(w, { type: 'move', ids: [s.id], x: e.x + 0.5, y: e.y + 0.5 });
      return;
    }
    // Then ride a loop around the middle of the map.
    const a = w.time / 40 + this.player;
    const N = w.map.size;
    this.issue(w, { type: 'move', ids: [s.id], x: N / 2 + Math.cos(a) * N * 0.25, y: N / 2 + Math.sin(a) * N * 0.25 });
  }

  /** Docks, fishing ships, warships and (when the enemy is overseas) transports. */
  private naval(w: World, tc: Building, villagers: Unit[]): boolean {
    const g = this.geography!;
    // The last enemies are afloat: we need ships of our own to finish them.
    if (!g.water && this.endgame(w) && this.straggler(w, tc.x, tc.y, true) && !this.straggler(w, tc.x, tc.y, false)) g.water = true;
    if (!g.water) return false;
    const p = w.players[this.player];
    const mine = (t: BuildingType) => [...w.buildings(this.player)].filter((b) => b.type === t);
    const docks = mine('dock');
    // Endgame on the water: a dock on the same sea as the last enemy ships.
    const prey = this.endgame(w) ? this.straggler(w, tc.x, tc.y, true) : null;
    const sea = prey ? w.grid.component(Math.floor(prey.x), Math.floor(prey.y), WATER) : -1;
    const onSea = (d: Building) => sea < 0 || this.dockSea(w, d) === sea;
    const wantDocks = g.naval ? (p.age >= 2 ? 2 : 1) : 1;
    if ((docks.length < wantDocks || (sea >= 0 && !docks.some(onSea))) && (p.age >= 1 || g.naval || villagers.length >= 12) && !docks.some((d) => !d.complete)) {
      const spot = sea >= 0 ? this.dockSpot(w, { x: prey!.x - 2, y: prey!.y - 2, size: 4 } as Building, sea) : this.dockSpot(w, tc);
      if (spot && this.buildAt(w, 'dock', spot, villagers, 3)) return true;
      if (!spot && w.tick % 600 === 0) this.note(w, 'no dock spot');
      // The enemy is overseas: nothing matters more than a dock, so save for it.
      if (spot && g.naval && !docks.length) this.saving = true;
    }
    const dock = docks.find((d) => d.complete);
    if (!dock) return false;
    const units = [...w.units(this.player)];
    const count = (t: UnitType) => units.filter((u) => u.type === t).length + docks.reduce((n, d) => n + d.queue.filter((q) => q.unit === t).length, 0);
    const idleDock = docks.find((d) => d.complete && d.queue.length < 2);
    if (idleDock) {
      if (count('fishing_ship') < this.ai.fishers) this.trainIf(w, idleDock, 'fishing_ship');
      else if (p.age >= 1 && count('galley') < this.ai.warships) this.trainIf(w, idleDock, 'galley');
      else if (g.naval && p.age >= 1 && count('transport_ship') < Math.min(4, Math.ceil(this.ai.armyCap[p.age] / 10))) this.trainIf(w, idleDock, 'transport_ship');
    }
    // Idle fishing ships fish.
    for (const f of units.filter((u) => u.type === 'fishing_ship' && !u.order)) {
      const t = findResource(w, f, ['fish', 'fish_trap'], f.x, f.y, 60);
      if (t && gatherOrder(w, t)) this.issue(w, { type: 'gather', ids: [f.id], target: t });
      else if (p.resources.wood >= 200) {
        // No fish left in reach: lay a fish trap by the dock.
        const spot = this.trapSpot(w, dock);
        if (spot) this.issue(w, { type: 'build', ids: [f.id], building: 'fish_trap', x: spot.x, y: spot.y });
      }
    }
    // Warships hunt enemy ships in sight, else hold by the dock.
    const fog = w.fog[this.player];
    for (const s of units.filter((u) => UNIT_DEFS[u.type].naval && UNIT_DEFS[u.type].attack > 0 && !u.order)) {
      let best: Unit | null = null, bd = 30;
      for (const e of w.field()) {
        if (!w.canFight(this.player, e.owner) || !UNIT_DEFS[e.type].naval || !fog?.isVisible(e.x, e.y)) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d < bd) (bd = d), (best = e);
      }
      if (!best && this.endgame(w)) best = this.straggler(w, s.x, s.y, true);
      if (best) this.issue(w, { type: 'attack', ids: [s.id], id: best.id });
    }
    return false;
  }

  /** Water component a dock opens onto (-1 if none). */
  private dockSea(w: World, d: Building): number {
    for (let k = -1; k <= d.size; k++)
      for (const [x, y] of [[d.x + k, d.y - 1], [d.x + k, d.y + d.size], [d.x - 1, d.y + k], [d.x + d.size, d.y + k]]) {
        const c = w.grid.component(x, y, WATER);
        if (c >= 0) return c;
      }
    return -1;
  }

  private dockSpot(w: World, tc: Building, sea = -1): { x: number; y: number } | null {
    const cx = tc.x + 2, cy = tc.y + 2;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let y = cy - 45; y < cy + 45; y++)
      for (let x = cx - 45; x < cx + 45; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= bd || !w.canPlace('dock', this.player, x, y)) continue;
        if (sea >= 0 && this.dockSea(w, { x, y, size: 3 } as Building) !== sea) continue;
        bd = d;
        best = { x, y };
      }
    return best;
  }

  private trapSpot(w: World, dock: Building): { x: number; y: number } | null {
    for (let r = 2; r < 12; r++)
      for (let k = 0; k < r * 8; k++) {
        const a = (k / (r * 8)) * Math.PI * 2;
        const x = Math.round(dock.x + 1 + Math.cos(a) * r), y = Math.round(dock.y + 1 + Math.sin(a) * r);
        if (w.canPlace('fish_trap', this.player, x, y)) return { x, y };
      }
    return null;
  }

  private buildAt(w: World, type: BuildingType, spot: { x: number; y: number }, villagers: Unit[], crew: number): boolean {
    const p = w.players[this.player];
    if (Object.entries(buildingCost(w, this.player, type)).some(([k, v]) => p.resources[k as ResourceKind] < (v ?? 0))) return false;
    const free = villagers
      .filter((u) => !this.builders.has(u.id) && u.order?.type !== 'build')
      .sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))
      .slice(0, crew);
    if (!free.length) return false;
    for (const u of free) this.builders.set(u.id, w.time + 40);
    this.issue(w, { type: 'build', ids: free.map((u) => u.id), building: type, x: spot.x, y: spot.y });
    return true;
  }

  /** Extra barracks, ranges, stables and (for walls) a siege workshop and castle. */
  private militaryBuildings(w: World, tc: Building, villagers: Unit[]): boolean {
    const p = w.players[this.player];
    const have = (t: BuildingType) => [...w.buildings(this.player)].filter((b) => b.type === t).length;
    const want: Array<[BuildingType, number]> = [];
    if (p.age >= 1) want.push(['archery_range', 1], ['stable', 1]);
    if (p.age >= 2) want.push(['barracks', 1 + Math.min(1, this.ai.extraProduction)], ['archery_range', 1 + Math.min(1, this.ai.extraProduction)], ['stable', 1 + (this.ai.extraProduction > 1 ? 1 : 0)]);
    if (p.age >= 2 && this.ai.siege) want.push(['siege_workshop', 1]);
    if (p.age >= 2 && this.ai.siege && this.difficulty === 'hard') want.push(['castle', 1]);
    if (p.age >= 3 && this.ai.siege && this.enemyWalls(w).length) want.push(['castle', 1]);
    // Keep enough back to advance first.
    for (const [t, n] of want) {
      if (have(t) >= n || BUILDING_DEFS[t].age > p.age) continue;
      if ([...w.buildings(this.player)].some((b) => b.type === t && !b.complete)) continue;
      if (this.build(w, t, tc.x + tc.size / 2, tc.y + tc.size / 2, villagers, 3, 8)) return true;
    }
    return false;
  }

  // ---------- walls ----------

  /** Hard rings its town with palisade in Age I and stone in Age II; Normal walls the side facing the enemy. */
  private fortify(w: World, tc: Building, villagers: Unit[]): boolean {
    const p = w.players[this.player];
    if (this.ai.walls === 'none' || villagers.length < 14) return false;
    const enemy = this.enemyStarts(w)[0];
    if (!enemy) return false;
    const cx = tc.x + 2, cy = tc.y + 2;
    const advancing = tc.queue.some((q) => q.tech);
    const stage = this.ai.walls === 'full' ? (p.age >= 2 ? 2 : p.age >= 1 || advancing ? 1 : 0) : p.age >= 1 && w.time > 14 * 60 ? 1 : 0;
    if (stage <= this.walled) return false;
    const stone = stage === 2;
    const kind = stone ? 'stone' : 'palisade';
    const R = stone ? 17 : 14;
    const cost = stone ? 5 : 2;
    let tiles = this.ring(cx, cy, R);
    if (this.ai.walls === 'partial' || stone) {
      // Only the stretch that faces the enemy.
      const ex = enemy.x - cx, ey = enemy.y - cy, el = Math.hypot(ex, ey) || 1;
      tiles = tiles.filter((t) => ((t.x - cx) * ex + (t.y - cy) * ey) / (Math.hypot(t.x - cx, t.y - cy) * el) > 0.35);
    }
    tiles = tiles.filter((t) => w.canPlace(stone ? 'stone_wall' : 'palisade_wall', this.player, t.x, t.y));
    const res = stone ? p.resources.stone : p.resources.wood;
    if (tiles.length < 6 || res < tiles.length * cost * 0.6) return false;
    // Gates every so often along the line so the villagers can get out.
    const withGates = tiles.map((t, k) => ({ ...t, gate: k % 14 === 7 }));
    const crew = villagers
      .filter((u) => !this.builders.has(u.id))
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
      .slice(0, stone ? 5 : 4);
    if (!crew.length) return false;
    for (const u of crew) this.builders.set(u.id, w.time + 90);
    this.issue(w, { type: 'buildWall', ids: crew.map((u) => u.id), kind, tiles: withGates });
    this.walled = stage;
    // Towers by the wall facing the enemy.
    if (stone || this.difficulty === 'hard') {
      const ex = enemy.x - cx, ey = enemy.y - cy, el = Math.hypot(ex, ey) || 1;
      const tx = Math.round(cx + (ex / el) * (R - 2)), ty = Math.round(cy + (ey / el) * (R - 2));
      this.build(w, 'watch_tower', tx, ty, villagers, 2, 1);
    }
    return true;
  }

  /** A square ring of tiles at Chebyshev radius r, in order around it. */
  private ring(cx: number, cy: number, r: number): Array<{ x: number; y: number }> {
    const corners = [
      [cx - r, cy - r],
      [cx + r, cy - r],
      [cx + r, cy + r],
      [cx - r, cy + r],
    ];
    const out: Array<{ x: number; y: number }> = [];
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % 4];
      out.push(...wallLine(x0, y0, x1, y1).slice(0, -1));
    }
    return out;
  }

  /** Damaged walls and towers get a villager to patch them while it is quiet. */
  private repairs(w: World, villagers: Unit[]): void {
    if (this.threats(w).length) return;
    const fixing = villagers.filter((u) => u.order?.type === 'repair').length;
    if (fixing >= 2) return;
    for (const b of w.buildings(this.player)) {
      const def = BUILDING_DEFS[b.type];
      if (!b.complete || !(def.wall || def.classes.includes('tower') || def.classes.includes('castle'))) continue;
      if (b.hp > def.hp * 0.6) continue;
      const u = villagers.filter((v) => !this.builders.has(v.id) && v.order?.type !== 'build').sort((a, c) => distToRect(a.x, a.y, b.x, b.y, b.size) - distToRect(c.x, c.y, b.x, b.y, b.size))[0];
      if (u) {
        this.builders.set(u.id, w.time + 30);
        this.issue(w, { type: 'help', ids: [u.id], id: b.id });
      }
      return;
    }
  }

  // ---------- army ----------

  private army(w: World): Unit[] {
    return [...w.units(this.player)].filter((u) => !isGatherer(u) && !UNIT_DEFS[u.type].naval && u.type !== 'scout' && u.type !== 'king' && u.type !== 'monk' && !u.inside && !this.guards.has(u.id) && !this.push?.ids.has(u.id));
  }

  /** Wanted share of each unit type now: the age's mix, leaning toward counters. */
  private mix(w: World): Partial<Record<UnitType, number>> {
    const p = w.players[this.player];
    const base = { ...COMPOSITION[p.age] };
    if (this.ai.counter > 0 && this.seen.size >= 3) {
      const byClass = new Map<UnitClass, number>();
      for (const t of this.seen.values()) {
        const c = UNIT_DEFS[t].classes.includes('spear') ? 'spear' : UNIT_DEFS[t].classes.includes('skirmisher') ? 'skirmisher' : UNIT_DEFS[t].classes[0];
        byClass.set(c, (byClass.get(c) ?? 0) + 1);
      }
      const [top] = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
      for (const t of COUNTERS[top[0]] ?? []) {
        if (UNIT_DEFS[t].age > p.age) continue;
        base[t] = (base[t] ?? 0) + this.ai.counter;
        break;
      }
    }
    // The faction's own unit, once there is a Castle to train it.
    const unique = FACTIONS[p.faction as FactionId]?.unique;
    if (unique && p.age >= 2 && [...w.buildings(this.player)].some((b) => b.type === 'castle' && b.complete)) base[unique] = 0.3;
    // Siege when walls stand in the way.
    // Siege: rams always from Age III (Town Centers and Castles don't fall to arrows), more against walls.
    if (this.ai.siege && p.age >= 2) {
      const walls = this.enemyWalls(w).length > 0;
      base.ram = walls ? 0.12 : 0.07;
      if (p.age >= 3) base.trebuchet = walls ? 0.06 : 0.04;
      else if (walls) base.mangonel = 0.05;
    }
    // Siege outlives the soldiers around it: never more than a handful.
    const count = (t: UnitType) => this.army(w).filter((u) => u.type === t).length;
    for (const [t, max] of [['ram', 4], ['trebuchet', 3], ['mangonel', 2]] as const) if (count(t) >= max) delete base[t];
    return base;
  }

  /** Keeps every production building busy with the most-wanted unit it can make. */
  private produce(w: World): void {
    const p = w.players[this.player];
    const army = this.army(w);
    const queued = [...w.buildings(this.player)].reduce((n, b) => n + b.queue.filter((q) => q.unit && !UNIT_DEFS[q.unit].gatherer && !UNIT_DEFS[q.unit].naval).length, 0);
    if (army.length + queued >= this.ai.armyCap[p.age]) return;
    const threatened = this.threats(w).length > 0;
    // Age I is for booming: soldiers only to answer a raid.
    if (p.age === 0 && !threatened) return;
    // Don't starve the next age-up of food and gold (unless under attack).
    const reserve = threatened ? 0 : p.age < 3 ? 0.8 : 0;
    const mix = this.mix(w);
    const total = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0) || 1;
    const have = new Map<UnitType, number>();
    for (const u of army) have.set(u.type, (have.get(u.type) ?? 0) + 1);
    for (const b of w.buildings(this.player)) for (const q of b.queue) if (q.unit) have.set(q.unit, (have.get(q.unit) ?? 0) + 1);
    const size = army.length + queued + 1;
    for (const b of w.buildings(this.player)) {
      if (!b.complete || b.queue.length >= 2 || b.type === 'town_center' || b.type === 'dock') continue;
      const options = BUILDING_DEFS[b.type].trains.filter((t) => (mix[t] ?? 0) > 0 && UNIT_DEFS[t].age <= p.age && (!UNIT_DEFS[t].faction || UNIT_DEFS[t].faction === p.faction));
      if (!options.length) continue;
      options.sort((a, c) => (have.get(a) ?? 0) / size - (mix[a] ?? 0) / total - ((have.get(c) ?? 0) / size - (mix[c] ?? 0) / total));
      const age = p.age < 3 ? TECH_DEFS[(['age2', 'age3', 'age4'] as TechId[])[p.age]].cost : {};
      const affordable = (u: UnitType) =>
        Object.entries(unitCost(w, this.player, u)).every(([k, v]) => p.resources[k as ResourceKind] - (age[k as ResourceKind] ?? 0) * reserve >= (v ?? 0));
      // The most-wanted unit it can pay for (short of gold, say, it makes spearmen rather than nothing).
      const t = options.find(affordable);
      if (!t) continue;
      this.issue(w, { type: 'train', id: b.id, unit: t });
      have.set(t, (have.get(t) ?? 0) + 1);
    }
  }

  /** Swaps a glut of food or wood for gold (or stone) at the market once the mines run low. */
  private trade(w: World): void {
    const p = w.players[this.player];
    const market = [...w.buildings(this.player)].find((b) => b.type === 'market' && b.complete);
    if (!market || p.age < 2) return;
    if (p.resources.gold < 600) {
      const res = p.resources.food >= p.resources.wood ? 'food' : 'wood';
      if (p.resources[res] > 1500) this.issue(w, { type: 'trade', id: market.id, action: 'sell', res });
    }
  }

  private trainIf(w: World, b: Building, t: UnitType): void {
    const p = w.players[this.player];
    const cost = unitCost(w, this.player, t);
    if (Object.entries(cost).every(([k, v]) => p.resources[k as ResourceKind] >= (v ?? 0))) this.issue(w, { type: 'train', id: b.id, unit: t });
  }

  private researchMilitary(w: World): void {
    const p = w.players[this.player];
    if (p.age < 1 || (w.tick % 5 !== 0 && this.ai.think < 2)) return;
    for (const id of this.ai.militaryTechs) {
      const t = TECH_DEFS[id];
      if (researchBlock(w, this.player, id)) continue;
      const at = [...w.buildings(this.player)].find((b) => b.type === t.building && b.complete && b.queue.length === 0);
      if (!at) continue;
      // Only from comfortable surplus.
      if (Object.entries(t.cost).every(([k, v]) => p.resources[k as ResourceKind] >= (v ?? 0) * 2)) {
        this.issue(w, { type: 'research', id: at.id, tech: id });
        return;
      }
    }
  }

  // ---------- fighting ----------

  /** Enemy soldiers near our buildings. */
  private threats(w: World): Unit[] {
    const fog = w.fog[this.player];
    const mine = [...w.buildings(this.player)].filter((b) => b.type !== 'palisade_wall' && b.type !== 'stone_wall');
    const out: Unit[] = [];
    for (const e of w.field()) {
      if (!w.canFight(this.player, e.owner) || !fog?.isVisible(e.x, e.y) || UNIT_DEFS[e.type].gatherer) continue;
      if (mine.some((b) => distToRect(e.x, e.y, b.x, b.y, b.size) < 10)) out.push(e);
    }
    return out;
  }

  /** The enemy has no buildings left anywhere: hunt down whatever still stands. */
  private endgame(w: World): boolean {
    for (const b of w.buildings()) if (w.isEnemy(this.player, b.owner) && !BUILDING_DEFS[b.type].wall && !BUILDING_DEFS[b.type].naval) return false;
    return true;
  }

  /** Nearest surviving enemy unit (ships or land), seen or not: the last stragglers. */
  private straggler(w: World, x: number, y: number, ships: boolean): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const e of w.units()) {
      if (!w.isEnemy(this.player, e.owner) || !!UNIT_DEFS[e.type].naval !== ships) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) (bd = d), (best = e);
    }
    return best;
  }

  private enemyWalls(w: World): Building[] {
    return this.enemyBuildings(w).filter((b) => BUILDING_DEFS[b.type].wall);
  }

  /** Where the army gathers between waves: in front of the town, toward the enemy. */
  private rally(w: World, tc: Building | null): { x: number; y: number } {
    const home = tc ? { x: tc.x + 2, y: tc.y + 2 } : w.map.starts[this.player];
    const e = this.enemyStarts(w)[0] ?? home;
    const d = Math.hypot(e.x - home.x, e.y - home.y) || 1;
    const k = Math.min(9, d / 3);
    const want = { x: home.x + ((e.x - home.x) / d) * k, y: home.y + ((e.y - home.y) / d) * k };
    const spot = w.grid.nearestWalkable(want.x, want.y, w.grid.component(Math.floor(home.x), Math.floor(home.y + 3), this.player), 12, this.player);
    return spot ? { x: spot.x + 0.5, y: spot.y + 0.5 } : want;
  }

  private command(w: World, tc: Building | null): void {
    const army = this.army(w);
    const rally = this.rally(w, tc);
    const threats = this.threats(w);
    const inWave = (u: Unit) => this.wave?.ids.has(u.id) ?? false;

    // Defend: everyone at home turns on raiders.
    if (threats.length) {
      const home = army.filter((u) => !inWave(u));
      this.engage(w, home, threats, 40);
      // A wave far away comes back if the town is overrun.
      if (this.wave && threats.length >= 4 && threats.length > home.length * 1.5) this.endWave(w, rally);
    }

    // Wounded leave the fight.
    for (const u of army) {
      if (isSiege(u) || u.hp > UNIT_DEFS[u.type].hp * 0.25 || !inWave(u)) continue;
      this.wave!.ids.delete(u.id);
      this.issue(w, { type: 'move', ids: [u.id], x: rally.x, y: rally.y });
    }

    this.raidThink(w, army, rally, threats.length > 0);
    if (this.wave) return this.pressWave(w, army.filter((u) => !this.raid?.ids.has(u.id)), rally);

    // Between waves: gather at the rally point.
    const loose = army.filter((u) => !u.order && !this.raid?.ids.has(u.id) && Math.hypot(u.x - rally.x, u.y - rally.y) > 6);
    if (loose.length) this.issue(w, { type: 'move', ids: loose.map((u) => u.id), x: rally.x, y: rally.y });

    const p = w.players[this.player];
    const value = army.reduce((s, u) => s + valueOf(u.type), 0);
    // Overseas, a wave needs boats to go anywhere.
    const boats = !this.geography?.naval || [...w.units(this.player)].some((u) => u.type === 'transport_ship');
    // Strong enough, as big as it is allowed to get, or clearly stronger than what the enemy has
    // left (just after beating off their attack, say): strike while they are weak.
    let enemyValue = 0;
    for (const e of w.units()) if (w.isEnemy(this.player, e.owner) && !isGatherer(e) && !UNIT_DEFS[e.type].naval) enemyValue += valueOf(e.type);
    const advantage = p.age > 0 && value >= this.ai.wave[p.age] * 0.8 && value > enemyValue * 1.5;
    const strong = value >= this.ai.wave[p.age] || (army.length >= this.ai.armyCap[p.age] * 0.9 && p.age > 0) || advantage;
    // An enemy Wonder or relic hold is a clock running against us: go now with what we have.
    const urgent = army.length >= 6 && (this.enemyWonder(w) || (!!w.modeState.relicHold && w.modeState.relicHold.team !== p.team));
    const ready = boats && (strong || urgent) && !w.peace && (w.time >= this.ai.firstAttack || urgent) && w.time - this.lastWave > 45 && !threats.length;
    if (!ready) {
      if (w.tick % 600 === 0) this.note(w, `holding: value ${value}/${this.ai.wave[p.age]} threats ${threats.length}`);
      return;
    }
    // Nothing scouted yet (an enemy overseas, say): head for where they started and look.
    const target = this.pickTarget(w, rally, army.some(isSiege));
    this.wave = { ids: new Set(army.filter((u) => !this.raid?.ids.has(u.id)).map((u) => u.id)), target: target?.id ?? 0, value, since: w.time, staged: !target || !!this.geography?.naval };
    this.note(w, `wave of ${army.length} (value ${value}) at ${target?.type ?? 'enemy start'}`);
    this.lastWave = w.time;
  }

  /**
   * Raids: a few horsemen ride at the enemy's furthest-out lumber or mining
   * camp and cut down the workers there, then come home when hurt or met by
   * soldiers. Hitting the economy is what lets one side pull ahead.
   */
  private raidThink(w: World, army: Unit[], rally: { x: number; y: number }, threatened: boolean): void {
    const fog = w.fog[this.player];
    if (this.raid) {
      const r = this.raid;
      const riders = army.filter((u) => r.ids.has(u.id));
      const camp = w.building(r.camp);
      const hp = riders.reduce((s, u) => s + u.hp / UNIT_DEFS[u.type].hp, 0) / Math.max(1, riders.length);
      const cx = riders.reduce((s, u) => s + u.x, 0) / Math.max(1, riders.length), cy = riders.reduce((s, u) => s + u.y, 0) / Math.max(1, riders.length);
      const guards: Unit[] = [], workers: Unit[] = [];
      for (const e of w.field()) {
        if (!w.canFight(this.player, e.owner) || !fog?.isVisible(e.x, e.y) || Math.hypot(e.x - cx, e.y - cy) > 10) continue;
        (isGatherer(e) ? workers : guards).push(e);
      }
      const over = riders.length < 2 || hp < 0.45 || guards.length > riders.length || threatened || w.time - r.since > 150 || w.peace;
      if (over) {
        this.issue(w, { type: 'move', ids: riders.map((u) => u.id), x: rally.x, y: rally.y });
        this.raid = null;
        this.lastRaid = w.time;
        return;
      }
      if (workers.length) this.engage(w, riders, workers, 12);
      else if (camp) {
        const idle = riders.filter((u) => !u.order);
        if (idle.length) this.issue(w, { type: 'move', ids: idle.map((u) => u.id), x: camp.x + 1, y: camp.y + 1 });
      } else this.raid.since = -1e9; // camp gone and nobody about: done
      return;
    }
    const p = w.players[this.player];
    if (p.age < 1 || w.peace || threatened || w.time < this.ai.firstAttack - 120 || w.time - this.lastRaid < 90) return;
    const riders = army.filter((u) => UNIT_DEFS[u.type].classes.includes('cavalry') && !this.wave?.ids.has(u.id) && u.hp > UNIT_DEFS[u.type].hp * 0.8);
    if (riders.length < 4) return;
    // The camp furthest from its owner's town centre.
    let best: Building | null = null, bd = -1;
    for (const b of this.enemyBuildings(w)) {
      if (b.type !== 'lumber_camp' && b.type !== 'mining_camp' && b.type !== 'mill') continue;
      const tc = [...w.buildings(b.owner)].find((t) => t.type === 'town_center');
      const d = tc ? Math.hypot(b.x - tc.x, b.y - tc.y) : 99;
      if (d > bd) (bd = d), (best = b);
    }
    if (!best || bd < 10) return;
    const group = riders.slice(0, 8);
    this.raid = { ids: new Set(group.map((u) => u.id)), camp: best.id, since: w.time };
    this.note(w, `raid of ${group.length} on ${best.type}`);
    this.issue(w, { type: 'move', ids: group.map((u) => u.id), x: best.x + 1, y: best.y + 1 });
  }

  private endWave(w: World, rally: { x: number; y: number }): void {
    if (!this.wave) return;
    this.note(w, `wave ends, ${this.wave.ids.size} left`);
    const ids = [...this.wave.ids].filter((id) => w.unit(id) && !w.unit(id)!.inside);
    if (ids.length) this.issue(w, { type: 'move', ids, x: rally.x, y: rally.y });
    this.wave = null;
  }

  /**
   * The wave's objective: the nearest enemy building, but buildings that shoot
   * back (Town Centers, towers, castles) only once there is siege to take them
   * on or nothing else is left; camps, houses and production come first.
   */
  private pickTarget(w: World, from: { x: number; y: number }, siege = false): Building | null {
    let best: Building | null = null, bd = Infinity;
    for (const b of this.enemyBuildings(w)) {
      const def = BUILDING_DEFS[b.type];
      if (def.wall || def.naval || this.unreachable.has(b.id)) continue;
      const armed = !!def.attack;
      let d = distToRect(from.x, from.y, b.x, b.y, b.size) + (armed && !siege ? 60 : 0) - (b.type === 'town_center' && siege ? 15 : 0);
      // What would lose us the match comes first: a Wonder, the monastery with the relics, the King's stronghold.
      if (b.type === 'wonder' && b.complete) d -= 200;
      if (b.type === 'monastery' && w.modeState.relicHold && w.modeState.relicHold.team !== w.players[this.player].team) d -= 120;
      if (w.mode === 'regicide' && b.garrison.some((id) => w.unit(id)?.type === 'king')) d -= siege ? 80 : 20;
      if (d < bd) (bd = d), (best = b);
    }
    return best;
  }

  /** Drives the current wave: fight what's near, else march on the target, breaching walls or ferrying over water. */
  private pressWave(w: World, army: Unit[], rally: { x: number; y: number }): void {
    const wave = this.wave!;
    const units = army.filter((u) => wave.ids.has(u.id));
    for (const id of wave.ids) if (!w.unit(id)) wave.ids.delete(id);
    const value = units.reduce((s, u) => s + valueOf(u.type), 0);
    // A wave that has lost two thirds of its strength goes home, unless the enemy has next to nothing left to fight with.
    let enemyArmy = 0;
    for (const e of w.units()) if (w.isEnemy(this.player, e.owner) && !isGatherer(e) && !UNIT_DEFS[e.type].naval) enemyArmy += valueOf(e.type);
    const mopUp = enemyArmy < value * 0.2;
    // Against a beaten enemy, everyone waiting at home joins in.
    if (enemyArmy < 400 || mopUp)
      for (const u of army) if (!wave.ids.has(u.id) && !u.order && !this.raid?.ids.has(u.id) && Math.hypot(u.x - rally.x, u.y - rally.y) < 10) wave.ids.add(u.id);
    if (!units.length || (value < wave.value * 0.33 && !mopUp) || w.peace) return this.endWave(w, rally);
    let target = w.building(wave.target);
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length, cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    if (!target || !w.isEnemy(this.player, target.owner)) {
      target = this.pickTarget(w, { x: cx, y: cy }, units.some(isSiege)) ?? undefined;
      if (!target && this.endgame(w)) {
        // No buildings left: run down the last of their people.
        const prey = this.straggler(w, cx, cy, false);
        const idle = units.filter((u) => !u.order);
        if (prey && idle.length) this.issue(w, { type: 'attack', ids: idle.map((u) => u.id), id: prey.id });
        else if (prey && w.tick % 300 === 0) this.issue(w, { type: 'move', ids: units.filter((u) => u.order?.type !== 'attack').map((u) => u.id), x: prey.x, y: prey.y });
        return;
      }
      if (!target) {
        // Nothing known: march on where an enemy started, to find them.
        const e = this.enemyStarts(w)[0];
        if (!e) return this.endWave(w, rally);
        const idle = units.filter((u) => !u.order);
        if (idle.length) this.issue(w, { type: 'move', ids: idle.map((u) => u.id), x: e.x + 0.5, y: e.y + 0.5 });
        return;
      }
      wave.target = target.id;
    }
    // Fight enemy soldiers around the army first.
    const fog = w.fog[this.player];
    const near: Unit[] = [];
    const around: Unit[] = [];
    for (const e of w.field()) {
      if (!w.canFight(this.player, e.owner) || UNIT_DEFS[e.type].naval || !fog?.isVisible(e.x, e.y)) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d < 12) near.push(e);
      if (d < 30) around.push(e);
    }
    const fighters = units.filter((u) => !isSiege(u));
    // Regicide: a King caught in the open is the whole match.
    const king = w.mode === 'regicide' ? around.find((e) => e.type === 'king') : undefined;
    if (king) {
      const ids = fighters.filter((u) => !(u.order?.type === 'attack' && u.order.id === king.id)).map((u) => u.id);
      if (ids.length) this.issue(w, { type: 'attack', ids, id: king.id });
      return;
    }
    if (near.length) this.engage(w, fighters, near, 14);
    // Every soldier also turns on enemies right beside it (stragglers too), rather than marching past them.
    if (around.length) this.engage(w, fighters.filter((u) => u.order?.type !== 'attack' || !w.unit(u.order.id)), around, 7);

    // March together to a point short of the target and wait for the stragglers, so the army arrives as one.
    if (!wave.staged) {
      const tx = target.x + target.size / 2, ty = target.y + target.size / 2;
      const d = Math.hypot(tx - rally.x, ty - rally.y) || 1;
      const k = Math.max(0, d - 16);
      const stage = w.grid.nearestWalkable(rally.x + ((tx - rally.x) / d) * k, rally.y + ((ty - rally.y) / d) * k, w.grid.component(Math.floor(rally.x), Math.floor(rally.y), this.player), 8, this.player);
      if (!stage || near.length > units.length / 3) wave.staged = true;
      else {
        const sx = stage.x + 0.5, sy = stage.y + 0.5;
        const there = units.filter((u) => Math.hypot(u.x - sx, u.y - sy) < 7).length;
        if (there >= units.length * 0.75 || w.time - wave.since > 120) wave.staged = true;
        else {
          const lagging = units.filter((u) => !u.order || (u.order.type === 'move' && Math.hypot(u.order.x - sx, u.order.y - sy) > 4));
          if (lagging.length) this.issue(w, { type: 'move', ids: lagging.map((u) => u.id), x: sx, y: sy });
          return;
        }
      }
    }

    // Can we walk there? (Judged from where a soldier stands: the army's middle may be water.)
    const anchor = units.find((u) => w.grid.isWalkable(Math.floor(u.x), Math.floor(u.y), this.player)) ?? units[0];
    const reach = this.reachable(w, anchor.x, anchor.y, target);
    if (w.tick % 300 === 0) this.note(w, `press: ${units.length} units at ${Math.round(cx)},${Math.round(cy)} -> ${target.type}@${target.x},${target.y} reach=${reach} near=${near.length}`);
    if (!reach) {
      if (this.geography?.naval && !this.sameLand(w, anchor.x, anchor.y, target)) {
        // Over the water: march on it; transports pick the army up (moveLand ferries).
        const waiting = units.filter((u) => !u.order);
        if (waiting.length) this.issue(w, { type: 'move', ids: waiting.map((u) => u.id), x: target.x + target.size / 2, y: target.y + target.size / 2 });
        return;
      }
      // Walls: break the nearest segment (gates first) with everything, siege leading.
      const wall = this.breach(w, anchor.x, anchor.y, target);
      if (!wall) {
        // No way in that we can see: try something else.
        this.unreachable.add(target.id);
        wave.target = 0;
        return;
      }
      if (wall) {
        const idle = units.filter((u) => u.order?.type !== 'attack' || (u.order.id !== wall.id && !near.length) || isSiege(u));
        const ids = idle.filter((u) => !(u.order?.type === 'attack' && u.order.id === wall.id)).map((u) => u.id);
        if (ids.length) this.issue(w, { type: 'attack', ids, id: wall.id });
        return;
      }
    }
    const idle = units.filter((u) => !u.order || (u.order.type === 'move' && Math.hypot(u.x - rally.x, u.y - rally.y) < 8));
    if (idle.length) this.issue(w, { type: 'attack', ids: idle.map((u) => u.id), id: target.id });
  }

  /** Each of our units attacks the nearest of these enemies (if it isn't already fighting one). */
  private engage(w: World, ours: Unit[], enemies: Unit[], range: number): void {
    const groups = new Map<number, number[]>();
    for (const u of ours) {
      if (u.order?.type === 'attack' && w.unit(u.order.id) && enemies.some((e) => e.id === (u.order as { id: number }).id)) continue;
      let best: Unit | null = null, bd = range;
      for (const e of enemies) {
        // Melee can't fight ships; nobody but siege bothers with walls here.
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) (bd = d), (best = e);
      }
      if (!best) continue;
      const list = groups.get(best.id) ?? [];
      list.push(u.id);
      groups.set(best.id, list);
    }
    for (const [id, ids] of groups) this.issue(w, { type: 'attack', ids, id });
  }

  /** Is there a walkable tile beside the building in the army's region? */
  private reachable(w: World, x: number, y: number, b: Building): boolean {
    const region = w.grid.component(Math.floor(x), Math.floor(y), this.player);
    if (region < 0) return true; // standing somewhere odd: don't second-guess
    for (let ty = b.y - 1; ty <= b.y + b.size; ty++)
      for (let tx = b.x - 1; tx <= b.x + b.size; tx++) if (w.grid.isWalkable(tx, ty, this.player) && w.grid.component(tx, ty, this.player) === region) return true;
    return false;
  }

  /** Same landmass, ignoring walls and buildings (so blocked means walls, not sea). */
  private sameLand(w: World, x: number, y: number, b: Building): boolean {
    const N = w.map.size;
    const seen = new Uint8Array(N * N);
    const start = Math.floor(y) * N + Math.floor(x);
    const goal = (i: number) => {
      const tx = i % N, ty = (i / N) | 0;
      return tx >= b.x - 1 && tx <= b.x + b.size && ty >= b.y - 1 && ty <= b.y + b.size;
    };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      if (goal(i)) return true;
      const tx = i % N;
      for (const j of [tx > 0 ? i - 1 : -1, tx < N - 1 ? i + 1 : -1, i - N, i + N]) {
        if (j < 0 || j >= N * N || seen[j] || w.map.terrain[j] === Terrain.Deep) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return false;
  }

  // ---------- game modes ----------

  private enemyWonder(w: World): boolean {
    return this.enemyBuildings(w).some((b) => b.type === 'wonder');
  }

  /** In the last age with money to spare, raise a Wonder (Hard and Normal boomers). */
  private wonder(w: World, tc: Building, villagers: Unit[]): void {
    const p = w.players[this.player];
    if (p.age < 3 || this.difficulty === 'easy' || this.saving) return;
    if ([...w.buildings(this.player)].some((b) => b.type === 'wonder')) {
      // Keep plenty of hands on it.
      const site = [...w.buildings(this.player)].find((b) => b.type === 'wonder' && !b.complete);
      if (site && w.builders.get(site.id) === undefined && w.tick % 50 === 0) {
        const crew = villagers.filter((u) => u.order?.type !== 'build').slice(0, 8);
        if (crew.length) this.issue(w, { type: 'help', ids: crew.map((u) => u.id), id: site.id });
      }
      return;
    }
    if ((['food', 'wood', 'gold', 'stone'] as ResourceKind[]).every((r) => p.resources[r] >= 1100)) {
      if (this.build(w, 'wonder', tc.x + tc.size / 2, tc.y + tc.size / 2, villagers, 8, 7)) this.note(w, 'builds a Wonder');
    }
  }

  /** With a Monastery up, a couple of monks fetch the relics we know of. */
  private relicHunt(w: World): void {
    const mon = [...w.buildings(this.player)].find((b) => b.type === 'monastery' && b.complete);
    if (!mon) return;
    const fog = w.fog[this.player];
    const loose = [...relics(w)].filter((r) => !r.holder && !r.carrier && fog?.isExplored(r.x, r.y));
    const monks = [...w.units(this.player)].filter((u) => u.type === 'monk' && !u.inside);
    if (!loose.length) {
      // Nothing to fetch: idle monks wait by the Monastery.
      for (const m of monks) if (!m.order && distToRect(m.x, m.y, mon.x, mon.y, mon.size) > 4) this.issue(w, { type: 'move', ids: [m.id], x: mon.x + mon.size / 2, y: mon.y + mon.size + 1 });
      return;
    }
    if (monks.length < 2 && mon.queue.length === 0) this.trainIf(w, mon, 'monk');
    const taken = new Set(monks.map((m) => (m.order?.type === 'relic' ? m.order.id : 0)));
    for (const m of monks) {
      if (m.order || carried(w, m)) continue;
      const r = loose.filter((x) => !taken.has(x.id)).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
      if (!r) break;
      taken.add(r.id);
      this.issue(w, { type: 'gather', ids: [m.id], target: { kind: 'entity', id: r.id } });
    }
  }

  /**
   * Regicide: the King stays inside the strongest shelter; when that falls
   * below a third of its strength he slips out to another; any enemy near
   * him calls the army home.
   */
  private guardKing(w: World): void {
    const king = kingOf(w, this.player);
    if (!king) return;
    const holder = king.inside ? w.building(king.inside) : undefined;
    const shelters = [...w.buildings(this.player)].filter((b) => b.id !== holder?.id && canShelter(b, king) && shelterRoom(b) > 0 && b.hp > buildingMaxHpOf(w, b) * 0.5);
    const threats = this.threats(w);
    const at = holder ? { x: holder.x + holder.size / 2, y: holder.y + holder.size / 2 } : king;
    const danger = threats.filter((e) => Math.hypot(e.x - at.x, e.y - at.y) < 14);
    if (danger.length && this.wave && danger.length >= 3) this.endWave(w, this.rally(w, this.townCenter(w)));
    if (holder) {
      // Leave a failing stronghold for a sound one, away from the attackers.
      if (holder.hp < buildingMaxHpOf(w, holder) * 0.33 && shelters.length) this.issue(w, { type: 'ungarrison', id: holder.id });
      return;
    }
    if (king.order?.type === 'garrison') return;
    const best = shelters.sort((a, b) => this.shelterScore(a, king, danger) - this.shelterScore(b, king, danger))[0];
    if (best) this.issue(w, { type: 'garrison', ids: [king.id], id: best.id });
    else if (danger.length) {
      // Nowhere to hide: run from the nearest attacker toward the army.
      const rally = this.rally(w, this.townCenter(w));
      this.issue(w, { type: 'move', ids: [king.id], x: rally.x, y: rally.y });
    }
  }

  private shelterScore(b: Building, king: Unit, danger: Unit[]): number {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    const near = danger.reduce((s, e) => s + Math.max(0, 16 - Math.hypot(e.x - cx, e.y - cy)), 0);
    return Math.hypot(cx - king.x, cy - king.y) + near * 4 - (b.type === 'castle' ? 8 : 0);
  }

  /**
   * Domination: post a few soldiers on each site we hold (and a tower beside
   * it), and send the rest of the free army to take the nearest site we
   * don't, fighting whatever stands on it.
   */
  private holdSites(w: World, tc: Building, villagers: Unit[]): void {
    const sites = w.modeState.sites;
    if (!sites.length || w.peace) return;
    const p = w.players[this.player];
    const ours = (s: Site) => s.owner >= 0 && w.players[s.owner].team === p.team;
    // Drop guards that died or whose site was lost.
    for (const [id, k] of this.guards) if (!w.unit(id) || !ours(sites[k])) this.guards.delete(id);
    const free = this.army(w).filter((u) => !isSiege(u) && !this.raid?.ids.has(u.id) && !this.wave?.ids.has(u.id));
    const pushing = this.push ? [...this.push.ids] : [];
    const pool = [...free];
    sites.forEach((s, k) => {
      if (!ours(s)) return;
      const posted = [...this.guards.values()].filter((v) => v === k).length;
      for (const u of pool.splice(0, Math.max(0, 3 - posted))) {
        this.guards.set(u.id, k);
        this.issue(w, { type: 'move', ids: [u.id], x: s.x + (((u.id * 37) % 5) - 2) * 0.7, y: s.y + (((u.id * 53) % 5) - 2) * 0.7 });
      }
      // A tower by each site we hold (it also speeds recapture).
      if (p.age >= 1 && w.tick % 100 === 0) {
        const tower = [...w.buildings(this.player)].some((b) => (b.type === 'watch_tower' || b.type === 'castle') && distToRect(s.x, s.y, b.x, b.y, b.size) <= 5);
        if (!tower) {
          const spot = this.findSpot(w, 'watch_tower', s.x, s.y, 2);
          if (spot && Math.hypot(spot.x - s.x, spot.y - s.y) < 5) this.buildAt(w, 'watch_tower', spot, villagers, 2);
        }
      }
    });
    // Guards drift back to their post after a chase.
    for (const [id, k] of this.guards) {
      const u = w.unit(id)!;
      if (!u.order && Math.hypot(u.x - sites[k].x, u.y - sites[k].y) > 4) this.issue(w, { type: 'move', ids: [id], x: sites[k].x, y: sites[k].y });
    }
    // Take the next site.
    if (this.push) {
      const s = sites[this.push.site];
      for (const id of this.push.ids) if (!w.unit(id)) this.push.ids.delete(id);
      const units = pushing.map((id) => w.unit(id)).filter((u): u is Unit => !!u && !u.inside);
      if (ours(s) || !units.length || w.time - this.push.since > 240) {
        // Taken (the push stays as its guard) or failed.
        for (const u of units.slice(0, 3)) if (ours(s)) this.guards.set(u.id, this.push.site);
        this.push = null;
        return;
      }
      const fog = w.fog[this.player];
      const foes = [...w.field()].filter((e) => w.canFight(this.player, e.owner) && fog?.isVisible(e.x, e.y) && Math.hypot(e.x - s.x, e.y - s.y) < SITE_RADIUS_AI + 6);
      if (foes.length) this.engage(w, units, foes, 16);
      const idle = units.filter((u) => !u.order && Math.hypot(u.x - s.x, u.y - s.y) > 3);
      if (idle.length) this.issue(w, { type: 'move', ids: idle.map((u) => u.id), x: s.x, y: s.y });
      return;
    }
    const pushers = pool;
    if (pushers.length < 4 || this.threats(w).length) return;
    const home = { x: tc.x + tc.size / 2, y: tc.y + tc.size / 2 };
    const targets = sites.map((s, k) => ({ s, k })).filter(({ s }) => !ours(s) && !(s.by >= 0 && w.players[s.by].team === p.team && s.capture > CAPTURE_TIME * 0.5));
    // Nearest first; neutral ones before enemy-held.
    targets.sort((a, b) => Math.hypot(a.s.x - home.x, a.s.y - home.y) + (a.s.owner >= 0 ? 15 : 0) - Math.hypot(b.s.x - home.x, b.s.y - home.y) - (b.s.owner >= 0 ? 15 : 0));
    const t = targets[0];
    if (!t) return;
    this.push = { ids: new Set(pushers.map((u) => u.id)), site: t.k, since: w.time };
    this.note(w, `push of ${pushers.length} on site ${t.k}`);
    this.issue(w, { type: 'move', ids: pushers.map((u) => u.id), x: t.s.x, y: t.s.y });
  }

  /** The enemy wall segment to break: the nearest gate or wall to the army (any near the target, seen or not). */
  private breach(w: World, x: number, y: number, target: Building): Building | null {
    let best: Building | null = null, bd = Infinity;
    const fog = w.fog[this.player];
    const walls = [...w.buildings()].filter(
      (b) => w.isEnemy(this.player, b.owner) && BUILDING_DEFS[b.type].wall && (fog?.isExplored(b.x, b.y) || distToRect(b.x, b.y, target.x, target.y, target.size) < 20),
    );
    for (const b of walls) {
      const d = distToRect(x, y, b.x, b.y, b.size) - (BUILDING_DEFS[b.type].gate ? 2 : 0) + (b.hp / BUILDING_DEFS[b.type].hp) * 2;
      if (d < bd) (bd = d), (best = b);
    }
    return best;
  }
}

/** Opponent for a slot, recreated on load from the saved difficulty. */
export function makeOpponent(w: World, player: number, difficulty: Difficulty): Opponent {
  const o = new Opponent(player, difficulty, w.map.seed);
  o.setup(w);
  return o;
}


