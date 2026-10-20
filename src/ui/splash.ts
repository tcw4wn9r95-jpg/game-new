// The title card shown when the game starts: the emblem with its fire alight,
// the wordmark, drifting embers and "Tap to begin". The tap also unlocks
// sound on iOS, so the fanfare that greets it is the first thing heard.
import { audio } from './audio';
import { emblemSvg, wordmarkHtml } from './logo';

export function showSplash(onDone: () => void = () => {}): void {
  const el = document.createElement('div');
  el.className = 'splash';
  const embers = Array.from({ length: 18 }, (_, i) => {
    const left = (i * 53) % 100, delay = ((i * 37) % 60) / 10, dur = 5 + ((i * 29) % 40) / 10, size = 2 + (i % 3);
    return `<i style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px"></i>`;
  }).join('');
  el.innerHTML = `
    <div class="splash-embers">${embers}</div>
    <div class="splash-center">
      ${emblemSvg({ animated: true, className: 'splash-emblem' })}
      <div class="splash-title">${wordmarkHtml('wm-big')}</div>
      <div class="splash-tag">Kindle a hearth. Raise a realm. Claim the crown.</div>
      <div class="splash-tap">Tap to begin</div>
    </div>`;
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    audio.unlock();
    // Give the context a moment to start before the fanfare.
    setTimeout(() => audio.play('ageUp'), 60);
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      onDone();
    }, 650);
  };
  el.addEventListener('pointerup', go);
  el.addEventListener('click', go);
  document.body.appendChild(el);
}
