// Synthesized sound effects (Web Audio): nothing is loaded, every sound is
// built from oscillators and filtered noise when it plays. iOS only lets audio
// start inside a touch, so the context is created and resumed on the first tap.
import { onSettings, settings } from './settings';

export type Sfx =
  | 'click'
  | 'select'
  | 'selectSoldier'
  | 'order'
  | 'attackOrder'
  | 'error'
  | 'built'
  | 'trained'
  | 'researched'
  | 'ageUp'
  | 'clash'
  | 'arrow'
  | 'boom'
  | 'collapse'
  | 'death'
  | 'alertTown'
  | 'alertWall'
  | 'alertShip'
  | 'alertKing'
  | 'convert'
  | 'bell'
  | 'victory'
  | 'defeat'
  | 'step';

/** Shortest gap between two plays of the same sound (seconds), so battles don't drone. */
const MIN_GAP: Partial<Record<Sfx, number>> = { clash: 0.09, arrow: 0.08, boom: 0.25, death: 0.15, select: 0.05, selectSoldier: 0.05, collapse: 0.4 };

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<Sfx, number>();

  constructor() {
    onSettings((s) => {
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(s.volume, this.ctx.currentTime, 0.02);
    });
  }

  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** Call from a user gesture: creates or resumes the audio context. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.volume;
      // A gentle limiter so a big battle never clips.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        d[i] = (seed / 4294967296) * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Plays a sound; `gain` scales it (distance from the camera, say). */
  play(name: Sfx, gain = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || settings.volume <= 0 || gain <= 0.02 || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.05;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const out = ctx.createGain();
    out.gain.value = Math.min(1, gain);
    out.connect(this.master);
    SOUNDS[name](this, ctx, out, now);
    // Let the graph go once the sound is over.
    setTimeout(() => out.disconnect(), 4000);
  }

  // ---------- building blocks ----------

  tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; attack?: number; filter?: number } = {}): void {
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3, a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(ctx: AudioContext, out: AudioNode, t: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; vol?: number; to?: number; attack?: number } = {}): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3, a = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** A few notes in a row: [freq, start offset, length]. */
  notes(ctx: AudioContext, out: AudioNode, t: number, seq: Array<[number, number, number]>, opts: { type?: OscillatorType; vol?: number; filter?: number; attack?: number } = {}): void {
    for (const [f, at, len] of seq) this.tone(ctx, out, t + at, f, len, opts);
  }
}

type Maker = (a: AudioEngine, ctx: AudioContext, out: AudioNode, t: number) => void;

// Note frequencies.
const C4 = 261.6, D4 = 293.7, E4 = 329.6, F4 = 349.2, G4 = 392, A4 = 440, B4 = 493.9, C5 = 523.3, E5 = 659.3, G5 = 784, C6 = 1046.5;

