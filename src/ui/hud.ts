import ages from '../data/ages.json';
import { RESOURCE_KINDS, type ResourceKind, type World } from '../sim/world';
import { ICONS } from './icons';
import { tip } from './tooltip';
import { SPEEDS, type Settings, onSettings, settings, showSettings, speedLabel, updateSettings } from './settings';
import { PLAYER_COLORS } from '../render/palette';
import { ALL_SITES_HOLD, RELIC_HOLD, dominationTarget, wonderClock } from '../sim/modes';

const RESOURCE_NAMES: Record<ResourceKind, string> = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' };

function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * In-match HUD: resource bar, population, age plate and clock along the top, the
 * menu button, and the framed minimap slot. DOM text only changes when values do.
 */
export class Hud {
  readonly minimapSlot: HTMLElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly last = new Map<string, string>();
  private readonly pauseMenu: HTMLElement;
  onNewMatch: () => void = () => {};
  onSave: () => void = () => {};
  onLoad: () => void = () => {};
  onErrors: () => void = () => {};
  onIdleVillager: () => void = () => {};
  onIdleMilitary: () => void = () => {};
  onAllMilitary: () => void = () => {};
  /** Regicide: centre on the King; a second tap sends him to shelter. */
  onKing: () => void = () => {};
  onKingShelter: () => void = () => {};
  private readonly kingBtn: HTMLButtonElement;
  private readonly modeStrip: HTMLElement;
  private readonly idleBtn: HTMLButtonElement;
  private readonly armyBtn: HTMLButtonElement;
  private readonly toasts: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly pausedChip: HTMLElement;
  private readonly unsubscribe: () => void;
  paused = false;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = '';
    const top = el('div', 'hud-top');

    const bar = el('div', 'resbar frame');
    for (const k of RESOURCE_KINDS) bar.appendChild(this.stat(k, ICONS[k], RESOURCE_NAMES[k]));
    bar.appendChild(this.stat('pop', ICONS.pop, 'Population', 'stat-pop'));
    top.appendChild(bar);

    const age = el('div', 'ageplate frame');
    age.innerHTML = `<span class="ageplate-icon">${ICONS.crown}</span><span class="ageplate-text"><b data-v="ageNum"></b><span data-v="ageName"></span></span><span class="ageplate-bar" hidden><span></span></span>`;
    this.ageBar = age.querySelector<HTMLElement>('.ageplate-bar')!;
    tip(age, () => this.ageTip());
    age.querySelectorAll<HTMLElement>('[data-v]').forEach((n) => this.values.set(n.dataset.v!, n));
    top.appendChild(age);

    // The clock doubles as the pause button: the map stays usable while paused.
    const clock = el('button', 'clock frame');
    clock.setAttribute('aria-label', 'Pause');
    clock.innerHTML = `<span class="icon">${ICONS.clock}</span><span data-v="clock">00:00</span>`;
    this.values.set('clock', clock.querySelector('[data-v]')!);
    clock.addEventListener('click', () => this.togglePause());
    tip(clock, () => `<div class="tip-title">Pause</div><div class="tip-body">Tap the clock to stop time. You can still look around and give orders.</div>`);
    this.pauseBtn = clock;
    top.appendChild(clock);

