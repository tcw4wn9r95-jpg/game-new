import { Controller } from './input/controller';
import type { View } from './render/canvas';
import { Camera, ZOOM_LEVELS } from './render/camera';
import { type Effect, type Overlay, Renderer } from './render/renderer';
import type { GameMap } from './sim/terrain';
import { TICK_MS, World } from './sim/world';
import { Bench } from './ui/bench';
import { AGES, TECH_DEFS, buildingMaxHp } from './sim/techs';
import { VICTORY_TEXT, kingOf } from './sim/modes';
import { canShelter, shelterRoom } from './sim/fortify';
import { BUILDING_DEFS, type Building, UNIT_DEFS } from './sim/entities';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { CommandCenter } from './ui/commandCenter';
import { type SaveData, saveWorld } from './sim/save';
import { type Difficulty, type Opponent, makeOpponent } from './sim/ai/opponent';
import type { GameMode } from './sim/modes';

const PLAYER_NAMES = ['Blue', 'Red', 'Gold', 'Green'];
import type { SaveMeta } from './ui/saves';
import { settings } from './ui/settings';
import { Tutorial } from './ui/tutorial';
import { ObjectivesCard } from './ui/objectives';
import './sim/campaigns';
import { SCENARIOS } from './sim/scenario';
import { type Sfx, audio } from './ui/audio';
import type { SimEvent } from './sim/world';

const MAP_NAMES = { heartland: 'Heartland', coastal: 'Coastal', lakes: 'Lakes', islands: 'Islands' } as const;

/** Longest frame gap we catch up on; anything longer (app backgrounded) is dropped. */
const MAX_FRAME_MS = 250;
const RES_COLORS = { food: '#ffb08a', wood: '#e9c08a', gold: '#ffe066', stone: '#e4e4dc' } as const;

export interface DebugFlags {
  reveal: boolean;
  bench: boolean;
  fps: boolean;
  /** Player 0 is an AI too (watch two AIs play). */
  aiVsAi?: boolean;
}

/** Who plays each slot: an AI difficulty, or null for the human. */
export interface MatchSetup {
  ai: Array<Difficulty | null>;
  /** Peace Treaty, minutes (new matches only). */
  treaty: number;
  /** New matches only: game mode and each slot's faction. */
  mode?: GameMode;
  factions?: string[];
  /** The guided first match. */
  tutorial?: boolean;
  /** A campaign chapter (new matches; a loaded one carries it in the world). */
  scenario?: { id: string; variant: string };
}

/** One match: owns the world, camera, renderer, input controller and HUD. */
export class Game {
  readonly world: World;
  readonly camera: Camera;
  readonly hud: Hud;
  readonly controller: Controller;
  private readonly renderer: Renderer;
  private readonly minimap: Minimap;
  private readonly panel: CommandCenter;
  private readonly bench: Bench | null;
  private acc = 0;
  /** The human player's slot. */
  readonly player = 0;

  /** Starts a new match on a map, or resumes a loaded world. */
  readonly setup: MatchSetup;
  private readonly bots: Opponent[] = [];

