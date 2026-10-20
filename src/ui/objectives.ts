// The objectives card shown during a campaign chapter: each goal with a tick
// or its progress, the next invasion's countdown, and a fold button.
import { SCENARIOS, nextWaveIn, objectiveDone, objectiveProgress, planOf } from '../sim/scenario';
import type { World } from '../sim/world';

export class ObjectivesCard {
  private readonly el: HTMLElement;
  private shown = '';
  private last = 0;

  constructor(parent: HTMLElement, private readonly world: World) {
    this.el = document.createElement('div');
    this.el.className = 'tut-card obj-card frame';
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-a=fold]')) this.el.classList.toggle('folded');
    });
    parent.appendChild(this.el);
    parent.classList.add('has-card');
  }

  update(now: number): void {
    if (now - this.last < 0.4) return;
    this.last = now;
    const w = this.world, st = w.scenario;
    if (!st) return;
    const def = SCENARIOS.get(st.id);
    if (!def) return;
    const plan = planOf(st);
    const wave = nextWaveIn(w);
    const limit = plan.lose.find((l) => l.kind === 'timeout');
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const rows = plan.objectives
      .map((o) => {
        const done = objectiveDone(w, st, o);
        const prog = done ? '' : objectiveProgress(w, st, o);
        return `<li class="${done ? 'done' : ''}"><i>${done ? '✓' : ''}</i><span>${o.label}${prog ? ` <b>${prog}</b>` : ''}</span></li>`;
      })
      .join('');
    const html = `
      <div class="tut-head"><span class="tut-step">Objectives</span><button class="tut-fold" data-a="fold" aria-label="Fold">–</button></div>
      <div class="tut-title">${def.title}</div>
      <ul class="obj-list">${rows}</ul>
      ${limit && limit.kind === 'timeout' ? `<div class="obj-wave ${limit.seconds - w.time < 60 ? 'soon' : ''}">Time left <b>${clock(Math.max(0, limit.seconds - w.time))}</b></div>` : ''}
      ${wave !== null ? `<div class="obj-wave ${wave < 30 ? 'soon' : ''}">${st.wave === 0 ? 'The enemy arrives in' : 'Next wave in'} <b>${clock(wave)}</b></div>` : ''}`;
    if (html === this.shown) return;
    this.shown = html;
    this.el.innerHTML = html;
  }

  destroy(): void {
    this.el.parentElement?.classList.remove('has-card');
    this.el.remove();
  }
}
