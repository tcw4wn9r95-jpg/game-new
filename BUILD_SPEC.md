# Hearth & Crown: Build Spec for Claude Code

A single-player, real-time strategy game for iPhone, played in Safari or installed to the Home Screen, hosted on GitHub Pages. Inspired by what made Age of Empires II work. All names, art and text are original. Do not use Age of Empires names, logos, unit art, sounds or civilization flavor text.

How to use this file: put it in the repo root as `BUILD_SPEC.md`, then tell Claude Code: "Read BUILD_SPEC.md and build milestone M0. Stop at the end of each milestone, run the acceptance checks, and tell me what to test on my phone."

---

## 1. What made Age of Empires succeed, and the rule each one becomes

| Success factor (from research) | Design rule for this game |
|---|---|
| Easy to learn, hard to master. The opening is deliberately slow so players can plan, and many playstyles can win. | Long, calm opening: no enemy attacks before minute 8 on Normal. Several game modes and win conditions so turtling, booming and rushing can all succeed. |
| Economy is half the game: four resources, villagers who gather and build, macro rewarded as much as battle tactics. | Four resources (Food, Wood, Gold, Stone). Villagers are the economic engine. Idle villagers are the main mistake a player can make, so the UI surfaces them constantly. |
| Ages as a growth spine: four ages that feel like technological leaps. | Four ages. Advancing costs resources and time, unlocks units, buildings and visual changes. It is the big strategic bet of each match. |
| Rock-paper-scissors counters, tuned so casual players are not punished. Ensemble's rule: in casual play a counter is about 2x, not 5x. | Counter multipliers between 1.5x and 2.5x for units. Siege vs buildings is the one exception (up to 4x), because walls must be breakable. Every unit shows a "strong vs / weak vs" line. |
| Civilizations share one core ruleset but each has small bonuses and a unique unit. | Four factions, same tech tree base, 2 bonuses plus 1 unique unit each. Learning one faction teaches all of them. |
| Historical theme made units instantly readable. | Medieval setting, no fantasy. Unit roles must be obvious from silhouette. |
| UI clarity: dense information organized, not hidden. | Every resource, pop count, age progress and idle count visible at all times without opening menus. |
| AoE II fixed the first game's complaints: unit pathing and a weak AI. | Pathfinding (including around walls and across water) and the AI opponent are first-class features with their own milestones. |
| Focus. AoK's team admits the design drifted when they piled on features; the creator called AoE III's "too much new" approach a huge mistake. | Scope is fixed by this doc. If a feature is not listed here, do not add it. |
| Campaigns taught the game through real scenarios. | A guided first match (tutorial) instead of text help screens. |

## 2. Mobile adaptation

- **Match length:** matches are meant to be long and played across several sittings.
  | Map size | Tiles | Target length | Pop cap |
  |---|---|---|---|
  | Skirmish | 160x160 | 30 to 40 min | 150 |
  | Standard | 224x224 | 45 to 70 min | 200 |
  | Epic | 288x288 | 75 to 120 min | 200 |
  Maps are deliberately large so cities have room to grow (revised after M1 playtest).
  Length comes from bigger maps, more resources, slower age-ups, walls that make attacking costly, and an optional **Peace Treaty** timer (Off / 10 / 20 / 30 min) during which no one can attack.
- **Saving across sessions is essential.** Autosave every 30 s, on `visibilitychange`, and on every age-up. Three save slots. Match clock and stats persist.
- **Pause is a feature.** Issue orders while paused. Game speed: 1x, 1.5x, 2x, 3x (3x for the quiet booming phases).
- **Vs AI only, offline.** 1v1, 1v2, or 2v2 with an AI ally. No network calls after first load.
- **Automation where PC demands micro:** villagers auto-return and resume; farms and fish traps auto-reseed (toggle); repeat production queues; rally points; idle fishing ships auto-find new fish.
- **Landscape only.** Show a "rotate your phone" screen in portrait.

## 3. Platform and tech constraints

