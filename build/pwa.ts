// Vite plugin that makes the build an installable, offline-capable iOS web app:
// - emits the icons (build/icons, rendered from the emblem) and manifest.webmanifest
// - injects the iOS/PWA <head> tags
// - writes sw.js with a precache list of every emitted file and a content hash
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const APP_NAME = 'Hearth & Crown';
const THEME = '#140c05';

const ICONS: Array<{ file: string; size: number; purpose?: string }> = [
  { file: 'icons/apple-touch-icon.png', size: 180 },
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/icon-maskable-512.png', size: 512, purpose: 'maskable' },
  { file: 'icons/favicon-32.png', size: 32 },
];

function manifest(): string {
  return JSON.stringify(
    {
      name: APP_NAME,
      short_name: 'Hearth&Crown',
      description: 'A medieval real-time strategy game.',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'landscape',
      background_color: THEME,
      theme_color: THEME,
      icons: ICONS.filter((i) => i.size >= 192).map((i) => ({
        src: i.file,
        sizes: `${i.size}x${i.size}`,
        type: 'image/png',
        purpose: i.purpose ?? 'any',
      })),
    },
    null,
    2,
  );
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function serviceWorker(version: string, files: string[]): string {
  return readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
    .replace('__VERSION__', JSON.stringify(version))
    .replace('__PRECACHE__', JSON.stringify(files));
}

export function pwa(): Plugin {
  let config: ResolvedConfig;
  const iconCache = new Map<string, Buffer>();
  const icon = (i: (typeof ICONS)[number]) => {
    // Rendered from the emblem by scripts/render-icons.sh.
    if (!iconCache.has(i.file)) iconCache.set(i.file, readFileSync(new URL(`./icons/${i.file.split('/').pop()}`, import.meta.url)));
    return iconCache.get(i.file)!;
  };

  return {
    name: 'hearth-pwa',
    configResolved(c) {
      config = c;
    },
    transformIndexHtml() {
      const base = config.base;
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}icons/apple-touch-icon.png` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: `${base}icons/favicon-32.png` }, injectTo: 'head' },
      ];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0].slice(config.base.length);
        const i = ICONS.find((x) => x.file === path);
        if (i) {
          res.setHeader('Content-Type', 'image/png');
          res.end(icon(i));
        } else if (path === 'manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest());
        } else next();
      });
    },
    generateBundle() {
      for (const i of ICONS) this.emitFile({ type: 'asset', fileName: i.file, source: icon(i) });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
    },
    closeBundle() {
      if (config.command !== 'build') return;
      const outDir = config.build.outDir;
      const files = listFiles(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      // './' covers navigations to the app root; everything else is a real file.
      writeFileSync(join(outDir, 'sw.js'), serviceWorker(version, ['./', ...files]));
    },
  };
}
