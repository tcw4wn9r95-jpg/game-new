import { markDone, nextChapter, showCampaigns } from './ui/campaignScreen';
import { SCENARIOS } from './sim/scenario';
import './sim/campaigns';
import { showSplash } from './ui/splash';
import { audio, installAudioUnlock } from './ui/audio';
import { GAME_MODES, type GameMode } from './sim/modes';
import { FACTION_IDS } from './sim/techs';
import './style.css';
import { Game, type MatchSetup } from './game';
import type { Difficulty } from './sim/ai/opponent';
import { attachGestures } from './input/gestures';
import { createView } from './render/canvas';
import type { MapOptions } from './sim/mapgen';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from './sim/terrain';
import { generateMap } from './sim/mapgen';
import { MenuBackdrop } from './ui/backdrop';
import { FpsCounter } from './ui/fps';
import { randomSeed, showSetup } from './ui/setup';
import { installTheme } from './ui/theme';
import { type SlotId, readSave, writeSave } from './ui/saves';
import { showSlots } from './ui/slotPanel';
import { installErrorLog, logError, setErrorContext, showErrorLog } from './ui/errorLog';
import { loadWorld } from './sim/save';
import type { World } from './sim/world';
import type { GameMap } from './sim/terrain';

/** Real time between autosaves. */
const AUTOSAVE_MS = 60_000;

function blockBrowserGestures(): void {
  // iOS Safari ignores user-scalable=no, so block pinch and double-tap zoom here.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

function lockLandscape(): void {
  // Supported on Android installs; iOS rejects it and relies on the rotate overlay.
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {});
}

function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }
}

/** Debug/test entry: ?map=islands&size=epic&players=4&seed=7&reveal=1&bench=1 skips the setup screen. */
function optionsFromUrl(params: URLSearchParams): MapOptions | null {
  const type = params.get('map') as MapType | null;
  if (!type || !MAP_TYPES.includes(type)) return null;
  const size = params.get('size') as MapSize | null;
  const players = Number(params.get('players'));
  return {
    type,
    size: size && MAP_SIZES.includes(size) ? size : 'standard',
    players: players >= 2 && players <= 4 ? players : 2,
    seed: Number(params.get('seed')) || randomSeed(),
  };
}

/** Factions for a new match: the human's choice (or a random one), the AIs at random. */
function pickFactions(players: number, mine: string): string[] {
  const any = () => FACTION_IDS[Math.floor(Math.random() * FACTION_IDS.length)];
  return Array.from({ length: players }, (_, i) => (i === 0 && (FACTION_IDS as string[]).includes(mine) ? mine : any()));
}

const TUTORIAL_SEED = 2401;

