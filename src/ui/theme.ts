// Fonts (bundled, so they work offline) and the tactical frame used by every panel.
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-800.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-700.css';
import './ui.css';
import { pnoise } from '../render/textures';

const dataUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;

/** 48x48 nine-slice frame: dark rim, cyan-lit bevel with clipped corners and tick marks. */
const FRAME = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bff4ff"/><stop offset=".45" stop-color="#38c8f0"/><stop offset="1" stop-color="#16607e"/>
    </linearGradient>
  </defs>
  <path d="M9 1H39L47 9V39L39 47H9L1 39V9Z" fill="none" stroke="#04070b" stroke-width="2"/>
  <path d="M9.5 3H38.5L45 9.5V38.5L38.5 45H9.5L3 38.5V9.5Z" fill="none" stroke="url(#g)" stroke-width="1.6"/>
  <path d="M10 6.5H38M10 41.5H38M6.5 10V38M41.5 10V38" stroke="#1b4a60" stroke-width="1"/>
  <g fill="#7fe6ff">
    <rect x="3" y="3" width="5" height="1.6"/><rect x="3" y="3" width="1.6" height="5"/>
    <rect x="40" y="3" width="5" height="1.6"/><rect x="43.4" y="3" width="1.6" height="5"/>
    <rect x="3" y="43.4" width="5" height="1.6"/><rect x="3" y="40" width="1.6" height="5"/>
    <rect x="40" y="43.4" width="5" height="1.6"/><rect x="43.4" y="40" width="1.6" height="5"/>
  </g>
</svg>`;

/** Lighter frame for buttons and cards: a thin cyan outline with chamfered corners. */
const FRAME_THIN = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bff4ff"/><stop offset=".5" stop-color="#2fb4dc"/><stop offset="1" stop-color="#145a76"/>
    </linearGradient>
  </defs>
  <path d="M5 .75H23.25V19L19 23.25H.75V5Z" fill="none" stroke="#04070b" stroke-width="1.5"/>
  <path d="M5.6 2.25H21.75V18.4L18.4 21.75H2.25V5.6Z" fill="none" stroke="url(#g)" stroke-width="1.4"/>
</svg>`;

type Pixel = (x: number, y: number) => [number, number, number];

function texture(w: number, h: number, px: Pixel): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, gg, b] = px(x, y);
      img.data.set([r, gg, b, 255], (y * w + x) * 4);
    }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Seamless fractal noise over a w x h texture; cx, cy = base cells across each axis. */
function tnoise(x: number, y: number, w: number, h: number, cx: number, cy: number, seed: number, octaves = 3): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const fx = cx << o, fy = cy << o;
    sum += pnoise((x / w) * fx, (y / h) * fy, fx, fy, seed + o) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Brushed gunmetal: fine horizontal grain over a soft fractal mottling. */
function gunmetal(dark: boolean): string {
  const W = 256, H = 128;
  const lo = dark ? [10, 14, 20] : [20, 28, 38], hi = dark ? [26, 34, 44] : [42, 54, 68];
  return texture(W, H, (x, y) => {
    const brush = tnoise(x, y, W, H, 1, 48, 5, 2);
    const mottle = tnoise(x, y, W, H, 4, 4, 9);
    const t = Math.min(1, Math.max(0, 0.4 + (brush - 0.5) * 0.5 + (mottle - 0.5) * 0.6));
    return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t];
  });
}

/** Tactical display glass: deep blue with a faint grid and scan lines. */
function glass(): string {
  const W = 256;
  return texture(W, W, (x, y) => {
    const glow = tnoise(x, y, W, W, 3, 3, 21);
    const grid = x % 32 === 0 || y % 32 === 0 ? 0.35 : x % 8 === 0 || y % 8 === 0 ? 0.1 : 0;
    const scan = y % 3 === 0 ? -0.05 : 0;
    const t = 0.3 + (glow - 0.5) * 0.4 + grid + scan;
    return [14 + 30 * t, 26 + 54 * t, 40 + 74 * t];
  });
}

export function installTheme(): void {
  const root = document.documentElement.style;
  root.setProperty('--frame', dataUrl(FRAME));
  root.setProperty('--frame-thin', dataUrl(FRAME_THIN));
  const light = 'linear-gradient(180deg, rgba(150,220,255,0.10), rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.35))';
  root.setProperty('--wood', `${light}, url(${gunmetal(false)}) 0 0 / 256px 128px repeat`);
  root.setProperty('--wood-dark', `${light}, url(${gunmetal(true)}) 0 0 / 256px 128px repeat`);
  root.setProperty('--parchment', `radial-gradient(ellipse at center, rgba(80,200,255,0.12), rgba(0,10,20,0.4)), url(${glass()}) 0 0 / 256px 256px repeat`);
}
