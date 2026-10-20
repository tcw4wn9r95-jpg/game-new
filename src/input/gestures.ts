import type { Camera } from '../render/camera';

/** Movement (CSS px) before a touch counts as a drag instead of a tap. */
const TAP_SLOP = 10;
const TAP_MAX_MS = 350;
/** Hold this long without moving to start a selection box. */
const LONG_PRESS_MS = 380;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;
/** Pinch distance ratio that triggers one zoom step. */
const PINCH_STEP = 1.3;
/** Window (ms) of recent moves used to estimate fling velocity. */
const FLING_WINDOW = 90;

export interface GestureHandlers {
  onTap?(x: number, y: number): void;
  onDoubleTap?(x: number, y: number): void;
  /** Selection box in screen CSS px; `done` on release. */
  onBox?(x0: number, y0: number, x1: number, y1: number, done: boolean): void;
  /** A long press began at this point (selection box mode). */
  onLongPress?(x: number, y: number): void;
  /** A one-finger touch began here; return true to take the drag instead of panning. */
  onDragStart?(x: number, y: number): boolean;
  onDrag?(x: number, y: number): void;
  onDragEnd?(): void;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Turns pointer input on the canvas into camera moves and selection gestures:
 * one-finger pan with fling, two-finger pinch (stepped zoom) and pan, mouse-wheel
 * zoom, taps, double taps, and long-press-then-drag box selection.
 */
export function attachGestures(el: HTMLElement, camera: () => Camera | null, handlers: GestureHandlers = {}): void {
  const pointers = new Map<number, Pt>();
  let start: (Pt & { t: number }) | null = null;
  let dragging = false;
  let boxing = false;
  let longTimer = 0;
  let pinchDist = 0;
  let samples: Array<{ x: number; y: number; t: number }> = [];
  let lastTap: (Pt & { t: number }) | null = null;
  /** The current touch is dragging something the handler claimed (e.g. a placement ghost). */
  let claimed = false;

  const mid = (): Pt => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const cancelLong = () => {
    clearTimeout(longTimer);
    longTimer = 0;
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    camera()?.stop();
    if (pointers.size === 1) {
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
      boxing = false;
      claimed = !!handlers.onDragStart?.(e.clientX, e.clientY);
      samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      cancelLong();
      if (handlers.onBox && !claimed)
        longTimer = window.setTimeout(() => {
          if (!start || dragging || pointers.size !== 1) return;
          boxing = true;
          handlers.onLongPress?.(start.x, start.y);
          handlers.onBox?.(start.x, start.y, start.x, start.y, false);
        }, LONG_PRESS_MS);
    } else if (pointers.size === 2) {
      cancelLong();
      if (boxing && start) handlers.onBox?.(start.x, start.y, start.x, start.y, true);
      boxing = false;
      start = null; // a second finger cancels any tap
      pinchDist = spread();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    const cam = camera();
    if (!p || !cam) return;
    if (pointers.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (boxing && start) {
        handlers.onBox?.(start.x, start.y, e.clientX, e.clientY, false);
        return;
      }
      if (claimed) {
        handlers.onDrag?.(e.clientX, e.clientY);
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) dragging = true;
        return;
      }
      if (!dragging && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) {
        dragging = true;
        cancelLong();
      }
      if (dragging) {
        cam.panBy(dx, dy);
        const now = performance.now();
        samples.push({ x: e.clientX, y: e.clientY, t: now });
        while (samples.length > 2 && now - samples[0].t > FLING_WINDOW) samples.shift();
      }
    } else if (pointers.size === 2) {
      const before = mid();
      p.x = e.clientX;
      p.y = e.clientY;
      const after = mid();
      cam.panBy(after.x - before.x, after.y - before.y);
      const ratio = spread() / pinchDist;
      if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
        cam.zoomStep(ratio > 1 ? 1 : -1, after.x, after.y);
        pinchDist = spread();
      }
    }
  });

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const cam = camera();
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    cancelLong();
    if (wasSingle && claimed) {
      claimed = false;
      handlers.onDragEnd?.();
      // A tap on the ghost without moving still counts as a tap.
      if (!dragging && e.type === 'pointerup') handlers.onTap?.(e.clientX, e.clientY);
      start = null;
      return;
    }
    if (wasSingle && cam) {
      if (boxing && start) {
        handlers.onBox?.(start.x, start.y, e.clientX, e.clientY, true);
      } else if (!dragging && start && performance.now() - start.t < TAP_MAX_MS && e.type === 'pointerup') {
        const now = performance.now();
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX) {
          handlers.onDoubleTap?.(e.clientX, e.clientY);
          lastTap = null;
        } else {
          handlers.onTap?.(e.clientX, e.clientY);
          lastTap = { x: e.clientX, y: e.clientY, t: now };
        }
      } else if (dragging && samples.length >= 2) {
        const a = samples[0], b = samples[samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0 && performance.now() - b.t < 60) cam.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
      }
      start = null;
      boxing = false;
    } else if (pointers.size === 1) {
      // Lifting one finger of a pinch continues as a pan with the other, never a tap.
      const [rest] = [...pointers.values()];
      start = null;
      dragging = true;
      samples = [{ x: rest.x, y: rest.y, t: performance.now() }];
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 4) return;
      camera()?.zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    },
    { passive: false },
  );
}
