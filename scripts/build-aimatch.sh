#!/bin/sh
# Bundles the headless AI match runner for node.
cd "$(dirname "$0")/.." && npx esbuild scripts/aimatch.ts --bundle --platform=node --format=esm --outfile=dist-scripts/aimatch.mjs --define:__BUILD_ID__='"script"' --log-level=warning
