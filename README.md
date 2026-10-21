# Steel & Signal

A single-player modern real-time strategy game for iPhone (Safari / Home Screen). It is the
21st-century edition of [Hearth & Crown](https://github.com/tcw4wn9r95-jpg/game): the same
infrastructure, simulation and rules, with modern forces, vehicles, ships, buildings, UI and sound.

```sh
npm install
npm run dev       # local dev server (open on your phone via the LAN URL)
npm test          # vitest
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ (service worker active)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(repo Settings → Pages → Source: **GitHub Actions**).

Debug views: `?sheet` (every unit pose), `?ships`, `?buildings` (add `&age=0..3` for each era's
style), and `?map=heartland&size=skirmish&reveal=1` to skip the setup screen.

## What changed from Hearth & Crown

Mechanics, balance numbers and data ids are unchanged ([BUILD_SPEC.md](BUILD_SPEC.md) still
describes the rules). Everything the player sees was rebuilt for the 21st century:

| Medieval | Modern |
|---|---|
| Villager | Engineer (hard hat, hi-vis vest, chainsaw, power tools) |
| Militia → Swordsman | Breacher → Assault Breacher (shotgun) |
| Spearman → Pikeman | AT Trooper → Missile Team (rocket launcher) |
| Archer → Crossbowman | Rifleman → Marksman |
| Skirmisher | Shield Trooper (ballistic shield) |
| Scout → Light Cavalry | Recon Buggy → Strike Buggy |
| Knight | Battle Tank |
| Monk | Field Agent (heals, turns enemies) |
| Ram, Mangonel, Scorpion | Breaching Dozer, Howitzer, Gun Truck |
| Siege Tower, Trebuchet, Petard | Assault Bridge, Missile Launcher (deploy/stow), Demo Sapper |
| Fishing Ship, Transport, Galley | Trawler, Landing Craft, Patrol Boat → Missile Boat |
| Fire Ship, Demolition Raft, Siege Barge | Gunboat, Drone Boat, Destroyer |
| Unique units | Commando, Technical, Sniper, Juggernaut (super-heavy tank) |
| King | Commander |
| Town Center, House | Command Center, Housing Unit |
| Lumber/Mining Camp, Mill | Sawmill, Mining Depot, Food Depot |
| Archery Range, Stable, Monastery | Firing Range, Motor Pool, Intel HQ |
| Blacksmith, Market, University | Armory, Exchange, Research Lab |
| Palisade, Stone Wall, Gates | Sandbag Wall, Concrete T-Wall, Checkpoint, Blast Gate |
| Watch Tower → Guard Tower → Keep | Sentry Tower → Gun Tower → Missile Turret |
| Castle, Siege Workshop, Dock | Fortress, Vehicle Factory, Naval Dock |
| Fish Trap, Wonder | Fish Farm, Launch Complex |
| Relics, Banner Sites | Intel drives, Control points (uplink masts) |
| Ages I–IV | Foundation, Expansion, Network, Autonomy |
| Regicide, Domination modes | Commander, Control modes |

## Air power and air defence

An **Airfield** (Expansion Age) builds **Recon Drones** (unarmed, long sight), **Attack
Helicopters** (Network Age; strong against vehicles, artillery and ships) and **Strike Jets**
(Autonomy Age; bomb buildings and shoot down other aircraft). Aircraft fly straight over walls,
water and terrain, and only anti-air weapons can hit them:

- **AA Trooper** (Firing Range) and **AA Vehicle** (Vehicle Factory): fire homing missiles and
  cannon at aircraft only.
- **SAM Site** (Network Age, Defence tab): long-range missile battery, aircraft only.
- Sentry towers, Fortresses, Patrol Boats, Destroyers and Strike Jets also engage aircraft.

## Tactics

Select an army and tap **Tactics** to set the battle plan used for every army move and attack:

- **Formation: Escort**: tanks and close-quarters troops march in front, with shooters,
  artillery and medics behind them, all at the pace of the slowest unit. When a protected unit
  is hit, its escorts turn on the attacker, then return to formation.
- **Waves: 2 or 3**: the army splits into mixed waves. The first goes at once; each next wave
  follows 20 seconds later, or sooner if the wave ahead is cut down.
- **Wounded: Fall back**: units below 30% health retreat to where the order was given.

The AI uses escort formation for its attacks (Hard also pulls back its wounded), counters enemy
aircraft with AA troops, AA vehicles and SAM sites, and fields its own helicopters and jets.

Buildings restyle by age: containers and corrugated metal, then precast concrete, then concrete
and glass, then glass with solar roofs and lit trims. Combat shows tracer fire, muzzle flashes,
artillery shells, missiles with exhaust trails and explosions. The UI is a dark tactical theme
with cyan-lit frames; sound effects are synthesized gunfire, explosions, klaxons and radio chirps.
Factions: Boreal Rangers, Dune Raiders, Harbor Coalition and Iron Ridge.