- Static site on GitHub Pages. **Vite + TypeScript**, deployed with GitHub Actions. No backend.
- Rendering: **HTML5 Canvas 2D**, top-down 3/4 view on a square tile grid. Chunked terrain rendering (8x8-tile chunks cached to offscreen canvases, built under a per-frame time budget) so large maps stay fast.
- **All art is procedurally drawn in code** and cached at startup. No external image assets. Faction = color tint plus banner shape.
- Audio: Web Audio API, synthesized SFX. Unlock audio on first tap.
- **iOS web app requirements:**
  - `manifest.webmanifest` with `display: standalone`, `orientation: landscape`, icons generated at build time.
  - `apple-mobile-web-app-capable`, status bar `black-translucent`, `viewport-fit=cover`.
  - Respect `env(safe-area-inset-*)`.
  - `touch-action: none` on the canvas, block page zoom, text selection and long-press callout.
  - Service worker caches everything for offline play. Vite `base` set to the repo name.
  - Cap `devicePixelRatio` at 2.
- **Performance budget:** 60 fps on iPhone 12 or newer with 200 units per player alive and 150 on screen. Simulation at fixed 10 ticks/s, render interpolates. Spatial hash for queries. Pathfinding budget: max 4 ms per tick, queued requests spread across ticks.
- **Determinism:** seeded RNG for map gen and AI.
- **Save size:** compress saves (e.g. lz-string) to stay well under the ~5 MB `localStorage` limit; fall back to IndexedDB if needed.

## 4. Code architecture

```
src/
  main.ts            boot, resize, loop
  sim/               pure game logic, no DOM, unit-testable
    world.ts         entities, tick()
    economy.ts       gathering, drop-off, costs
    combat.ts        damage, armor, counters, projectiles, area damage
    fortify.ts       walls, gates, towers, garrison
    naval.ts         ships, transport load/unload, fishing
    modes/           standard.ts, regicide.ts, domination.ts
    pathfinding.ts   hierarchical A* (land + water layers) + flow fields
    ai/              opponent brain
    mapgen.ts
  render/            canvas drawing, sprite cache, camera, fog
  input/             touch gestures -> commands
  ui/                HUD, panels (DOM overlay)
  data/              units.json, buildings.json, techs.json, factions.json, modes.json
  save.ts
tests/               vitest for sim; playwright smoke test at iPhone viewport
```

Rules:
- **Data-driven balance.** All numbers live in `data/*.json`.
- The sim never imports from render or ui. Input and AI both produce the same command objects.
- Pathfinding uses two navigation layers: land (blocked by walls, water, buildings) and water (deep and shallow water). Gates are passable only for their owner and allies. When walls change, invalidate only the affected regions.
- HUD and menus are DOM over the canvas. Minimum tap target 44x44 pt.

## 5. Core game rules

### Resources and gathering
| Resource | Sources | Base rate (per gatherer/sec) |
|---|---|---|
| Food | Berries, deer, sheep, farms, fish (shore or by fishing ship), fish traps | 0.35 / 0.40 / 0.40 / 0.30 / 0.45 / 0.28 |
| Wood | Trees | 0.38 |
| Gold | Gold mines, Market trade | 0.36 |
| Stone | Stone mines | 0.34 |

Villagers carry 10 (fishing ships 15) then return to the nearest valid drop-off: Town Center, Lumber Camp, Mining Camp, Mill, Dock (fish). Resource amounts are scaled for long games: Standard maps have roughly 2x the gold and stone of a short-match map, with extra contested deposits in the middle and on islands.

### Starting position
Town Center, 3 villagers, 1 scout, 200 Food, 200 Wood, 100 Gold, 200 Stone. Houses +5 pop, Town Center +5. Regicide start differs (see Game Modes).

### The four ages
| Age | Cost | Research time | Requirement | Key unlocks |
|---|---|---|---|---|
| I. Settlement | start | | | Villager, Militia, House, Camps, Mill, Dock, Barracks, Palisade Wall, Palisade Gate |
| II. Township | 500 Food | 160 s | 2 Age I buildings | Archery Range, Stable, Market, Blacksmith, Stone Wall, Gate, Watch Tower, warships |
| III. Stronghold | 800 Food, 200 Gold | 220 s | 2 Age II buildings | Castle, Siege Workshop, Monastery, University, Guard Tower, Siege Tower, Mangonel, Ram |
| IV. Dominion | 1000 Food, 800 Gold | 280 s | Castle or 2 Age III buildings | Wonder, Fortified Wall, Keep, Trebuchet, Siege Barge, top upgrades |

