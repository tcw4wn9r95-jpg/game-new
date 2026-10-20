/** Device pixel ratio is capped at 2 to keep fill-rate sane on 3x iPhones. */
export const MAX_DPR = 2;

export interface View {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
}

export function createView(canvas: HTMLCanvasElement): View {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D not supported');
  const view: View = { ctx, width: 0, height: 0, dpr: 1 };

  const resize = () => {
    view.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  };
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  return view;
}
