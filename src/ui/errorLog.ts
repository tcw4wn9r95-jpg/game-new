// A small on-device error log: phones hide the browser console, so errors
// (with stack traces) are kept here and can be viewed and copied from the
// pause menu to report a bug.
const KEY = 'hc.errors';
const MAX = 30;

export interface LoggedError {
  at: number;
  message: string;
  stack: string;
  build: string;
  /** Match clock when it happened, if a match was running. */
  time?: number;
}

function load(): LoggedError[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LoggedError[];
  } catch {
    return [];
  }
}

let context: () => number | undefined = () => undefined;

/** Lets entries record the match clock. */
export function setErrorContext(time: () => number | undefined): void {
  context = time;
}

export function logError(e: unknown): void {
  const err = e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
  const list = load();
  const entry: LoggedError = { at: Date.now(), message: err.message, stack: (err.stack ?? '').split('\n').slice(0, 12).join('\n'), build: __BUILD_ID__, time: context() };
  // Don't fill the log with the same error every frame.
  const last = list[list.length - 1];
  if (last && last.message === entry.message && last.stack === entry.stack && entry.at - last.at < 5000) return;
  list.push(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage full or blocked */
  }
}

export function errorCount(): number {
  return load().length;
}

export function errorReport(): string {
  const list = load();
  if (!list.length) return 'No errors recorded.';
  return list
    .map((e) => {
      const t = e.time !== undefined ? ` (match ${Math.floor(e.time / 60)}:${String(Math.floor(e.time % 60)).padStart(2, '0')})` : '';
      return `[${new Date(e.at).toISOString()}] build ${e.build}${t}\n${e.message}\n${e.stack}`;
    })
    .join('\n\n');
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Catches everything uncaught, including failed promises. */
export function installErrorLog(): void {
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason));
}

/** Full-screen viewer with Copy and Clear. */
export function showErrorLog(root: HTMLElement): void {
  const bg = document.createElement('div');
  bg.className = 'panel-backdrop slots-backdrop';
  bg.innerHTML = `
    <div class="panel frame slots-panel errlog-panel">
      <h2 class="panel-title">Error Log</h2>
      <pre class="errlog"></pre>
      <div class="load-row">
        <button class="btn btn-gold" data-a="copy">Copy</button>
        <button class="btn btn-wood" data-a="clear">Clear</button>
        <button class="btn btn-wood" data-a="close">Back</button>
      </div>
    </div>`;
  const pre = bg.querySelector('.errlog')!;
  pre.textContent = errorReport();
  bg.querySelector('[data-a=close]')!.addEventListener('click', () => bg.remove());
  bg.querySelector('[data-a=clear]')!.addEventListener('click', () => {
    clearErrors();
    pre.textContent = errorReport();
  });
  bg.querySelector('[data-a=copy]')!.addEventListener('click', async () => {
    const b = bg.querySelector<HTMLButtonElement>('[data-a=copy]')!;
    try {
      await navigator.clipboard.writeText(errorReport());
      b.textContent = 'Copied';
    } catch {
      // No clipboard access: select the text so it can be copied by hand.
      const r = document.createRange();
      r.selectNodeContents(pre);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
      b.textContent = 'Selected';
    }
  });
  root.appendChild(bg);
}