The Town Center cannot train villagers while researching an age.

### Land units and counters
Damage = max(1, attack x counter multiplier minus armor).

| Unit | Building | Age | Cost | Strong vs | Weak vs |
|---|---|---|---|---|---|
| Villager | Town Center | I | 50F | | everything; can repair and build |
| Militia → Swordsman | Barracks | I/III | 60F 20G | Infantry, buildings | Archers |
| Spearman → Pikeman | Barracks | II/III | 35F 25W | Cavalry (2.5x) | Archers, infantry |
| Archer → Crossbowman | Archery Range | II/III | 25W 45G | Infantry, spearmen | Skirmishers, cavalry, siege |
| Skirmisher | Archery Range | II | 25F 35W | Archers (2x) | Infantry, cavalry |
| Scout → Light Cavalry | Stable | I/III | 80F | Archers, villagers, siege | Spearmen |
| Knight | Stable | III | 60F 75G | Archers, infantry, siege | Spearmen, monks |
| Monk | Monastery | III | 100G | Converts, heals | Light cavalry |
| King | Regicide only | | not trainable | | everything |

### Siege weapons
Siege is the answer to walls. Every siege unit is vulnerable to melee cavalry and infantry, so it needs an escort.

| Unit | Age | Cost | Role | Notes |
|---|---|---|---|---|
| Ram → Capped Ram | III/IV | 160W 75G | Breaks gates, walls, buildings (4x vs buildings) | Melee only. Immune-ish to arrows (high pierce armor). Garrison up to 4 infantry to move faster. Cannot hit units. |
| Mangonel → Onager | III/IV | 160W 135G | Area damage vs groups, decent vs walls (2x) | Friendly fire. Minimum range 3 tiles. Attack-ground command. |
| Scorpion | III | 75W 75G | Bolt pierces through lines of units | Weak vs buildings. |
| Siege Tower | III | 200W 160G | Carries 8 infantry, unloads them on top of a wall section into the enemy town | Takes heavy arrow fire; no attack of its own. |
| Trebuchet | IV | 200W 200G | Longest range (16 tiles), 4x vs walls and buildings | Must **pack** to move and **unpack** to fire (5 s each). Cannot hit moving units reliably. Trained at the Castle. |
| Petard (Sapper) | III | 65F 20G | Suicide charge, huge damage to one wall segment or gate | Foot unit, trained at Castle. |

Technologies: Siege Engineers (+1 range, +20% vs buildings), Ballistics (projectiles lead moving targets), Sappers (villagers +15 attack vs buildings).

### Walls and fortifications
Building and upgrading defenses is a full strategy path, not a side feature.

| Structure | Age | Cost per tile | HP per segment | Notes |
|---|---|---|---|---|
| Palisade Wall | I | 2W | 250 | Cheap, quick, burns down fast. Good for blocking early raids. |
| Palisade Gate | I | 30W | 400 | Opens for owner and allies only. Can be locked. |
| Stone Wall | II | 5S | 1800 | The main town wall. |
| Gate | II | 30S | 2750 | Lockable. Opens for owner and allies only. |
| Fortified Wall (upgrade) | IV | tech | +60% HP | Upgrades every existing stone wall in place. |
| Watch Tower → Guard Tower → Keep | II/III/IV | 25W 125S | 1000 / 1500 / 2250 | Shoots arrows. Garrison up to 5 villagers or infantry, each adds one arrow. Upgrades apply to all towers. |
| Castle | III | 650S | 4800 | Fires many arrows, trains unique unit, Trebuchet and Petard, garrison 20. Hard to kill without siege. |