    const speedBtn = el('button', 'round-btn speed-btn');
    speedBtn.setAttribute('aria-label', 'Game speed');
    speedBtn.addEventListener('click', () => updateSettings({ speed: SPEEDS[(SPEEDS.indexOf(settings.speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] }));
    tip(speedBtn, () => `<div class="tip-title">Game Speed</div><div class="tip-body">Tap to cycle 1×, 1.5×, 2× and 3×.</div>`);
    this.speedBtn = speedBtn;
    const menuBtn = el('button', 'round-btn');
    menuBtn.setAttribute('aria-label', 'Menu');
    menuBtn.innerHTML = ICONS.menu;
    menuBtn.addEventListener('click', () => this.setPaused(true));
    top.append(speedBtn, menuBtn);
    root.appendChild(top);
    const pausedChip = el('div', 'paused-chip');
    pausedChip.textContent = 'Paused';
    pausedChip.hidden = true;
    this.pausedChip = pausedChip;
    root.appendChild(pausedChip);
    this.unsubscribe = onSettings((st) => this.applySettings(st));
    this.applySettings(settings);

    const debug = el('div', 'hud-debug');
    debug.innerHTML = `<div id="fps" class="hud-chip" hidden></div><div id="bench" class="hud-chip" hidden></div>`;
    root.appendChild(debug);

    this.minimapSlot = el('div', 'minimap-frame frame');
    root.appendChild(this.minimapSlot);

    const side = el('div', 'side-btns');
    const sideBtn = (key: string, icon: string, title: string, body: string, run: () => void, badge = true) => {
      const b = el('button', 'side-btn');
      b.setAttribute('aria-label', title);
      b.innerHTML = `${icon}${badge ? `<span class="badge" data-v="${key}">0</span>` : ''}`;
      if (badge) this.values.set(key, b.querySelector('[data-v]')!);
      b.addEventListener('click', run);
      tip(b, () => `<div class="tip-title">${title}</div><div class="tip-body">${body}</div>`);
      side.appendChild(b);
      return b;
    };
    this.idleBtn = sideBtn('idle', ICONS.villager, 'Idle Villagers', 'Jump to the next villager with nothing to do.', () => this.onIdleVillager());
    this.armyBtn = sideBtn('idleArmy', ICONS.helmet, 'Idle Military', 'Jump to the next soldier awaiting orders.', () => this.onIdleMilitary());
    sideBtn('army', ICONS.military, 'Select All Military', 'Select every soldier you command.', () => this.onAllMilitary(), false);
    sideBtn('ships', ICONS.ship, 'Select All Ships', 'Available once you have a Dock.', () => {}, false).disabled = true;
    let lastKingTap = 0;
    this.kingBtn = sideBtn('king', ICONS.crown, 'Your King', 'Tap to find him; tap twice quickly to send him into the nearest Castle or tower.', () => {
      const now = performance.now();
      if (now - lastKingTap < 400) this.onKingShelter();
      else this.onKing();
      lastKingTap = now;
    }, false);
    this.kingBtn.hidden = true;
    root.appendChild(side);

    this.modeStrip = el('div', 'mode-strip');
    this.modeStrip.hidden = true;
    root.appendChild(this.modeStrip);

    this.toasts = el('div', 'toasts');
    root.appendChild(this.toasts);

    this.pauseMenu = el('div', 'panel-backdrop');
    this.pauseMenu.hidden = true;
    this.pauseMenu.innerHTML = `
      <div class="panel frame">
        <h2 class="panel-title">Paused</h2>
        <button class="btn btn-gold" data-a="resume">Resume</button>
        <button class="btn btn-wood" data-a="save">Save Game</button>
        <button class="btn btn-wood" data-a="load">Load Game</button>
        <button class="btn btn-wood" data-a="new">New Match</button>
        <button class="btn btn-wood btn-small" data-a="settings">Settings</button>
        <button class="btn btn-wood btn-small" data-a="errors">Error Log</button>
      </div>`;
    this.pauseMenu.querySelector('[data-a=errors]')!.addEventListener('click', () => this.onErrors());
    this.pauseMenu.querySelector('[data-a=settings]')!.addEventListener('click', () => showSettings(document.body));
    this.pauseMenu.querySelector('[data-a=resume]')!.addEventListener('click', () => this.setPaused(false));
    this.pauseMenu.querySelector('[data-a=save]')!.addEventListener('click', () => this.onSave());
    this.pauseMenu.querySelector('[data-a=load]')!.addEventListener('click', () => this.onLoad());
    this.pauseMenu.querySelector('[data-a=new]')!.addEventListener('click', () => {
      this.setPaused(false);
      this.onNewMatch();
    });
    root.appendChild(this.pauseMenu);
  }

  private stat(key: string, icon: string, title: string, cls = ''): HTMLElement {
    const s = el('div', `stat ${cls}`);
    s.title = title;
    const workers = (RESOURCE_KINDS as string[]).includes(key);
    s.innerHTML = `<span class="icon">${icon}</span><span class="stat-v" data-v="${key}">0</span>${workers ? `<span class="workers" data-v="${key}W">0</span>` : ''}`;
    s.querySelectorAll<HTMLElement>('[data-v]').forEach((n) => this.values.set(n.dataset.v!, n));
    tip(s, () => `<div class="tip-title">${title}</div><div class="tip-body">${workers ? 'Stockpile, and villagers gathering it.' : 'Population / capacity. Build houses to raise it.'}</div>`);
    return s;
  }

  /** Pauses with the menu open (or closes it and plays on). */
  setPaused(p: boolean): void {
    this.paused = p;
    this.pauseMenu.hidden = !p;
    this.showPause();
  }

  /** The pause button: the clock stops but the map stays usable. */
  togglePause(): void {
    this.paused = !this.paused;
    this.pauseMenu.hidden = true;
    this.showPause();
  }

  private showPause(): void {
    this.pausedChip.hidden = !this.paused || !this.pauseMenu.hidden;
    this.pauseBtn.querySelector('.icon')!.innerHTML = this.paused ? ICONS.pause : ICONS.clock;
    this.pauseBtn.classList.toggle('active', this.paused);
  }

  private applySettings(st: Settings): void {
    this.speedBtn.textContent = speedLabel(st.speed);
    this.root.classList.toggle('lefty', st.lefty);
  }

  /** Short message that fades after a few seconds. */
  toast(message: string, onTap?: () => void): void {
    const t = el('div', onTap ? 'toast frame alert' : 'toast frame');
    t.textContent = message;
    if (onTap) {
      t.addEventListener('click', () => {
        onTap();
        t.remove();
      });
    }
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.classList.add('fade'), onTap ? 4200 : 2200);
    setTimeout(() => t.remove(), onTap ? 4800 : 2800);
  }