  constructor(source: GameMap | World, private readonly view: View, hudRoot: HTMLElement, debug: DebugFlags, setup?: Partial<MatchSetup>) {
    const fresh = !(source instanceof World);
    const chapter = setup?.scenario ? SCENARIOS.get(setup.scenario.id) : undefined;
    this.world =
      source instanceof World
        ? source
        : chapter
          ? new World(source, { mode: chapter.mode, factions: chapter.factions, scenario: { def: chapter, variant: setup!.scenario!.variant } })
          : new World(source, { mode: setup?.mode, factions: setup?.factions });
    const map = this.world.map;
    this.setup = { ai: setup?.ai ?? map.starts.map((_, i) => (i === 0 && !debug.aiVsAi ? null : 'normal')), treaty: setup?.treaty ?? 0, tutorial: setup?.tutorial };
    if (fresh && this.setup.treaty) this.world.peaceUntil = this.setup.treaty * 60;
    this.setup.ai.forEach((d, i) => {
      if (d) this.bots.push(makeOpponent(this.world, i, d));
    });
    const fog = this.world.fog[this.player];
    if (debug.reveal || debug.bench) fog.revealAll();

    this.camera = new Camera(map.size);
    this.camera.setView(view.width, view.height);
    const start = map.starts[this.player];
    // Open zoomed out so the explored surroundings (coast, lake, river) are in view.
    this.camera.level = 0;
    this.camera.scale = ZOOM_LEVELS[0];
    this.camera.centerOn(start.x + 0.5, start.y + 1.5);

    this.hud = new Hud(hudRoot);
    hudRoot.querySelector<HTMLElement>('#fps')!.hidden = !(debug.fps || debug.bench);
    this.renderer = new Renderer(view, this.world, fog, this.player);
    this.minimap = new Minimap(this.hud.minimapSlot, this.world, fog, this.camera, this.player);
    this.controller = new Controller({
      world: this.world,
      camera: this.camera,
      player: this.player,
      addEffect: (e) => this.addEffect(e),
      hitBuilding: (b, x, y) => this.renderer.hitBuilding(b, x, y),
    });
    this.panel = new CommandCenter(hudRoot, this.controller, this.world, this.player);
    this.hud.onIdleVillager = () => this.controller.nextIdleVillager();
    this.hud.onIdleMilitary = () => this.controller.nextIdleMilitary();
    this.hud.onAllMilitary = () => this.controller.selectAllMilitary();
    this.hud.onKing = () => this.findKing(false);
    this.hud.onKingShelter = () => this.findKing(true);
    this.bench = debug.bench ? new Bench(this.camera, map.size, hudRoot.querySelector('#bench')!) : null;
    if (this.world.scenario) this.objectives = new ObjectivesCard(hudRoot, this.world);
    if (this.setup.tutorial) {
      this.tutorial = new Tutorial({
        world: this.world,
        controller: this.controller,
        camera: this.camera,
        player: this.player,
        hudRoot,
        ring: (x, y) => this.addEffect({ kind: 'ring', x, y, color: '#ffd76a' }),
        ping: (x, y) => this.minimap.ping(x, y, performance.now()),
        onFinish: (next) => this.onTutorialDone(next),
      });
      if (fresh) this.tutorial.setup();
    }
  }

  readonly tutorial: Tutorial | null = null;
  private readonly objectives: ObjectivesCard | null = null;
  /** Set by the app: a campaign chapter ended (won or lost). */
  onChapterEnd: (won: boolean) => void = () => {};
  /** Set by the app: the tutorial was finished or skipped. */
  onTutorialDone: (next: 'menu' | 'match') => void = () => {};

