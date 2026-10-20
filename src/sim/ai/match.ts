// Headless AI-vs-AI matches, for tests and tuning: runs a seeded match to the
// end (or a time limit) and reports the result, its length and any stall.
import { generateMap } from '../mapgen';
import type { MapSize, MapType } from '../terrain';
import { TICK_RATE, World } from '../world';
import { type Difficulty, Opponent } from './opponent';
import type { GameMode } from '../modes';
import { FACTION_IDS } from '../techs';

export interface MatchResult {
  /** Winning slot's team, or null if time ran out. */
  winner: number | null;
  reason: string | null;
  minutes: number;
  /** Longest stretch (seconds) in which neither side gathered or fought. */
  longestStall: number;
  /** Per-player summary at the end. */
  players: Array<{ age: number; villagers: number; army: number; buildings: number; gathered: number; defeated: boolean }>;
  /** A line per few minutes, for tuning. */
  log: string[];
  notes: string[];
}

export function runMatch(opts: { type: MapType; size: MapSize; seed: number; ai: Difficulty[]; maxMinutes: number; logEvery?: number; mode?: GameMode; factions?: string[] }): MatchResult {
  const map = generateMap({ type: opts.type, size: opts.size, players: opts.ai.length, seed: opts.seed });
  // Factions default to a seeded draw so batches cover them all.
  const factions = opts.factions ?? opts.ai.map((_, i) => FACTION_IDS[(opts.seed * 7 + i * 3) % FACTION_IDS.length]);
  const w = new World(map, { mode: opts.mode, factions });
  const bots = opts.ai.map((d, i) => {
    const o = new Opponent(i, d, opts.seed);
    o.setup(w);
    return o;
  });
  const log: string[] = [];
  let lastActive = 0, longestStall = 0;
  let lastGathered = 0;
  const end = opts.maxMinutes * 60 * TICK_RATE;
  for (let t = 0; t < end && w.winner === null; t++) {
    for (const b of bots) b.tick(w);
    w.step();
    let active = false;
    for (const e of w.drainEvents()) if (e.type === 'hit') active = true;
    if (t % TICK_RATE === 0) {
      const g = w.players.reduce((s, p) => s + p.gathered.food + p.gathered.wood + p.gathered.gold + p.gathered.stone, 0);
      if (g > lastGathered) active = true;
      lastGathered = g;
    }
    if (active) lastActive = w.time;
    longestStall = Math.max(longestStall, w.time - lastActive);
    if (opts.logEvery && t % (opts.logEvery * 60 * TICK_RATE) === 0) log.push(summary(w));
  }
  log.push(summary(w));
  log.push(`  styles: ${bots.map((b) => b.style).join(' vs ')}`);
  log.push(`  factions: ${factions.join(' vs ')}${w.mode === 'domination' ? ` score ${w.modeState.score.map(Math.floor).join('-')}` : ''}`);
  if (w.winner === null)
    w.players.forEach((_, i) => {
      const bl: Record<string, number> = {};
      for (const b of w.buildings(i)) if (!b.type.includes('wall') && !b.type.includes('gate')) bl[b.type] = (bl[b.type] ?? 0) + 1;
      const ul: Record<string, number> = {};
      for (const u of w.units(i)) ul[u.type + (u.inside ? '(in)' : '')] = (ul[u.type + (u.inside ? '(in)' : '')] ?? 0) + 1;
      log.push(`  P${i} left: ${JSON.stringify(bl)} ${JSON.stringify(ul)}`);
    });
  return {
    winner: w.winner,
    reason: w.victoryReason,
    minutes: w.time / 60,
    longestStall,
    players: w.players.map((p, i) => ({
      age: p.age,
      villagers: [...w.units(i)].filter((u) => u.type === 'villager').length,
      army: [...w.units(i)].filter((u) => u.type !== 'villager' && u.type !== 'fishing_ship').length,
      buildings: [...w.buildings(i)].length,
      gathered: Math.round(p.gathered.food + p.gathered.wood + p.gathered.gold + p.gathered.stone),
      defeated: p.defeated,
    })),
    log,
    notes: bots.flatMap((b, i) => b.notes.map((n) => `P${i} ${n}`)),
  };
}

function summary(w: World): string {
  const m = (w.time / 60).toFixed(0).padStart(3);
  return `${m}m ` + w.players.map((p, i) => {
    const units = [...w.units(i)];
    const vil = units.filter((u) => u.type === 'villager').length;
    const army = units.length - vil;
    const blds = [...w.buildings(i)];
    const walls = blds.filter((b) => b.type.includes('wall') || b.type.includes('gate')).length;
    return `P${i}[A${p.age + 1} v${vil} a${army} b${blds.length - walls} w${walls} f${Math.round(p.resources.food)} W${Math.round(p.resources.wood)} g${Math.round(p.resources.gold)} s${Math.round(p.resources.stone)}${p.defeated ? ' X' : ''}]`;
  }).join(' ');
}
