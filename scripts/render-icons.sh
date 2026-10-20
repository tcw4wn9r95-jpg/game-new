#!/bin/bash
# Regenerates build/icons/*.png from the emblem in src/ui/logo.ts.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist-scripts
npx esbuild src/ui/logo.ts --bundle --format=esm --platform=node --outfile=dist-scripts/logo.mjs --log-level=warning
LOGO_MODULE="$PWD/dist-scripts/logo.mjs" PLAYWRIGHT="${PLAYWRIGHT:-/opt/node-tools/node_modules/playwright}" node scripts/render-icons.mjs build/icons
