import { PLAYER_COLORS } from '../render/palette';
import { generateMap, type MapOptions } from '../sim/mapgen';
import { type GameMap, MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from '../sim/terrain';
import { ICONS, MAP_ICONS } from './icons';
import { mapImage } from './mapImage';
import { type SlotId, listSaves } from './saves';
import { DIFFICULTIES, type Difficulty } from '../sim/ai/opponent';
import { showSlots } from './slotPanel';
import { emblemSvg, wordmarkHtml } from './logo';
import { settings as appSettings, showSettings, updateSettings } from './settings';
import { GAME_MODES, type GameMode, MODE_NAMES } from '../sim/modes';
import { FACTIONS, FACTION_IDS, type FactionId } from '../sim/techs';
import { UNIT_DEFS } from '../sim/entities';

const STORAGE_KEY = 'hc.setup';

const MAP_INFO: Record<MapType, { name: string; desc: string }> = {
  heartland: { name: 'Heartland', desc: 'Open farmland cut by a river. Hold the fords; wall the gaps.' },
  coastal: { name: 'Coastal', desc: 'A long shore on one flank. Rule the sea for fish and a second front.' },
  lakes: { name: 'Lakes', desc: 'A great lake at the heart of the realm. Docks are optional, but useful.' },
  islands: { name: 'Islands', desc: 'Every realm on its own isle. Only ships carry armies to war.' },
};
const SIZE_LABELS: Record<MapSize, string> = { skirmish: 'Skirmish', standard: 'Standard', epic: 'Epic' };
const AI_LABELS: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const TREATY_LABELS: Record<number, string> = { 0: 'Off', 10: '10m', 20: '20m', 30: '30m' };
const MODE_INFO: Record<GameMode, string> = {
  standard: 'Win by conquest, by a Wonder standing 8 minutes, or by holding every relic for 8 minutes.',
  regicide: 'Each realm starts with a King in a Castle. Slay theirs; keep yours alive.',
  domination: 'Hold the Banner Sites to score. First to the target, or holding every site for 3 minutes, wins.',
};

/** Opponent strength and Peace Treaty length (minutes, 0 for none). */
export interface MatchSettings {
  difficulty: Difficulty;
  treaty: number;
  mode: GameMode;
  /** The human's faction, or 'random'. */
  faction: string;
}
const PLAYER_LABELS: Record<number, string> = { 2: '1 vs 1', 3: '1 vs 2', 4: '2 vs 2' };

function loadPrefs(): Partial<MapOptions & MatchSettings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function savePrefs(o: MapOptions, m: MatchSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: o.type, size: o.size, players: o.players, difficulty: m.difficulty, treaty: m.treaty, mode: m.mode, faction: m.faction }));
  } catch {
    /* storage unavailable: preferences just don't persist */
  }
}

export const randomSeed = () => Math.floor(Math.random() * 1e6);

export interface SetupHooks {
  onPreview(map: GameMap): void;
  onStart(opts: MapOptions, map: GameMap, settings: MatchSettings): void;
  /** Resume a saved match (the setup screen has already gone). */
  onLoad(slot: SlotId): void;
  /** Start the guided first match (the setup screen has already gone). */
  onTutorial(): void;
  /** Open the campaigns (the setup screen has already gone). */
  onCampaigns(): void;
}

