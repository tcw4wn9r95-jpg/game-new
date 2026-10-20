// Tooltips for HUD controls: long-press on touch (the press then doesn't click),
// hover with a mouse. Content is built when shown so it is always current.

const LONG_PRESS_MS = 420;
let tipEl: HTMLElement | null = null;

function el(): HTMLElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip frame';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function show(anchor: HTMLElement, html: string): void {
  const t = el();
  t.innerHTML = html;
  t.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = t.offsetWidth, h = t.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 8;
  t.style.left = `${x}px`;
  t.style.top = `${above > 8 ? above : r.bottom + 8}px`;
}

export function hideTip(): void {
  if (tipEl) tipEl.hidden = true;
}

/** Attaches a tooltip whose HTML comes from `content()`. */
export function tip(target: HTMLElement, content: () => string): void {
  let timer = 0;
  let shown = false;
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    shown = false;
    timer = window.setTimeout(() => {
      shown = true;
      show(target, content());
    }, LONG_PRESS_MS);
  });
  const end = () => {
    clearTimeout(timer);
    if (shown) setTimeout(hideTip, 900);
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('pointerleave', (e) => {
    clearTimeout(timer);
    if (e.pointerType === 'mouse') hideTip();
  });
  target.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') show(target, content());
  });
  // A long press shows the tip instead of pressing the button.
  target.addEventListener(
    'click',
    (e) => {
      if (shown) {
        e.stopImmediatePropagation();
        e.preventDefault();
        shown = false;
      }
    },
    true,
  );
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}