Defensive technologies (Blacksmith/University): Masonry (+10% building HP, +1 armor), Architecture (+10% more), Hoardings (Castle +20% HP), Murder Holes (towers hit units adjacent to them, removes minimum range), Arrowslits (+1 tower attack), Heated Shot (towers +100% vs ships), Treadmill Crane (villagers build 20% faster).

**Rules for walls:**
- Walls block pathing for everyone except through own/allied gates.
- Villagers repair walls and towers at 50% of build cost per HP restored.
- Damaged walls show visible cracks at 66% and 33% HP; destroyed segments leave rubble that is passable and can be rebuilt on.
- The AI must handle walls: Normal and Hard bring siege when they detect walls, and look for the weakest or unfinished segment.

**Wall placement on touch:**
1. Pick a wall type from the build sheet.
2. Tap a start tile, drag to an end tile. A ghost line snaps to the grid (straight or 45° diagonal) and shows total cost and segment count.
3. Lift finger to set the line; keep adding lines to chain corners.
4. Tap any segment in the ghost to convert it to a gate.
5. Confirm with the check button. All selected villagers are assigned to build the whole line, nearest segment first.

### Naval units
New building: **Dock** (Age I, 150W), placed on shore with at least one water tile adjacent. Dock is also a food drop-off.

| Unit | Age | Cost | Strong vs | Weak vs | Notes |
|---|---|---|---|---|---|
| Fishing Ship | I | 75W | | everything | Gathers deep-water fish, builds Fish Traps (renewable food) |
| Transport Ship | II | 125W | | everything | Carries 10 land units. Tap transport, then tap a shore point to unload. |
| Galley → War Galley | II/III | 90W 30G | Fire Ships, Demolition Rafts, shoreline units | Siege Barges | Ranged |
| Fire Ship | II | 75W 45G | Galleys (2x), at close range | Siege Barges, Demolition Rafts | Short-range flame |
| Demolition Raft | III | 70W 50G | Ships in a group, docks | Galleys | Explodes on contact |
| Siege Barge | IV | 200W 150G | Buildings and walls on the coast (3x), Fire Ships | Galleys | Long range, slow, minimum range |

Naval tech: Careening (+1 ship armor), Dry Dock (ships +15% speed, Dock trains faster), Shipwright (ships cost 20% less wood). Coastal towers and Castles hit ships; Heated Shot boosts that.

Water rules: deep water is ship-only. Shallow water (fords) is walkable for land units and blocks ships. Coastal buildings can be hit by ships.

### Technologies
Blacksmith attack and armor lines for infantry, archers, cavalry. Economy: Double-bit Axe, Bow Saw, Gold Mining, Stone Mining, Horse Collar, Heavy Plow, Wheelbarrow, Hand Cart, Gillnets (fishing +25%). Town Center: Loom, Town Watch (+line of sight). Plus the siege, naval and defense techs above. About 35 techs total. No more.

### Factions
| Faction | Bonus 1 | Bonus 2 | Unique unit |
|---|---|---|---|
| Highland Clans | Villagers chop wood 15% faster | Infantry +10% HP | Claymore Warrior (heavy infantry, cleave damage) |
| Steppe Riders | Stables work 20% faster | Cavalry cost 10% less | Horse Archer (mobile ranged cavalry) |
| Coastal League | Ships +10% HP and Docks cost half | Market fees halved | Arbalest Guard (long-range archer) |
| Mountain Throne | Walls and towers cost 20% less stone | Buildings +15% HP | Iron Bear Rider (slow heavy cavalry, very high HP) |

Mountain Throne is the natural turtle/wall faction; Coastal League is the natural naval faction. This gives each new feature a faction that showcases it.

## 6. Game modes

Chosen on the setup screen together with map type, map size, difficulty, faction and Peace Treaty.

### Standard
Win by any of:
1. **Conquest:** destroy all enemy Town Centers, Castles, Docks and military units (ships included).
2. **Wonder:** build a Wonder (Age IV, 1000 of each resource, long build) and keep it standing **8 minutes**.
3. **Relics:** 5 relics on the map; garrison all in your Monasteries for **8 minutes**.