  update(world: World, player: number, idleVillagers = 0, idleMilitary = 0): void {
    const ps = world.players[player];
    this.set('idle', String(idleVillagers));
    this.idleBtn.classList.toggle('has-idle', idleVillagers > 0);
    this.set('idleArmy', String(idleMilitary));
    this.armyBtn.classList.toggle('has-idle', idleMilitary > 0);
    // Villagers working each resource, as on the AoE resource bar.
    const workers = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of world.units(player)) {
      const o = u.order;
      if (o?.type === 'gather') workers[o.res]++;
      else if (o?.type === 'dropoff' && u.carry) workers[u.carry.res]++;
    }
    for (const k of RESOURCE_KINDS) this.set(`${k}W`, String(workers[k]));
    for (const k of RESOURCE_KINDS) this.set(k, String(Math.floor(ps.resources[k])));
    this.set('pop', `${ps.pop}/${ps.popCap}`);
    // While advancing, the plate names the coming age and fills a bar.
    let advancing: { age: number; progress: number } | null = null;
    for (const b of world.buildings(player))
      for (const q of b.queue)
        if (q.tech && q === b.queue[0] && /^age\d$/.test(q.tech)) advancing = { age: Number(q.tech.slice(3)) - 1, progress: q.progress };
    this.world = world;
    this.player = player;
    // Advancing: show the coming age's numeral and the progress, kept as short as the usual label.
    this.set('ageNum', advancing ? `→ ${ages[advancing.age].numeral}` : ages[ps.age].numeral);
    this.set('ageName', advancing ? `Advancing ${Math.floor(advancing.progress * 100)}%` : `${ages[ps.age].name} Age`);
    this.ageBar.hidden = !advancing;
    this.ageBar.parentElement!.classList.toggle('advancing', !!advancing);
    if (advancing) (this.ageBar.firstElementChild as HTMLElement).style.width = `${advancing.progress * 100}%`;
    // During the Peace Treaty the clock counts down to the end of it.
    this.set('clock', world.peace ? `Peace ${formatClock(world.peaceUntil - world.time)}` : formatClock(world.time));
    this.kingBtn.hidden = world.mode !== 'regicide';
    this.updateMode(world, player);
  }

  /** Domination score, and the countdowns of Wonders and relic holds. */
  private updateMode(w: World, player: number): void {
    const parts: string[] = [];
    const teamColor = (team: number) => PLAYER_COLORS[Math.max(0, w.players.findIndex((p) => p.team === team)) % PLAYER_COLORS.length];
    const mine = w.players[player].team;
    const who = (team: number) => (team === mine ? 'You' : 'Enemy');
    const whose = (team: number) => (team === mine ? 'Your' : 'Enemy');
    const holds = (team: number) => (team === mine ? 'You hold' : 'Enemy holds');
    if (w.mode === 'domination') {
      const target = dominationTarget(w);
      const teams = [...new Set(w.players.map((p) => p.team))];
      const scores = teams
        .map((t) => `<span class="ms-team" style="--c:${teamColor(t)}"><i></i>${who(t)} <b>${Math.floor(w.modeState.score[t] ?? 0)}</b></span>`)
        .join('');
      const sites = w.modeState.sites.map((s) => `<i class="ms-site" style="--c:${s.owner >= 0 ? PLAYER_COLORS[s.owner % PLAYER_COLORS.length] : '#d8d0bc'}"></i>`).join('');
      parts.push(`${scores}<span class="ms-dim">/ ${target}</span><span class="ms-sites">${sites}</span>`);
      const h = w.modeState.siteHold;
      if (h) parts.push(`<span class="ms-timer" style="--c:${teamColor(h.team)}">${holds(h.team)} every site · ${formatClock(Math.max(0, ALL_SITES_HOLD - (w.time - h.since)))}</span>`);
      if (w.peace) parts.push('<span class="ms-dim">Sites open when the treaty ends</span>');
    }
    const wc = wonderClock(w);
    if (wc && w.mode !== 'domination') parts.push(`<span class="ms-timer" style="--c:${PLAYER_COLORS[wc.owner % PLAYER_COLORS.length]}">${whose(w.players[wc.owner].team)} Wonder · ${formatClock(wc.left)}</span>`);
    const rh = w.modeState.relicHold;
    if (rh && w.mode === 'standard') parts.push(`<span class="ms-timer" style="--c:${teamColor(rh.team)}">${holds(rh.team)} all relics · ${formatClock(Math.max(0, RELIC_HOLD - (w.time - rh.since)))}</span>`);
    const html = parts.join('');
    this.modeStrip.hidden = !html;
    if (this.last.get('modeStrip') !== html) {
      this.last.set('modeStrip', html);
      this.modeStrip.innerHTML = html;
    }
  }

  /** A campaign message: a story beat that lingers a little longer than a toast. */
  story(message: string): void {
    const t = el('div', 'toast frame story');
    t.textContent = message;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.classList.add('fade'), 6500);
    setTimeout(() => t.remove(), 7100);
  }

  /** End of a campaign chapter: on to the next, try again, or back to the campaigns. */
  chapterEnd(won: boolean, title: string, detail: string, time: number, actions: { next?: () => void; retry: () => void; campaigns: () => void }): void {
    const bg = el('div', 'panel-backdrop');
    bg.innerHTML = `
      <div class="panel frame end-panel ${won ? 'won' : 'lost'}">
        <h2 class="panel-title">${won ? 'Chapter Complete' : 'Defeat'}</h2>
        <div class="end-detail"><b>${title}</b><br>${detail}. Time ${formatClock(time)}.</div>
        ${won && actions.next ? '<button class="btn btn-gold" data-a="next">Next Chapter</button>' : ''}
        ${!won ? '<button class="btn btn-gold" data-a="retry">Try Again</button>' : ''}
        <button class="btn btn-wood" data-a="campaigns">Campaigns</button>
        <button class="btn btn-wood btn-small" data-a="watch">${won ? 'Look Around' : 'Keep Watching'}</button>
      </div>`;
    const on = (a: string, f?: () => void) =>
      bg.querySelector(`[data-a=${a}]`)?.addEventListener('click', () => {
        bg.remove();
        f?.();
      });
    on('next', actions.next);
    on('retry', actions.retry);
    on('campaigns', actions.campaigns);
    on('watch');
    this.root.appendChild(bg);
  }

  /** End of the match: Victory or Defeat, with the option to keep watching. */
  endScreen(won: boolean, time: number, reason = ''): void {
    const bg = el('div', 'panel-backdrop');
    bg.innerHTML = `
      <div class="panel frame end-panel ${won ? 'won' : 'lost'}">
        <h2 class="panel-title">${won ? 'Victory' : 'Defeat'}</h2>
        <div class="end-detail">${reason || (won ? 'Every enemy has fallen.' : 'Your realm has fallen.')} Match time ${formatClock(time)}.</div>
        <button class="btn btn-gold" data-a="new">New Match</button>
        <button class="btn btn-wood" data-a="watch">${won ? 'Look Around' : 'Keep Watching'}</button>
      </div>`;
    bg.querySelector('[data-a=watch]')!.addEventListener('click', () => bg.remove());
    bg.querySelector('[data-a=new]')!.addEventListener('click', () => {
      bg.remove();
      this.onNewMatch();
    });
    this.root.appendChild(bg);
  }

  private ageBar!: HTMLElement;
  private world: World | null = null;
  private player = 0;

  private ageTip(): string {
    const w = this.world;
    if (!w) return '';
    const p = w.players[this.player];
    const next = ages[p.age + 1] as { name: string; cost: Record<string, number>; requires?: { buildings: number } } | undefined;
    const body = next
      ? `Next: the ${next.name} Age, for ${Object.entries(next.cost).map(([k, v]) => `${v} ${k}`).join(' and ')}, researched at the Town Center. Needs ${next.requires?.buildings ?? 2} different ${ages[p.age].name} Age buildings.`
      : 'The highest age.';
    return `<div class="tip-title">${ages[p.age].name} Age</div><div class="tip-body">${body}</div>`;
  }

  /** A large banner across the top for an age-up. */
  announce(title: string, sub: string): void {
    const b = el('div', 'age-banner');
    b.innerHTML = `<div class="age-banner-title">${title}</div><div class="age-banner-sub">${sub}</div>`;
    this.toasts.parentElement!.appendChild(b);
    setTimeout(() => b.classList.add('fade'), 3200);
    setTimeout(() => b.remove(), 4200);
  }

  private set(key: string, text: string): void {
    if (this.last.get(key) === text) return;
    this.last.set(key, text);
    this.values.get(key)!.textContent = text;
  }

  destroy(): void {
    this.unsubscribe();
    this.root.classList.remove('lefty');
    this.root.innerHTML = '';
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
