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
const C4 = 261.6, D4 = 293.7, F4 = 349.2, G4 = 392, A4 = 440, B4 = 493.9, C5 = 523.3, E5 = 659.3, G5 = 784, C6 = 1046.5;

const SOUNDS: Record<Sfx, Maker> = {
  click: (a, c, o, t) => a.tone(c, o, t, 1800, 0.035, { type: 'square', vol: 0.05, filter: 3000 }),
  select: (a, c, o, t) => a.notes(c, o, t, [[1320, 0, 0.05], [1760, 0.05, 0.07]], { type: 'sine', vol: 0.12 }),
  selectSoldier: (a, c, o, t) => {
    // Radio squelch: a burst of filtered static and a chirp.
    a.hiss(c, o, t, 0.07, { freq: 2600, q: 1.5, vol: 0.08 });
    a.tone(c, o, t + 0.05, 1250, 0.06, { type: 'square', vol: 0.04, filter: 2500 });
  },
  order: (a, c, o, t) => {
    a.hiss(c, o, t, 0.04, { freq: 3000, q: 2, vol: 0.05 });
    a.notes(c, o, t + 0.03, [[990, 0, 0.05], [1320, 0.06, 0.07]], { type: 'square', vol: 0.05, filter: 2600 });
  },
  attackOrder: (a, c, o, t) => {
    a.hiss(c, o, t, 0.05, { freq: 2800, q: 2, vol: 0.06 });
    a.notes(c, o, t + 0.04, [[660, 0, 0.06], [990, 0.07, 0.06], [1320, 0.14, 0.1]], { type: 'square', vol: 0.05, filter: 2400 });
  },
  error: (a, c, o, t) => a.notes(c, o, t, [[220, 0, 0.09], [220, 0.12, 0.12]], { type: 'square', vol: 0.06, filter: 900 }),
  built: (a, c, o, t) => {
    // A power drill's whine, then a confirmation chime.
    a.tone(c, o, t, 420, 0.25, { type: 'sawtooth', vol: 0.06, to: 900, filter: 2000, attack: 0.02 });
    a.hiss(c, o, t, 0.25, { freq: 3500, q: 3, vol: 0.04 });
    a.notes(c, o, t + 0.3, [[E5, 0, 0.18], [G5, 0.09, 0.2], [C6, 0.18, 0.35]], { type: 'sine', vol: 0.11 });
  },
  trained: (a, c, o, t) => a.notes(c, o, t, [[G5, 0, 0.08], [C6, 0.09, 0.14]], { type: 'square', vol: 0.05, filter: 3200 }),
  researched: (a, c, o, t) => a.notes(c, o, t, [[C5, 0, 0.12], [G5, 0.08, 0.12], [C6, 0.16, 0.3]], { type: 'triangle', vol: 0.12 }),
  ageUp: (a, c, o, t) => {
    // A rising synth swell over a sub-bass hit.
    a.tone(c, o, t, 55, 1.2, { type: 'sine', vol: 0.3, to: 45 });
    const seq: Array<[number, number, number]> = [[C4, 0, 0.9], [G4, 0.12, 0.85], [C5, 0.24, 0.8], [E5, 0.36, 0.9]];
    a.notes(c, o, t, seq, { type: 'sawtooth', vol: 0.06, filter: 2600, attack: 0.15 });
    a.notes(c, o, t + 0.5, [[G5, 0, 0.6], [C6, 0.12, 0.8]], { type: 'triangle', vol: 0.07 });
  },
  clash: (a, c, o, t) => {
    // A close-range shot: a hard crack and a low thump.
    a.hiss(c, o, t, 0.07, { type: 'highpass', freq: 1800, vol: 0.2, attack: 0.001 });
    a.tone(c, o, t, 140, 0.12, { type: 'sine', vol: 0.18, to: 60 });
  },
  arrow: (a, c, o, t) => {
    // Rifle fire: crack, body and a short tail.
    a.hiss(c, o, t, 0.05, { type: 'highpass', freq: 2500, vol: 0.16, attack: 0.001 });
    a.hiss(c, o, t, 0.16, { type: 'lowpass', freq: 1400, to: 300, vol: 0.1, attack: 0.002 });
    a.tone(c, o, t, 180, 0.08, { type: 'sine', vol: 0.08, to: 70 });
  },
  boom: (a, c, o, t) => {
    a.hiss(c, o, t, 0.08, { type: 'highpass', freq: 1200, vol: 0.25, attack: 0.001 });
    a.tone(c, o, t, 90, 0.8, { type: 'sine', vol: 0.45, to: 28 });
    a.hiss(c, o, t, 0.9, { type: 'lowpass', freq: 1100, to: 90, vol: 0.32, attack: 0.004 });
  },
  collapse: (a, c, o, t) => {
    a.hiss(c, o, t, 1.6, { type: 'lowpass', freq: 700, to: 70, vol: 0.38, attack: 0.03 });
    for (const k of [0, 0.2, 0.45, 0.75]) a.tone(c, o, t + k, 80 - k * 25, 0.35, { type: 'sine', vol: 0.22, to: 35 });
    a.hiss(c, o, t + 0.3, 0.6, { type: 'highpass', freq: 3500, vol: 0.05 });
  },
  death: (a, c, o, t) => a.hiss(c, o, t, 0.12, { freq: 500, q: 1, vol: 0.06, to: 200 }),
  alertTown: (a, c, o, t) => {
    // Klaxon: two harsh, rising blasts.
    for (const k of [0, 0.45]) {
      a.tone(c, o, t + k, 330, 0.35, { type: 'sawtooth', vol: 0.09, to: 440, filter: 1600, attack: 0.02 });
      a.tone(c, o, t + k, 165, 0.35, { type: 'square', vol: 0.04, to: 220, filter: 900, attack: 0.02 });
    }
  },
  alertWall: (a, c, o, t) => {
    // Perimeter alarm: fast electronic beeps.
    for (const k of [0, 0.14, 0.28, 0.42]) a.tone(c, o, t + k, 1760, 0.09, { type: 'square', vol: 0.05, filter: 3500 });
  },
  alertShip: (a, c, o, t) => {
    // Sonar ping and a ship's horn.
    a.tone(c, o, t, 1480, 0.8, { type: 'sine', vol: 0.1 });
    a.tone(c, o, t + 0.3, 110, 0.8, { type: 'sawtooth', vol: 0.12, filter: 500, to: 98, attack: 0.08 });
  },
  alertKing: (a, c, o, t) => {
    // Priority radio tone: urgent triple beep, climbing.
    a.notes(c, o, t, [[1047, 0, 0.1], [1047, 0.13, 0.1], [1047, 0.26, 0.1], [1568, 0.42, 0.35]], { type: 'square', vol: 0.06, filter: 3000 });
  },
  convert: (a, c, o, t) => {
    // A data handshake: warbling modem chirps.
    for (let k = 0; k < 6; k++) a.tone(c, o, t + k * 0.07, k % 2 ? 2400 : 1200, 0.06, { type: 'square', vol: 0.035, filter: 3200 });
    a.tone(c, o, t + 0.45, 880, 0.4, { type: 'sine', vol: 0.06, to: 1760 });
  },
  bell: (a, c, o, t) => {
    // Air-raid siren: a long rise and fall.
    a.tone(c, o, t, 300, 0.9, { type: 'sawtooth', vol: 0.08, to: 620, filter: 1400, attack: 0.15 });
    a.tone(c, o, t + 0.9, 620, 0.9, { type: 'sawtooth', vol: 0.08, to: 300, filter: 1400, attack: 0.02 });
  },
  victory: (a, c, o, t) => {
    const seq: Array<[number, number, number]> = [[C4, 0, 0.18], [G4, 0.18, 0.18], [C5, 0.36, 0.18], [E5, 0.54, 0.3], [D4 * 2, 0.86, 0.15], [G5, 1.0, 1.0]];
    a.notes(c, o, t, seq, { type: 'sawtooth', vol: 0.08, filter: 2600, attack: 0.02 });
    a.notes(c, o, t + 1.0, [[C5, 0, 1.0], [E5, 0, 1.0]], { type: 'triangle', vol: 0.07 });
    a.tone(c, o, t + 1.0, 65, 1.0, { type: 'sine', vol: 0.25, to: 55 });
  },
  defeat: (a, c, o, t) => {
    a.notes(c, o, t, [[A4, 0, 0.4], [F4, 0.4, 0.4], [D4, 0.8, 0.5], [A4 / 2, 1.3, 1.1]], { type: 'sawtooth', vol: 0.08, filter: 900, attack: 0.04 });
    a.hiss(c, o, t + 1.3, 1.1, { freq: 1500, q: 1, vol: 0.04 });
  },
  step: (a, c, o, t) => a.notes(c, o, t, [[E5, 0, 0.1], [B4 * 2, 0.1, 0.18]], { type: 'square', vol: 0.05, filter: 3000 }),
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
