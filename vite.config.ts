import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { pwa } from './build/pwa';

function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // GitHub Pages serves the site at /<repo-name>/.
  base: process.env.BASE_PATH ?? '/game/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [pwa()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
