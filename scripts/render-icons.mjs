// Renders the app icons from the emblem (src/ui/logo.ts) with Chromium.
// Run scripts/render-icons.sh; the PNGs land in build/icons/ and are committed.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
const { emblemSvg } = await import(process.env.LOGO_MODULE);
const out = process.argv[2];
const svg = emblemSvg();
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const shot = async (size, scale, file, bg = true) => {
  const h = Math.round(size * scale), w = Math.round(h * 120 / 150);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
    background:${bg ? 'radial-gradient(circle at 50% 42%, #3d2a14 0%, #1e1309 55%, #0c0704 100%)' : 'transparent'}">
    <div style="width:${w}px;height:${h}px;filter:drop-shadow(0 ${size / 60}px ${size / 40}px rgba(0,0,0,.8))">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body></html>`);
  await page.screenshot({ path: `${out}/${file}`, omitBackground: !bg });
};
await shot(180, 0.86, 'apple-touch-icon.png');
await shot(192, 0.86, 'icon-192.png');
await shot(512, 0.86, 'icon-512.png');
await shot(512, 0.68, 'icon-maskable-512.png');
await shot(32, 0.96, 'favicon-32.png', false);
await browser.close();