  /** Regicide: centre on the King and select him; with `shelter`, send him into the nearest Castle or tower. */
  private findKing(shelter: boolean): void {
    const w = this.world;
    const king = kingOf(w, this.player);
    if (!king) return;
    const home = king.inside ? w.building(king.inside) : undefined;
    const at = home ? { x: home.x + home.size / 2, y: home.y + home.size / 2 } : king;
    this.camera.centerOn(at.x, at.y);
    if (home) {
      this.controller.select([home.id]);
      return;
    }
    this.controller.select([king.id]);
    if (!shelter) return;
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of w.buildings(this.player)) {
      if (!canShelter(b, king) || shelterRoom(b) <= 0) continue;
      const d = Math.hypot(b.x + b.size / 2 - king.x, b.y + b.size / 2 - king.y);
      if (d < bd) (bd = d), (best = b);
    }
    if (best) w.issue(this.player, { type: 'garrison', ids: [king.id], id: best.id });
    else this.hud.toast('No Castle or tower to shelter in');
  }

  /** Seconds-clock of the last attack alert, and where, so alerts don't spam. */
  private lastKingAlert = -100;
  private lastAlert = -100;
  private alertAt: { x: number; y: number } | null = null;
  private deaths = 0;

  /** Toasts an alert (at most every 12 s unless forced); tapping it jumps the camera there. */
  private alert(message: string, x: number, y: number, now: number, force = false, sound: Sfx = 'alertTown'): void {
    if (!force && now - this.lastAlert < 12) return;
    this.lastAlert = now;
    audio.play(sound);
    this.alertAt = { x, y };
    this.hud.toast(message, () => {
      if (this.alertAt) this.camera.centerOn(this.alertAt.x, this.alertAt.y);
    });
    this.minimap.ping(x, y, now);
  }

  /** How loud something at (x, y) sounds: full on screen, fading out a screen away; silent in the fog. */
  private heard(x: number, y: number): number {
    if (!this.world.fog[this.player]?.isVisible(x, y)) return 0;
    const p = this.camera.tileToScreen(x, y);
    const W = this.camera.viewW, H = this.camera.viewH;
    const d = Math.hypot(Math.max(0, -p.x, p.x - W) / W, Math.max(0, -p.y, p.y - H) / H);
    return Math.max(0, 1 - d * 1.6);
  }

  /** Sounds of battle and building wherever the camera is. */
  private battleSound(ev: SimEvent): void {
    if (ev.type === 'hit') {
      const def = ev.src ? UNIT_DEFS[ev.src] : undefined;
      // Engines that hurl stones are heard as their blast lands.
      if (def?.splash && def.classes.includes('siege')) return;
      const sound: Sfx = !def ? 'arrow' : def.classes.includes('siege') ? 'boom' : def.attackType === 'pierce' ? 'arrow' : 'clash';
      audio.play(sound, this.heard(ev.x, ev.y) * (sound === 'boom' ? 0.6 : 0.8));
    } else if (ev.type === 'blast') audio.play('boom', this.heard(ev.x, ev.y));
    else if (ev.type === 'death') audio.play('death', this.heard(ev.x, ev.y));
    else if (ev.type === 'destroyed') audio.play('collapse', this.heard(ev.x + ev.size / 2, ev.y + ev.size / 2));
  }

  private addEffect(e: Omit<Effect, 'born'>): void {
    this.renderer.effects.push({ ...e, born: performance.now() / 1000 });
  }

  frame(_frameTime: number, dtMs: number): void {
    // Everything in a frame (effects, corpses, pings, animation) runs off one clock.
    const now = performance.now();
    const dtClamped = Math.min(dtMs, MAX_FRAME_MS);
    if (!this.hud.paused) {
      this.acc += dtClamped * settings.speed;
      while (this.acc >= TICK_MS) {
        for (const b of this.bots) b.tick(this.world);
        this.world.step();
        this.acc -= TICK_MS;
      }
    }
    const nowS = now / 1000;
    for (const ev of this.world.drainEvents()) {
      this.battleSound(ev);
      // Battle aftermath is drawn for every side.
      if (ev.type === 'blast') {
        this.addEffect({ kind: 'blast', x: ev.x, y: ev.y, color: '', size: ev.size });
        continue;
      }
      if (ev.type === 'death') this.renderer.addDeath(ev, this.deaths++, nowS);
      else if (ev.type === 'destroyed') this.renderer.addRuin(ev, nowS);
      if (ev.type === 'converted' && ev.from === this.player) this.alert('A unit was converted by an enemy monk!', ev.x, ev.y, nowS, true, 'convert');
      if (ev.type === 'victory' && this.world.scenario) {
        const won = ev.team === this.world.players[this.player].team;
        audio.play(won ? 'victory' : 'defeat');
        this.onChapterEnd(won);
        continue;
      }
      if (ev.type === 'scenario') {
        if (ev.alarm) this.alert(ev.text, ev.x ?? 0, ev.y ?? 0, nowS, true, 'alertTown');
        else {
          this.hud.story(ev.text);
          audio.play('step');
        }
        continue;
      }
      if (ev.type === 'victory') {
        const won = ev.team === this.world.players[this.player].team;
        audio.play(won ? 'victory' : 'defeat');
        const how = VICTORY_TEXT[ev.reason] ?? '';
        this.hud.endScreen(won, this.world.time, `${won ? 'Your side won' : 'The enemy won'} ${how}.`);
        continue;
      }
      if (ev.type === 'defeated' && ev.owner !== this.player) {
        const ally = !this.world.isEnemy(this.player, ev.owner);
        const how = this.world.mode === 'regicide' && !kingOf(this.world, ev.owner) ? "'s King has fallen" : ' has been defeated';
        this.hud.toast(`${ally ? 'Your ally' : 'An enemy'} (${PLAYER_NAMES[ev.owner] ?? 'player'})${how}`);
        continue;
      }
      if (ev.type === 'mode') {
        const ours = !this.world.isEnemy(this.player, ev.owner);
        const msg =
          ev.message === 'Site captured'
            ? ours ? 'A Banner Site is ours' : 'The enemy has taken a Banner Site!'
            : ev.message === 'Wonder finished'
              ? ours ? 'Our Wonder stands! Hold it for 8 minutes.' : 'The enemy has finished a Wonder! Destroy it within 8 minutes.'
              : ours ? 'A relic is safe in our Monastery' : 'The enemy has secured a relic';
        this.alert(msg, ev.x, ev.y, nowS, true, 'bell');
        continue;
      }
      if (ev.type === 'hit' && ev.owner === this.player && this.world.mode === 'regicide' && ev.by !== this.player && nowS - this.lastKingAlert > 10) {
        const t = this.world.get(ev.id);
        const king = kingOf(this.world, this.player);
        const holder = t?.kind === 'building' && king?.inside === t.id;
        if ((t?.kind === 'unit' && t.type === 'king') || (holder && t.hp < buildingMaxHp(this.world, t) * 0.5)) {
          this.lastKingAlert = nowS;
          this.alert(holder ? "The King's stronghold is failing!" : 'Your King is under attack!', ev.x, ev.y, nowS, true, 'alertKing');
          continue;
        }
      }
      if (ev.owner !== this.player) continue;
      if (ev.type === 'bell') {
        audio.play(ev.on ? 'alertWall' : 'bell');
        this.hud.toast(ev.on ? 'The town bell rings: villagers take shelter!' : 'All clear: villagers back to work');
        continue;
      }
      if (ev.type === 'hit' && ev.by !== this.player && ev.by >= 0) {
        // Distinct horns: the town, the walls, the fleet.
        const t = this.world.get(ev.id);
        const wall = t?.kind === 'building' && !!BUILDING_DEFS[t.type].wall;
        const ship = (t?.kind === 'unit' && !!UNIT_DEFS[t.type].naval) || (t?.kind === 'building' && (t.type === 'dock' || t.type === 'fish_trap'));
        const msg = wall ? 'Your walls are under attack!' : ship ? 'Your ships are under attack!' : ev.building ? 'Your town is under attack!' : 'Your units are under attack!';
        this.alert(msg, ev.x, ev.y, nowS, false, wall ? 'alertWall' : ship ? 'alertShip' : 'alertTown');
        continue;
      }
      if (ev.type === 'built') audio.play('built');
      if (ev.type === 'trained') audio.play('trained', 0.8);
      if (ev.type === 'researched') {
        const t = TECH_DEFS[ev.tech];
        const age = t.effects.find((e) => e.type === 'age');
        if (age) this.hud.announce(`${AGES[age.age].name} Age`, 'New buildings, units and technologies are available.');
        else this.hud.toast(`${t.name} researched`);
        audio.play(age ? 'ageUp' : 'researched');
        continue;
      }
      if (ev.type === 'dropoff') this.addEffect({ kind: 'text', x: ev.x, y: ev.y, text: `+${ev.amount}`, color: RES_COLORS[ev.res] });
      else if (ev.type === 'error') {
        this.hud.toast(ev.message);
        audio.play('error');
      }
    }
    const dt = dtClamped / 1000;
    this.bench?.update(dt);
    this.camera.setView(this.view.width, this.view.height);
    this.camera.update(dt);
    const c = this.controller;
    let ghost: Overlay['ghost'] = null;
    if (c.placing) {
      const p = c.placing;
      ghost = { type: p.type, x: p.x, y: p.y, valid: c.placementValid() };
      if (p.wall) {
        const gateType = p.wall.kind === 'stone' ? 'gate' : 'palisade_gate';
        ghost.wall = c.wallPlan().map((t) => ({ ...t, valid: this.world.canPlace(t.gate ? gateType : p.type, this.player, t.x, t.y) }));
      }
    }
    this.renderer.draw(this.camera, this.hud.paused ? 1 : this.acc / TICK_MS, now / 1000, { selection: c.selection, ghost });
    this.minimap.draw(now);
    this.hud.update(this.world, this.player, c.idleVillagers().length, c.idleMilitary().length);
    this.panel.update();
    this.tutorial?.update(nowS);
    this.objectives?.update(nowS);
  }

  /** A save of the match: the world, and a summary for the slot list. */
  snapshot(): { meta: SaveMeta; data: SaveData } {
    const m = this.world.map;
    return {
      meta: {
        title: this.world.scenario
          ? `Campaign · ${SCENARIOS.get(this.world.scenario.id)?.title ?? ''}`
          : `${MAP_NAMES[m.type]} · ${m.sizeName[0].toUpperCase()}${m.sizeName.slice(1)}`,
        time: this.world.time,
        age: this.world.players[this.player].age,
        savedAt: Date.now(),
        camera: { x: this.camera.x, y: this.camera.y, level: this.camera.level },
      },
      data: { ...saveWorld(this.world), ai: this.setup.ai },
    };
  }

  /** Runs the simulation (and the AIs) ahead without drawing: tests and spectating. */
  advance(ticks: number): void {
    for (let k = 0; k < ticks && this.world.winner === null; k++) {
      for (const b of this.bots) b.tick(this.world);
      this.world.step();
    }
  }

  /** Puts the camera back where it was when the match was saved. */
  restoreCamera(c: { x: number; y: number; level: number }): void {
    this.camera.level = c.level;
    this.camera.scale = ZOOM_LEVELS[c.level] ?? ZOOM_LEVELS[0];
    this.camera.centerOn(c.x, c.y);
  }

  destroy(): void {
    this.tutorial?.destroy();
    this.objectives?.destroy();
    this.minimap.destroy();
    this.renderer.dispose();
    this.controller.destroy();
    this.panel.destroy();
    this.hud.destroy();
  }
}