function boot(): void {
  installErrorLog();
  installAudioUnlock();
  installTheme();
  blockBrowserGestures();
  lockLandscape();
  registerServiceWorker();

  const params = new URLSearchParams(location.search);
  const debug = { reveal: params.has('reveal'), bench: params.has('bench'), fps: params.has('fps'), aiVsAi: params.has('aivsai') };
  const view = createView(document.getElementById('game') as HTMLCanvasElement);
  const hud = document.getElementById('hud')!;
  let game: Game | null = null;
  let backdrop: MenuBackdrop | null = null;
  let fps: FpsCounter | null = null;

  attachGestures(view.ctx.canvas, () => game?.camera ?? null, {
    onTap: (x, y) => game?.controller.tap(x, y),
    onDoubleTap: (x, y) => game?.controller.doubleTap(x, y),
    onBox: (x0, y0, x1, y1, done) => game?.controller.box(x0, y0, x1, y1, done),
    onDragStart: (x, y) => game?.controller.dragStart(x, y) ?? false,
    onDrag: (x, y) => game?.controller.drag(x, y),
    onDragEnd: () => game?.controller.dragEnd(),
  });

  const clearBackdrop = () => {
    backdrop?.dispose();
    backdrop = null;
  };
  const start = (source: GameMap | World, setup?: Partial<MatchSetup>) => {
    clearBackdrop();
    game = new Game(source, view, hud, debug, setup);
    game.hud.onNewMatch = toSetup;
    game.hud.onSave = () => showSlots(document.body, 'save', (slot) => void saveTo(slot), () => {});
    game.hud.onLoad = () => showSlots(document.body, 'load', (slot) => void loadFrom(slot), () => {});
    game.hud.onErrors = () => showErrorLog(document.body);
    setErrorContext(() => game?.world.time);
    // Automated browser tests drive the match through this handle.
    if (params.has('test')) Object.assign(window, { __game: game, __audio: audio });
    fps = new FpsCounter(hud.querySelector('#fps')!);
    hud.hidden = false;
  };
  function toSetup() {
    game?.destroy();
    game = null;
    hud.hidden = true;
    showSetup(document.body, {
      onPreview: (map) => {
        clearBackdrop();
        backdrop = new MenuBackdrop(view, map);
      },
      onStart: (_opts, map, s) =>
        start(map, { treaty: s.treaty, ai: map.starts.map((_, i) => (i === 0 ? null : s.difficulty)), mode: s.mode, factions: pickFactions(map.starts.length, s.faction) }),
      onLoad: (slot) => void loadFrom(slot),
      onTutorial: startTutorial,
      onCampaigns: () => openCampaigns(),
    });
  }

  /** The campaign screen (over the menu backdrop). */
  function openCampaigns(focus?: string) {
    game?.destroy();
    game = null;
    hud.hidden = true;
    showCampaigns(document.body, { onStart: startChapter, onBack: toSetup }, focus);
  }

  /** Plays a campaign chapter on its own map, with its own opponent. */
  function startChapter(id: string, variant: string) {
    const def = SCENARIOS.get(id);
    if (!def) return;
    document.querySelector('.setup')?.remove();
    game?.destroy();
    game = null;
    const map = generateMap({ type: def.map.type, size: def.map.size, players: 2, seed: def.map.seed });
    start(map, { ai: [null, def.enemy.kind === 'ai' ? def.enemy.difficulty : null], scenario: { id, variant } });
    hookChapter();
  }

  /** What happens when a chapter (new or loaded) ends. */
  function hookChapter() {
    const g = game as Game | null;
    const st = g?.world.scenario;
    if (!g || !st) return;
    g.onChapterEnd = (won) => {
      const def = SCENARIOS.get(st.id)!;
      if (won) markDone(st.id, g.world.time);
      const next = nextChapter(st.id);
      g.hud.chapterEnd(won, def.title, st.outcome ?? (won ? 'Victory' : 'Defeat'), g.world.time, {
        next: next ? () => startChapter(next, '') : undefined,
        retry: () => startChapter(st.id, st.variant),
        campaigns: () => openCampaigns(next ?? st.id),
      });
    };
  }

  /** The guided first match: a small, quiet map and an enemy who waits. */
  function startTutorial() {
    const map = generateMap({ type: 'heartland', size: 'skirmish', players: 2, seed: TUTORIAL_SEED });
    start(map, { ai: [null, null], tutorial: true, mode: 'standard', factions: ['highland', 'steppe'] });
    const g = game as Game | null;
    if (!g) return;
    g.onTutorialDone = (next) => {
      if (next === 'menu') return toSetup();
      // Straight into a real match against a Normal opponent.
      game?.destroy();
      game = null;
      const m = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: randomSeed() });
      start(m, { ai: [null, 'normal'], mode: 'standard', factions: pickFactions(2, 'random') });
    };
  }

  /** Saves the match to a slot; the autosave goes quietly. */
  async function saveTo(slot: SlotId): Promise<void> {
    const g = game;
    if (!g) return;
    try {
      const snap = g.snapshot();
      await writeSave(slot, snap.meta, snap.data);
      if (slot !== 'auto') g.hud.toast('Game saved');
    } catch (e) {
      console.error(e);
      logError(e);
      if (slot !== 'auto') g.hud.toast("Couldn't save: storage is unavailable or full");
    }
  }

  /** Replaces whatever is running with a saved match. */
  async function loadFrom(slot: SlotId): Promise<void> {
    try {
      const rec = await readSave(slot);
      if (!rec) return;
      const world = loadWorld(rec.data);
      document.querySelector('.setup')?.remove();
      game?.destroy();
      game = null;
      start(world, { ai: (rec.data.ai as Array<Difficulty | null> | undefined) ?? world.players.map((_, i) => (i === 0 ? null : 'normal')) });
      hookChapter();
      const g = game as Game | null;
      if (g) {
        if (rec.meta.camera) g.restoreCamera(rec.meta.camera);
        g.hud.toast('Game loaded');
      }
    } catch (e) {
      console.error(e);
      logError(e);
      (game as Game | null)?.hud.toast("Couldn't load that save");
    }
  }

  // Autosave every minute of play, and whenever the app goes to the background
  // (a phone may kill a backgrounded tab without warning).
  setInterval(() => {
    if (game && !game.hud.paused && !game.setup.tutorial) void saveTo('auto');
  }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && game && !game.setup.tutorial) void saveTo('auto');
  });
  window.addEventListener('pagehide', () => {
    if (game && !game.setup.tutorial) void saveTo('auto');
  });

  if (params.has('ships')) {
    void import('./ui/spriteSheet').then((m) => m.drawShipSheet(view, Number(params.get('ships')) || 1.6));
    return;
  }
  if (params.has('buildings')) {
    void import('./ui/spriteSheet').then((m) => m.drawBuildingSheet(view, Number(params.get('buildings')) || 48));
    return;
  }
  if (params.has('sheet')) {
    void import('./ui/spriteSheet').then((m) => m.drawSpriteSheet(view, Number(params.get('sheet')) || 3));
    return;
  }
  const fromUrl = optionsFromUrl(params);
  // ?noai: opponents stand idle (automated UI tests); ?ai=hard picks the difficulty.
  const urlAi = (params.get('ai') as Difficulty | null) ?? 'normal';
  // ?mode=regicide|domination and ?faction=highland|... for testing.
  const urlMode = GAME_MODES.includes(params.get('mode') as GameMode) ? (params.get('mode') as GameMode) : 'standard';
  if (fromUrl)
    start(generateMap(fromUrl), {
      ai: Array.from({ length: fromUrl.players }, (_, i) => (params.has('noai') || (i === 0 && !debug.aiVsAi) ? null : urlAi)),
      mode: urlMode,
      factions: pickFactions(fromUrl.players, params.get('faction') ?? 'random'),
    });
  else if (params.has('tutorial')) startTutorial();
  else {
    // The menu builds behind the title card; a tap reveals it.
    toSetup();
    if (!params.has('nosplash')) showSplash();
  }

  let last = performance.now();
  let reported = false;
  const frame = (now: number) => {
    // Schedule the next frame first: one bad frame must never stop the game.
    requestAnimationFrame(frame);
    // rAF timestamps can precede a performance.now() read taken just before, so clamp.
    const dt = Math.max(0, now - last);
    last = Math.max(last, now);
    try {
      if (game) {
        game.frame(now, dt);
        fps?.frame(now);
      } else if (backdrop) backdrop.frame(dt);
    } catch (e) {
      console.error(e);
      logError(e);
      if (!reported && game) {
        reported = true;
        game.hud.toast('Something went wrong; the game recovered. Menu → Error Log has the details.');
      }
    }
  };
  requestAnimationFrame(frame);
}

boot();
