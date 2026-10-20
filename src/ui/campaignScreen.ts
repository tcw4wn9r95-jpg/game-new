// The campaign screen: each campaign's chapters with their briefings, which
// are unlocked or done, and (for chapters that have them) a choice of length.
// Progress is kept on the device.
import { CAMPAIGNS, type CampaignDef } from '../sim/campaigns';
import { SCENARIOS } from '../sim/scenario';
import { emblemSvg } from './logo';

const KEY = 'hc.campaign';

interface Progress {
  /** Chapters won: id -> best (shortest) match time in seconds. */
  done: Record<string, number>;
}

function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Progress>;
    return { done: p.done ?? {} };
  } catch {
    return { done: {} };
  }
}

/** Records a chapter as won. */
export function markDone(id: string, seconds: number): void {
  const p = load();
  p.done[id] = Math.min(p.done[id] ?? Infinity, Math.round(seconds));
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts this session only */
  }
}

/** A chapter is open if it is a campaign's first, or the one before it has been won. */
export function unlocked(id: string, p = load()): boolean {
  const c = CAMPAIGNS.find((x) => x.chapters.includes(id));
  if (!c) return false;
  const i = c.chapters.indexOf(id);
  return c.open || i === 0 || !!p.done[c.chapters[i - 1]];
}

/** The chapter after this one in its campaign. */
export function nextChapter(id: string): string | null {
  const c = CAMPAIGNS.find((x) => x.chapters.includes(id));
  if (!c) return null;
  return c.chapters[c.chapters.indexOf(id) + 1] ?? null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function showCampaigns(parent: HTMLElement, hooks: { onStart: (id: string, variant: string) => void; onBack: () => void }, focus?: string): void {
  const progress = load();
  const el = document.createElement('div');
  el.className = 'setup campaigns';
  let campaign: CampaignDef = CAMPAIGNS.find((c) => focus && c.chapters.includes(focus)) ?? CAMPAIGNS[0];
  let chapter = focus && unlocked(focus, progress) ? focus : (campaign.chapters.find((id) => unlocked(id, progress) && !progress.done[id]) ?? campaign.chapters[0]);
  let variant = '';

  const render = () => {
    const def = SCENARIOS.get(chapter)!;
    variant = def.variants?.some((v) => v.id === variant) ? variant : (def.variants?.[1]?.id ?? def.variants?.[0]?.id ?? '');
    const open = unlocked(chapter, progress);
    el.innerHTML = `
      <div class="setup-main">
        <section class="setup-left frame camp-left">
          <header class="setup-title">${emblemSvg({ className: 'crest' })}<h1><span class="wordmark"><span class="wm-word">Campaigns</span></span></h1></header>
          <div class="camp-list">
            ${CAMPAIGNS.map(
              (c) => `<button class="camp-card ${c.id === campaign.id ? 'on' : ''}" data-c="${c.id}">
                <span class="camp-name">${c.title}</span>
                <span class="camp-len">${c.length}</span>
                <span class="camp-blurb">${c.blurb}</span>
                <span class="camp-pips">${c.chapters.map((id) => `<i class="${progress.done[id] ? 'done' : unlocked(id, progress) ? 'open' : ''}"></i>`).join('')}</span>
              </button>`,
            ).join('')}
          </div>
        </section>
        <section class="setup-right frame camp-right">
          <div class="chap-tabs">
            ${campaign.chapters
              .map((id, i) => {
                const d = SCENARIOS.get(id)!;
                const state = progress.done[id] ? 'done' : unlocked(id, progress) ? 'open' : 'locked';
                return `<button class="chap-tab ${id === chapter ? 'on' : ''} ${state}" data-ch="${id}" ${state === 'locked' ? 'aria-disabled="true"' : ''}>${state === 'done' ? '✓' : state === 'locked' ? '🔒' : i + 1}<span>${d.title}</span></button>`;
              })
              .join('')}
          </div>
          <div class="chap-body">
            <div class="chap-title">${def.title}</div>
            <div class="chap-len">${def.length}${progress.done[chapter] ? ` · won in ${clock(progress.done[chapter])}` : ''}</div>
            <div class="chap-brief">${def.briefing.map((p) => `<p>${p}</p>`).join('')}</div>
            ${def.variants ? `<div class="setup-label">Length of the siege</div><div class="seg chap-variants">${def.variants.map((v) => `<button class="seg-btn" data-v="${v.id}" aria-pressed="${v.id === variant}">${v.label}</button>`).join('')}</div><div class="chap-note">${def.variants.find((v) => v.id === variant)?.note ?? ''}</div>` : ''}
          </div>
          <div class="chap-actions">
            <button class="btn btn-wood btn-small" data-a="back">Back</button>
            <button class="btn btn-gold" data-a="start" ${open ? '' : 'disabled'}>${open ? (progress.done[chapter] ? 'Play Again' : 'Begin') : 'Locked'}</button>
          </div>
        </section>
      </div>`;
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c) {
      campaign = CAMPAIGNS.find((x) => x.id === c)!;
      chapter = campaign.chapters.find((id) => unlocked(id, progress) && !progress.done[id]) ?? campaign.chapters[0];
      return render();
    }
    const ch = t.closest<HTMLElement>('[data-ch]')?.dataset.ch;
    if (ch) {
      chapter = ch;
      return render();
    }
    const v = t.closest<HTMLElement>('[data-v]')?.dataset.v;
    if (v) {
      variant = v;
      return render();
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'back') {
      el.remove();
      hooks.onBack();
    } else if (a === 'start' && unlocked(chapter, progress)) {
      el.remove();
      hooks.onStart(chapter, variant);
    }
  });
  render();
  parent.appendChild(el);
}