/** New-match screen with a live preview of the generated map. Removes itself on start. */
export function showSetup(root: HTMLElement, hooks: SetupHooks): void {
  const prefs = loadPrefs();
  const opts: MapOptions = {
    type: MAP_TYPES.includes(prefs.type as MapType) ? (prefs.type as MapType) : 'heartland',
    size: MAP_SIZES.includes(prefs.size as MapSize) ? (prefs.size as MapSize) : 'standard',
    players: [2, 3, 4].includes(prefs.players as number) ? (prefs.players as number) : 2,
    seed: randomSeed(),
  };
  const settings: MatchSettings = {
    difficulty: DIFFICULTIES.includes(prefs.difficulty as Difficulty) ? (prefs.difficulty as Difficulty) : 'normal',
    treaty: [0, 10, 20, 30].includes(prefs.treaty as number) ? (prefs.treaty as number) : 0,
    mode: GAME_MODES.includes(prefs.mode as GameMode) ? (prefs.mode as GameMode) : 'standard',
    faction: ['random', ...FACTION_IDS].includes(prefs.faction as string) ? (prefs.faction as string) : 'random',
  };

  const el = document.createElement('div');
  el.className = 'setup';
  el.innerHTML = `
    <div class="setup-main">
      <section class="setup-left frame">
        <header class="setup-title">${emblemSvg({ className: 'crest' })}<h1>${wordmarkHtml()}</h1></header>
        <div class="setup-label">Map</div>
        <div class="cards" data-row="type"></div>
        <div class="setup-pair">
          <div><div class="setup-label">Size</div><div class="seg" data-row="size"></div></div>
          <div><div class="setup-label">Players</div><div class="seg" data-row="players"></div></div>
        </div>
        <div class="setup-pair">
          <div><div class="setup-label">Opponent</div><div class="seg" data-row="difficulty"></div></div>
          <div><div class="setup-label">Peace Treaty</div><div class="seg" data-row="treaty"></div></div>
        </div>
        <div class="setup-pair">
          <div><div class="setup-label">Game Mode</div><select class="pick" data-pick="mode" aria-label="Game mode"></select></div>
          <div><div class="setup-label">Your Faction</div><select class="pick" data-pick="faction" aria-label="Your faction"></select></div>
        </div>
        <div class="setup-note" data-v="note"></div>
      </section>
      <section class="setup-right frame">
        <div class="preview-wrap"><canvas class="preview"></canvas></div>
        <div class="map-name"></div>
        <div class="map-desc"></div>
        <div class="seed-row"><span class="seed"></span><button class="icon-btn" aria-label="New map">${ICONS.dice}</button></div>
        <button class="btn btn-gold start">Start Match</button>
        <div class="menu-grid">
          <button class="btn btn-wood btn-small campaigns-btn">Campaigns</button>
          <button class="btn btn-wood btn-small continue" hidden>Continue</button>
          <button class="btn btn-wood btn-small load" hidden>Load</button>
          <button class="btn btn-wood btn-small tutorial">Tutorial</button>
          <button class="btn btn-wood btn-small settings-btn" aria-label="Settings"><span class="btn-icon">${ICONS.gear}</span>Settings</button>
        </div>
      </section>
    </div>
    <div class="setup-build">build ${__BUILD_ID__}</div>`;

  const preview = el.querySelector<HTMLCanvasElement>('.preview')!;
  let map: GameMap | null = null;
  let pending = 0;

  const refresh = () => {
    cancelAnimationFrame(pending);
    // Defer a frame so the button state paints before generation runs.
    pending = requestAnimationFrame(() => {
      map = generateMap(opts);
      drawPreview(preview, map);
      el.querySelector('.map-name')!.textContent = `${MAP_INFO[opts.type].name} · ${SIZE_LABELS[opts.size]}`;
      el.querySelector('.map-desc')!.textContent = MAP_INFO[opts.type].desc;
      el.querySelector('.seed')!.textContent = `Seed ${opts.seed}`;
      hooks.onPreview(map);
    });
  };

  const group = <T extends string | number>(row: string, values: T[], render: (v: T) => string, get: () => T, set: (v: T) => void, regenerate = true) => {
    const container = el.querySelector(`[data-row=${row}]`)!;
    for (const v of values) {
      const b = document.createElement('button');
      b.className = row === 'type' ? 'card' : 'seg-btn';
      b.innerHTML = render(v);
      b.setAttribute('aria-pressed', String(get() === v));
      b.addEventListener('click', () => {
        if (get() === v) return;
        set(v);
        container.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (regenerate) refresh();
      });
      container.appendChild(b);
    }
  };

  group('type', MAP_TYPES, (t) => `<span class="card-art">${MAP_ICONS[t]}</span><span class="card-name">${MAP_INFO[t].name}</span>`, () => opts.type, (v) => (opts.type = v));
  group('size', MAP_SIZES, (s) => SIZE_LABELS[s], () => opts.size, (v) => (opts.size = v));
  group('players', [2, 3, 4], (p) => PLAYER_LABELS[p], () => opts.players, (v) => (opts.players = v));
  // The note explains whatever was last chosen.
  let topic: 'difficulty' | 'mode' | 'faction' = 'mode';
  const note = () => {
    const f = FACTIONS[settings.faction as FactionId];
    el.querySelector('[data-v=note]')!.textContent =
      topic === 'difficulty'
        ? settings.difficulty === 'hard'
          ? 'Hard AI gathers 10% faster.'
          : settings.difficulty === 'easy'
            ? 'Easy AI never attacks before minute 15.'
            : 'Normal AI plays a different style each match.'
        : topic === 'faction'
          ? f
            ? `${f.name}: ${f.bonuses.join('; ')}. Unique: ${UNIT_DEFS[f.unique].name}.`
            : 'A faction picked at random when the match starts.'
          : MODE_INFO[settings.mode];
  };
  const pick = (t: typeof topic) => () => ((topic = t), note());
  group('difficulty', DIFFICULTIES, (d) => AI_LABELS[d], () => settings.difficulty, (v) => ((settings.difficulty = v), pick('difficulty')()), false);
  group('treaty', [0, 10, 20, 30], (t) => TREATY_LABELS[t], () => settings.treaty, (v) => (settings.treaty = v), false);
  // Mode and faction: dropdowns (the phone's own picker), to keep the screen short.
  const choice = <T extends string>(key: string, values: T[], render: (v: T) => string, get: () => T, set: (v: T) => void) => {
    const sel = el.querySelector<HTMLSelectElement>(`[data-pick=${key}]`)!;
    for (const v of values) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = render(v);
      sel.appendChild(o);
    }
    sel.value = get();
    sel.addEventListener('change', () => set(sel.value as T));
  };
  choice('mode', GAME_MODES, (m) => MODE_NAMES[m], () => settings.mode, (v) => ((settings.mode = v), pick('mode')()));
  choice('faction', ['random', ...FACTION_IDS], (f) => (f === 'random' ? 'Random' : FACTIONS[f as FactionId].name), () => settings.faction, (v) => ((settings.faction = v), pick('faction')()));
  note();

  el.querySelector('.icon-btn')!.addEventListener('click', () => {
    opts.seed = randomSeed();
    refresh();
  });
  el.querySelector('.start')!.addEventListener('click', () => {
    if (!map) return;
    savePrefs(opts, settings);
    cancelAnimationFrame(pending);
    el.remove();
    hooks.onStart(opts, map, settings);
  });

  // Saved games: Continue picks up the autosave; Load lists every slot.
  const leave = (slot: SlotId) => {
    cancelAnimationFrame(pending);
    el.remove();
    hooks.onLoad(slot);
  };
  el.querySelector('.continue')!.addEventListener('click', () => leave('auto'));
  el.querySelector('.tutorial')!.addEventListener('click', () => {
    cancelAnimationFrame(pending);
    el.remove();
    updateSettings({ tutorialSeen: true });
    hooks.onTutorial();
  });
  el.querySelector('.settings-btn')!.addEventListener('click', () => showSettings(document.body));
  el.querySelector('.campaigns-btn')!.addEventListener('click', () => {
    cancelAnimationFrame(pending);
    el.remove();
    hooks.onCampaigns();
  });
  // First time here: point at the tutorial.
  if (!appSettings.tutorialSeen) {
    el.querySelector('.tutorial')!.classList.add('tut-glow');
    el.querySelector('[data-v=note]')!.textContent = 'New to Hearth & Crown? Try the Tutorial first: about ten minutes.';
  }
  el.querySelector('.load')!.addEventListener('click', () => showSlots(document.body, 'load', leave, () => {}));
  void listSaves().then((saves) => {
    if (!Object.values(saves).some(Boolean)) return;
    el.querySelector<HTMLElement>('.load')!.hidden = false;
    el.querySelector<HTMLElement>('.continue')!.hidden = !saves.auto;
  });

  root.appendChild(el);
  refresh();
}

function drawPreview(canvas: HTMLCanvasElement, map: GameMap): void {
  const css = canvas.clientWidth || 150;
  const px = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(mapImage(map), 0, 0, px, px);
  const k = px / map.size;
  map.starts.forEach((s, i) => {
    g.fillStyle = PLAYER_COLORS[i];
    g.strokeStyle = '#fff6dc';
    g.lineWidth = Math.max(1.5, px / 90);
    g.beginPath();
    g.arc((s.x + 0.5) * k, (s.y + 0.5) * k, Math.max(4, px / 26), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });
}