### Regicide
- Each player starts with a **King** inside a pre-built **Castle**, plus 6 villagers and 1 scout, and +300 Stone.
- **Lose your King, lose the game.** Win by killing the enemy King (Conquest and Wonder also still win).
- The King is slow, has 75 HP, little attack, a large line of sight, and can garrison in Castles, towers and Transport Ships. When garrisoned, a crown icon shows on that building.
- A pulsing crown icon on the minimap shows your King. Enemy King is shown only when visible.
- HUD gets a dedicated **King button** that centers the camera on him; double-tap garrisons him in the nearest safe building.
- Alert when your King is attacked or the building holding him drops below 50% HP.
- This mode makes walls and Castles central: protect your King, siege theirs.

### Domination
- The map has **5 Banner Sites** (3 on Skirmish), placed symmetrically: one near each base, the rest contested, and on water maps at least one on an island.
- Capture a site by having units within 4 tiles of it with no enemy units present for 20 s. Building a tower or Castle within range speeds capture by 50% (rewards fortifying the points).
- Each held site gives **1 point every 5 seconds** and a small trickle of gold.
- **Win:** first to **1000 points** (Standard; 700 Skirmish, 1500 Epic), or hold **every** site continuously for 3 minutes. Conquest still wins too.
- Score bar at the top shows each side's points and site colors.
- Sites are neutral and unclaimable during the Peace Treaty.

## 7. Map types

| Map | Description |
|---|---|
| Heartland | All land, rivers with fords. Best for walls and siege. |
| Coastal | Land map with a sea on one side; naval control secures fish and a second front. |
| Lakes | Land with a central lake; docks optional but useful. |
| Islands | Each player on their own island plus neutral islands with gold and relics. Transport ships required to attack. Naval play is mandatory. |

Procedural, seeded. Every start has a forest line, berries, sheep, deer, gold and stone close, and shore fish if water is near. Hills give +25% ranged damage downhill. Fog of war with explored/unexplored/visible states.

## 8. Touch controls

| Gesture | Action |
|---|---|
| Tap unit/building | Select |
| Tap ground with selection | Move |
| Tap resource / enemy / own building | Context command: gather / attack / drop-off, garrison or repair |
| Tap water with land units selected | Auto-route through nearest own Transport if one is available, otherwise "no path" toast |
| Long-press then drag | Box select |
| Double-tap a unit | Select all of that type on screen |
| One-finger drag on empty map | Pan camera |
| Two-finger pinch | Zoom (4 levels, the closest for watching units work) |
| Tap minimap | Jump camera |

HUD (always visible): idle villager button with count, idle army button, select-all-military, select-all-ships, King button (Regicide), pause, speed, menu. Build sheet grouped by age with tabs: Economy, Military, Defense, Naval. Command panel for the selection: train queue, stance, formation, stop, delete, plus context buttons (Pack/Unpack for Trebuchet, Attack Ground for Mangonel, Unload for Transport and Siege Tower, Lock/Unlock for gates, Ungarrison). Resource bar top. "Under attack" toasts with tap-to-jump; distinct sounds for town, wall, ship and King alerts.

## 9. AI opponent

Build-order driven, then reactive. Script stored in data:
1. Follow a build order with villager targets per age and gather ratios.
2. On water maps, build Docks and fishing early, contest water with warships, use Transports to land armies (Islands requires this).
3. Scout and counter-build against the player's most common unit type.
4. **Walls:** Hard walls its base with palisade in Age I and stone in Age II, plus towers at chokepoints. Normal walls partially. Easy never walls.
5. **Siege:** when its target is walled, bring rams and mangonels (Age III) or trebuchets (Age IV) with an escort, and target the gate or the weakest segment.
6. Attack in waves when army value exceeds a threshold; retreat damaged units; repair walls between waves.
7. **Mode logic:** Regicide: keep the King garrisoned in the Castle, raise a defense force when the Castle is threatened, send a strike force at the enemy King's last known location. Domination: split army between holding owned sites and contesting the nearest enemy site, build towers at owned sites.
8. Respect the Peace Treaty: no attacks, but builds up economy and defenses.

