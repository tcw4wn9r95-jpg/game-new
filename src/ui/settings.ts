// Player preferences kept on the device: game speed, sound and which hand the
// HUD is laid out for. Changes apply at once and are remembered.

const KEY = 'hc.settings';

export const SPEEDS = [1, 1.5, 2, 3] as const;
export const VOLUMES = [0, 0.35, 0.65, 1] as const;

export interface Settings {
  /** Game speed multiplier. */
  speed: number;
  /** Master volume, 0 (off) to 1. */
  volume: number;
  /** Minimap and side buttons on the left, commands on the right. */
  lefty: boolean;
  /** The tutorial has been offered (finished or skipped). */
  tutorialSeen: boolean;
}

const DEFAULTS: Settings = { speed: 1, volume: 0.65, lefty: false, tutorialSeen: false };

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      speed: (SPEEDS as readonly number[]).includes(s.speed as number) ? (s.speed as number) : DEFAULTS.speed,
      volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULTS.volume,
      lefty: !!s.lefty,
      tutorialSeen: !!s.tutorialSeen,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();
const listeners: Array<(s: Settings) => void> = [];

/** Changes some settings, saves them and tells whoever is listening. */
export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
  for (const f of listeners) f(settings);
}

export function onSettings(f: (s: Settings) => void): () => void {
  listeners.push(f);
  return () => listeners.splice(listeners.indexOf(f), 1);
}

export const speedLabel = (s: number) => `${s}×`;
const VOLUME_LABELS = ['Off', 'Low', 'Medium', 'High'];

/** The Settings panel (from the pause menu or the setup screen). */
export function showSettings(parent: HTMLElement, onClose: () => void = () => {}): void {
  const bg = document.createElement('div');
  bg.className = 'panel-backdrop settings-backdrop';
  bg.innerHTML = `
    <div class="panel frame settings-panel">
      <h2 class="panel-title">Settings</h2>
      <div class="setup-label">Game Speed</div>
      <div class="seg" data-row="speed"></div>
      <div class="setup-label">Sound</div>
      <div class="seg" data-row="volume"></div>
      <div class="setup-label">Controls</div>
      <div class="seg" data-row="hand"></div>
      <button class="btn btn-gold" data-a="close">Done</button>
    </div>`;
  const row = <T>(key: string, values: readonly T[], label: (v: T) => string, get: () => T, set: (v: T) => void) => {
    const c = bg.querySelector(`[data-row=${key}]`)!;
    for (const v of values) {
      const b = document.createElement('button');
      b.className = 'seg-btn';
      b.textContent = label(v);
      b.setAttribute('aria-pressed', String(get() === v));
      b.addEventListener('click', () => {
        set(v);
        c.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      c.appendChild(b);
    }
  };
  const nearestVolume = () => VOLUMES.reduce((a, b) => (Math.abs(b - settings.volume) < Math.abs(a - settings.volume) ? b : a));
  row('speed', SPEEDS, speedLabel, () => settings.speed, (v) => updateSettings({ speed: v }));
  row('volume', VOLUMES, (v) => VOLUME_LABELS[VOLUMES.indexOf(v)], nearestVolume, (v) => updateSettings({ volume: v }));
  row('hand', [false, true], (v) => (v ? 'Left-handed' : 'Right-handed'), () => settings.lefty, (v) => updateSettings({ lefty: v }));
  bg.querySelector('[data-a=close]')!.addEventListener('click', () => {
    bg.remove();
    onClose();
  });
  parent.appendChild(bg);
}
