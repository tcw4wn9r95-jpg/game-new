#!/bin/bash
# Runs the M9 acceptance matches in parallel and prints one JSON line per match.
# Usage: scripts/aibatch.sh <map> <ai0> <ai1> <seeds...>
cd "$(dirname "$0")/.."
map=$1; a=$2; b=$3; shift 3
for s in "$@"; do echo "$s"; done | xargs -P 4 -I{} sh -c "node dist-scripts/aimatch.mjs $map standard {} $a $b 150 | tail -1"