Difficulty changes villager cap, reaction delay, wave thresholds, counter-building, walling and siege use, and gather bonus on Hard only (+10%, disclosed in the menu). Easy never attacks before minute 15.

## 10. Feel and juice

- Units bob walking, swing when attacking or gathering. Ships rock on water with a small wake.
- Floating "+10" on resource drop-off.
- Projectiles visible: arrows, mangonel stones with a shadow arc, trebuchet boulders with a long arc and dust burst on impact.
- Walls crumble into rubble with a debris puff; gates swing open when units pass.
- Age-up fanfare; buildings redraw in upgraded styles (thatch → timber → stone → ornate). Walls and towers change look with their upgrades.
- Banner Sites change color as capture progresses with a filling ring.
- High-contrast palette that reads in sunlight.

## 11. Milestones and acceptance checks

Stop after each and report what to test on the phone.

- **M0 Scaffold & deploy.** Vite+TS, GitHub Actions to Pages, PWA, service worker, landscape lock, canvas with fps counter. ✔ Opens full-screen from Home Screen; works in airplane mode on second launch.
- **M1 Map & camera.** Seeded map gen for all four map types, chunked rendering, pan, zoom, minimap, fog. ✔ 60 fps panning on a 288x288 Epic map.
- **M2 Villagers & economy.** Selection, A* on land layer, gather/carry/drop-off, houses, camps, resource HUD, idle villager button. ✔ 30 villagers gather 10 sim-minutes headless without getting stuck.
- **M3 Buildings & production.** Placement, construction, queues, rally points, pop cap. ✔ Full Age I economy by touch alone.
- **M4 Combat.** Age I to III land units, counters, armor, stances, flow-field group movement. ✔ Tests: 10 spearmen beat 10 scouts; 10 archers beat 10 militia; 10 skirmishers beat 10 archers.
- **M5 Ages & tech.** Age research, unlock gating, restyles, economy and blacksmith techs. ✔ Reach Age IV in roughly 30 to 40 min on Standard at a normal pace.
- **M6 Walls & fortifications.** Drag-to-place wall lines, gates with lock, towers with garrison arrows, Castle, repairs, rubble, defense techs, pathfinding invalidation. ✔ Units route through own gate and cannot pass enemy walls; a closed wall ring makes the enemy unreachable by land units without siege.
- **M7 Siege.** Ram, Mangonel, Scorpion, Siege Tower, Trebuchet pack/unpack, Petard, attack-ground, friendly fire. ✔ Tests: 4 rams break a stone gate in under 60 s; trebuchet outranges a Keep; siege tower unloads infantry on the inner side of a wall.
- **M8 Naval.** Water nav layer, Dock, fishing and fish traps, warships with counters, transports load/unload, ships hit coastal buildings. ✔ On Islands, can ship 10 units to an enemy island and unload them.
- **M9 AI opponent.** Three difficulties including walls, siege, naval and treaty behavior. ✔ Headless: Hard beats Easy in 9 of 10 seeded Standard matches on Heartland and on Islands; no match stalls with both sides idle for over 90 s; median Normal-vs-Normal Standard match lasts 45 to 70 sim-minutes.
- **M10 Factions & game modes.** Four factions with unique units; Standard, Regicide and Domination with their win/lose logic, HUD elements and AI mode behavior. ✔ Tests: killing the King ends the match; garrisoned King survives until his building falls; Domination score reaches the target and declares the right winner.
- **M11 Tutorial & polish.** Guided first match (gather, house, villager, age up, wall, army, attack). Synth audio, alerts, settings (speed, difficulty, map, mode, treaty, left-handed HUD).
- **M12 Save, perf & ship.** Three save slots, compressed saves, background-kill recovery, 200-pop perf pass, Playwright smoke test at 844x390. ✔ Kill Safari mid-match at minute 50, reopen, resume within 3 s with the clock and stats intact.

## 12. Out of scope for v1

Multiplayer, diplomacy (tributes, alliance changes mid-game), trade carts and cogs, heroes, persistent progression between matches, monetization, cloud saves, map editor, gunpowder units, more than four factions. AoK's own team nearly lost the game to feature creep. Ship the core first.