const SOUNDS: Record<Sfx, Maker> = {
  click: (a, c, o, t) => a.tone(c, o, t, 1400, 0.04, { type: 'triangle', vol: 0.12 }),
  select: (a, c, o, t) => a.tone(c, o, t, 880, 0.09, { type: 'triangle', vol: 0.16, to: 1200 }),
  selectSoldier: (a, c, o, t) => {
    a.tone(c, o, t, 330, 0.12, { type: 'square', vol: 0.06, filter: 1400 });
    a.hiss(c, o, t, 0.06, { freq: 5000, q: 3, vol: 0.05 });
  },
  order: (a, c, o, t) => a.notes(c, o, t, [[660, 0, 0.06], [880, 0.06, 0.09]], { type: 'triangle', vol: 0.14 }),
  attackOrder: (a, c, o, t) => {
    a.notes(c, o, t, [[392, 0, 0.07], [523, 0.07, 0.12]], { type: 'sawtooth', vol: 0.08, filter: 1800 });
    a.hiss(c, o, t + 0.05, 0.08, { freq: 4500, q: 4, vol: 0.06 });
  },
  error: (a, c, o, t) => a.notes(c, o, t, [[180, 0, 0.1], [140, 0.11, 0.16]], { type: 'square', vol: 0.07, filter: 900 }),
  built: (a, c, o, t) => {
    // Two knocks of the hammer, then a bright chime.
    for (const k of [0, 0.12]) {
      a.tone(c, o, t + k, 180, 0.08, { type: 'triangle', vol: 0.25, to: 90 });
      a.hiss(c, o, t + k, 0.05, { freq: 1800, q: 2, vol: 0.12 });
    }
    a.notes(c, o, t + 0.28, [[E5, 0, 0.35], [G5, 0.08, 0.4], [C6, 0.16, 0.5]], { type: 'sine', vol: 0.12 });
  },
  trained: (a, c, o, t) => a.notes(c, o, t, [[G4, 0, 0.12], [C5, 0.1, 0.22]], { type: 'triangle', vol: 0.14 }),
  researched: (a, c, o, t) => a.notes(c, o, t, [[C5, 0, 0.2], [E5, 0.09, 0.25], [G5, 0.18, 0.4]], { type: 'sine', vol: 0.14 }),
  ageUp: (a, c, o, t) => {
    // A short brass fanfare.
    const seq: Array<[number, number, number]> = [[G4, 0, 0.18], [C5, 0.18, 0.18], [E5, 0.36, 0.18], [G5, 0.54, 0.7]];
    a.notes(c, o, t, seq, { type: 'sawtooth', vol: 0.11, filter: 2200, attack: 0.03 });
    a.notes(c, o, t, seq.map(([f, s, l]) => [f / 2, s, l]), { type: 'square', vol: 0.05, filter: 900, attack: 0.03 });
  },
  clash: (a, c, o, t) => {
    // Steel on steel: a sharp noise strike and a ringing partial.
    a.hiss(c, o, t, 0.08, { type: 'highpass', freq: 3000, vol: 0.18 });
    a.tone(c, o, t, 2200 + Math.random() * 900, 0.18, { type: 'sine', vol: 0.05 });
    a.tone(c, o, t, 3400 + Math.random() * 600, 0.12, { type: 'sine', vol: 0.03 });
  },
  arrow: (a, c, o, t) => {
    a.hiss(c, o, t, 0.12, { freq: 2600, to: 900, q: 3, vol: 0.09 });
    a.tone(c, o, t + 0.1, 160, 0.06, { type: 'triangle', vol: 0.1, to: 90 });
  },
  boom: (a, c, o, t) => {
    a.tone(c, o, t, 120, 0.5, { type: 'sine', vol: 0.4, to: 35 });
    a.hiss(c, o, t, 0.45, { type: 'lowpass', freq: 900, to: 120, vol: 0.3 });
  },
  collapse: (a, c, o, t) => {
    a.hiss(c, o, t, 1.4, { type: 'lowpass', freq: 600, to: 80, vol: 0.35, attack: 0.05 });
    for (const k of [0, 0.25, 0.5, 0.8]) a.tone(c, o, t + k, 90 - k * 30, 0.3, { type: 'sine', vol: 0.2, to: 40 });
  },
  death: (a, c, o, t) => a.tone(c, o, t, 220, 0.25, { type: 'triangle', vol: 0.06, to: 110, filter: 800 }),
  alertTown: (a, c, o, t) => {
    // A low war horn, twice.
    for (const k of [0, 0.5]) {
      a.tone(c, o, t + k, 147, 0.42, { type: 'sawtooth', vol: 0.14, filter: 700, attack: 0.06 });
      a.tone(c, o, t + k, 220, 0.42, { type: 'sawtooth', vol: 0.06, filter: 700, attack: 0.06 });
    }
  },
  alertWall: (a, c, o, t) => {
    // A struck alarm bell.
    for (const k of [0, 0.32, 0.64]) {
      a.tone(c, o, t + k, 880, 0.5, { type: 'sine', vol: 0.12 });
      a.tone(c, o, t + k, 2347, 0.25, { type: 'sine', vol: 0.05 });
    }
  },
  alertShip: (a, c, o, t) => {
    // A ship's horn falling away, over the wash of the sea.
    a.tone(c, o, t, 110, 0.9, { type: 'sawtooth', vol: 0.14, filter: 500, to: 98, attack: 0.08 });
    a.hiss(c, o, t, 0.9, { type: 'lowpass', freq: 700, vol: 0.08, attack: 0.2 });
  },
  alertKing: (a, c, o, t) => {
    // An urgent trumpet triplet, climbing.
    a.notes(c, o, t, [[C5, 0, 0.12], [C5, 0.13, 0.12], [C5, 0.26, 0.12], [G5, 0.4, 0.45]], { type: 'sawtooth', vol: 0.11, filter: 2600, attack: 0.01 });
  },
  convert: (a, c, o, t) => a.notes(c, o, t, [[C4, 0, 1.0], [E4, 0, 1.0], [G4, 0, 1.0], [C5, 0.2, 0.8]], { type: 'sine', vol: 0.06, attack: 0.2 }),
  bell: (a, c, o, t) => {
    a.tone(c, o, t, 660, 1.2, { type: 'sine', vol: 0.13 });
    a.tone(c, o, t, 1660, 0.6, { type: 'sine', vol: 0.05 });
  },
  victory: (a, c, o, t) => {
    const seq: Array<[number, number, number]> = [[C4, 0, 0.2], [E4, 0.2, 0.2], [G4, 0.4, 0.2], [C5, 0.6, 0.35], [G4, 0.95, 0.15], [C5, 1.1, 0.9]];
    a.notes(c, o, t, seq, { type: 'sawtooth', vol: 0.11, filter: 2400, attack: 0.02 });
    a.notes(c, o, t + 1.1, [[E5, 0, 0.9], [G5, 0, 0.9]], { type: 'triangle', vol: 0.07 });
  },
  defeat: (a, c, o, t) =>
    a.notes(c, o, t, [[A4, 0, 0.4], [F4, 0.4, 0.4], [D4, 0.8, 0.5], [A4 / 2, 1.3, 1.1]], { type: 'sawtooth', vol: 0.1, filter: 1100, attack: 0.04 }),
  step: (a, c, o, t) => a.notes(c, o, t, [[E5, 0, 0.15], [B4, 0.12, 0.3]], { type: 'sine', vol: 0.12 }),
};

export const audio = new AudioEngine();
export const SFX_NAMES = Object.keys(SOUNDS) as Sfx[];

/** Unlocks audio on the first touch or click anywhere (iOS requires a gesture). */
export function installAudioUnlock(): void {
  const unlock = () => audio.unlock();
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  // Every button gives a soft click.
  window.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b && !(b as HTMLButtonElement).disabled) audio.play('click');
  }, { capture: true, passive: true });
}
