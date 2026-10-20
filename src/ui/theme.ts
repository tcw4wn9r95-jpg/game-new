// Fonts (bundled, so they work offline) and the gilded frame used by every panel.
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './ui.css';
import { pnoise } from '../render/textures';

const dataUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;

/** 48x48 nine-slice frame: dark rim, gold bevel, inner hairline and corner studs. */
const FRAME = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6df98"/><stop offset=".45" stop-color="#c79639"/><stop offset="1" stop-color="#7d5519"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" fill="none" stroke="#120a03" stroke-width="2"/>
  <rect x="3" y="3" width="42" height="42" fill="none" stroke="url(#g)" stroke-width="2.4"/>
  <rect x="6.5" y="6.5" width="35" height="35" fill="none" stroke="#5c3f12" stroke-width="1"/>
  <g fill="url(#g)" stroke="#120a03" stroke-width=".8">
    <path d="M4 0.5L7.5 4 4 7.5 0.5 4z"/><path d="M44 0.5L47.5 4 44 7.5 40.5 4z"/>
    <path d="M4 40.5L7.5 44 4 47.5 0.5 44z"/><path d="M44 40.5L47.5 44 44 47.5 40.5 44z"/>
  </g>
</svg>`;

/** Lighter frame for buttons and cards. */
const FRAME_THIN = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6df98"/><stop offset=".5" stop-color="#b8862f"/><stop offset="1" stop-color="#6e4a14"/>
    </linearGradient>
  </defs>
  <rect x=".75" y=".75" width="22.5" height="22.5" rx="3" fill="none" stroke="#120a03" stroke-width="1.5"/>
  <rect x="2.25" y="2.25" width="19.5" height="19.5" rx="2" fill="none" stroke="url(#g)" stroke-width="1.6"/>
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

/** Planed timber: long grain along x, darker growth rings, a few pores. */
function wood(dark: boolean): string {
  const W = 256, H = 128;
  const lo = dark ? [26, 16, 8] : [44, 28, 14], hi = dark ? [60, 38, 20] : [98, 64, 34];
  return texture(W, H, (x, y) => {
    const warp = tnoise(x, y, W, H, 2, 4, 3) * 6;
    const grain = tnoise(x, y + warp * 4, W, H, 2, 24, 7, 2);
    const ring = Math.pow(Math.abs(Math.sin((y / H) * Math.PI * 18 + warp)), 6);
    const t = Math.min(1, Math.max(0, 0.45 + (grain - 0.5) * 1.3 - ring * 0.28 + (tnoise(x, y, W, H, 8, 8, 11) - 0.5) * 0.25));
    return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t];
  });
}

/** Aged parchment: warm paper with soft blotches and fibres. */
function parchment(): string {
  const W = 256;
  return texture(W, W, (x, y) => {
    const blot = tnoise(x, y, W, W, 3, 3, 21);
    const fibre = tnoise(x, y, W, W, 16, 4, 23, 2);
    const t = 0.55 + (blot - 0.5) * 0.7 + (fibre - 0.5) * 0.25;
    return [196 + 46 * t, 176 + 42 * t, 132 + 36 * t];
  });
}

export function installTheme(): void {
  const root = document.documentElement.style;
  root.setProperty('--frame', dataUrl(FRAME));
  root.setProperty('--frame-thin', dataUrl(FRAME_THIN));
  const light = 'linear-gradient(180deg, rgba(255,226,170,0.10), rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.32))';
  root.setProperty('--wood', `${light}, url(${wood(false)}) 0 0 / 256px 128px repeat`);
  root.setProperty('--wood-dark', `${light}, url(${wood(true)}) 0 0 / 256px 128px repeat`);
  root.setProperty('--parchment', `radial-gradient(ellipse at center, rgba(255,250,230,0.2), rgba(90,60,20,0.25)), url(${parchment()}) 0 0 / 256px 256px repeat`);
}
