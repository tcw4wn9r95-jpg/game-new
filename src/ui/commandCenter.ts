// The bottom-left command centre: a 3x2 command card (AoE-style sockets) and the
// selection info panel (portrait, health, stat block, status, or a portrait grid
// for groups). Appears only while something is selected or a building is being sited.
import type { Controller } from '../input/controller';
import { isGatherer } from '../sim/economy';
import { BUILDING_DEFS, STANCES, type Stance, type BuildingType, type Entity, UNIT_DEFS, type Unit } from '../sim/entities';
import { sellPrice } from '../sim/production';
import { carried } from '../sim/modes';
import { AGES, TECH_DEFS, type TechId, buildingCost, buildingMaxHp, researchBlock, techsAt, unitCost, unitStats } from '../sim/techs';
import type { World } from '../sim/world';
import { ICONS, techIcon } from './icons';
import { portrait } from './portraits';
import { hideTip, tip } from './tooltip';

const RES_NAMES = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' } as const;
type Res = keyof typeof RES_NAMES;
const ICON = ICONS as unknown as Record<string, string>;
const CAP = 10;

/** Build tabs; buildings arrive in later milestones and simply join their tab. */
const TABS: Array<{ key: string; name: string; icon: string; types: BuildingType[] }> = [
  { key: 'economy', name: 'Economy', icon: ICONS.economy, types: ['house', 'farm', 'mill', 'lumber_camp', 'mining_camp', 'market', 'wonder'] },
  { key: 'military', name: 'Military', icon: ICONS.military, types: ['barracks', 'archery_range', 'stable', 'blacksmith', 'monastery', 'university', 'siege_workshop'] },
  { key: 'defense', name: 'Defense', icon: ICONS.meleeArmor, types: ['palisade_wall', 'palisade_gate', 'stone_wall', 'gate', 'watch_tower', 'castle'] },
  { key: 'naval', name: 'Naval', icon: ICONS.ship, types: ['dock'] },
  // Fishing ships' own short list.
  { key: 'water', name: 'Water', icon: ICONS.fish_trap, types: ['fish_trap'] },
];

interface Cmd {
  icon: string;
  label: string;
  run: () => void;
  tip?: () => string;
  disabled?: () => boolean;
  /** Small caption under the icon, e.g. a cost. */
  caption?: string;
  active?: () => boolean;
  /** Needs a second tap within a moment (destructive actions). */
  confirm?: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

function costHtml(cost: Record<string, number>): string {
  return Object.entries(cost)
    .map(([k, v]) => `<span class="cost"><span class="icon">${ICON[k]}</span>${v}</span>`)
    .join('');
}

function tipHtml(title: string, body: string, cost?: Record<string, number>): string {
  return `<div class="tip-title">${title}</div>${cost ? `<div class="tip-cost">${costHtml(cost)}</div>` : ''}<div class="tip-body">${body}</div>`;
}

/** One-line account of what a unit is doing. */
function status(w: World, u: Unit): string {
  const o = u.order;
  if (u.state === 'pack') return u.packed ? 'Unpacking…' : 'Packing up…';
  if (u.cargo.length) return `${u.cargo.length} aboard`;
  if (!o) return UNIT_DEFS[u.type].packs ? (u.packed ? 'Packed' : 'Ready to fire') : 'Idle';
  switch (o.type) {
    case 'move':
      return 'Moving';
    case 'gather':
      return `${u.state === 'gather' ? 'Gathering' : 'Heading to'} ${RES_NAMES[o.res]}`;
    case 'dropoff': {
      const b = w.building(o.id);
      return `Returning to ${b ? BUILDING_DEFS[b.type].name : 'store'}`;
    }
    case 'build': {
      const b = w.building(o.id);
      return `${u.state === 'build' ? 'Building' : 'Going to build'} ${b ? BUILDING_DEFS[b.type].name : ''}`;
    }
    case 'attack': {
      const t = w.get(o.id);
      const name = t?.kind === 'unit' ? UNIT_DEFS[t.type].name : t?.kind === 'building' ? BUILDING_DEFS[t.type].name : 'enemy';
      return `${u.state === 'attack' ? 'Fighting' : 'Charging'} ${name}`;
    }
    case 'heal':
      return u.state === 'heal' ? 'Healing' : 'Going to heal';
    case 'convert':
      return u.state === 'convert' ? 'Converting' : 'Going to convert';
    case 'garrison':
      return w.unit(o.id) ? 'Climbing aboard' : 'Going inside';
    case 'relic':
      return carried(w, u) ? 'Bringing a relic home' : 'Fetching a relic';
    case 'attackGround':
      return u.state === 'attack' ? 'Bombarding' : 'Moving to bombard';
    case 'repair': {
      const b = w.building(o.id);
      return `${u.state === 'repair' ? 'Repairing' : 'Going to repair'} ${b ? BUILDING_DEFS[b.type].name : ''}`;
    }
    case 'unload':
      return 'Sailing to land troops';
  }
}

/** "Strong vs / weak vs" line for a unit's tooltip. */
function matchup(d: { strong: string; weak: string }): string {
  return `${d.strong ? `<br><span class="strong">Strong vs</span> ${d.strong}` : ''}${d.weak ? `<br><span class="weak">Weak vs</span> ${d.weak}` : ''}`;
}

const STANCE_TEXT: Record<Stance, [string, string]> = {
  aggressive: ['Aggressive', 'Attack any enemy in sight and chase it.'],
  defensive: ['Defensive', 'Attack enemies nearby, then return to post.'],
  stand: ['Stand Ground', 'Hold position; attack only what comes within reach.'],
  passive: ['No Attack', 'Never attack, even when struck. Good for scouting.'],
};

export class CommandCenter {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private readonly info: HTMLElement;
  private shown = '';
  /** Which build tab (or market sub-card) is open, or null for the main commands. */
  private tab: string | null = null;
  /** Page of a command card too long for one 3x2 card. */
  private page = 0;
  private version = -1;
  private live: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly ctl: Controller,
    private readonly world: World,
    private readonly player: number,
  ) {
    this.root = el('div', 'cc');
    this.card = el('div', 'cc-card frame');
    this.info = el('div', 'cc-info frame');
    this.root.append(this.card, this.info);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
    hideTip();
  }

  update(): void {
    this.ctl.prune();
    const p = this.world.players[this.player];
    if (this.ctl.version !== this.version) {
      // A new selection starts on its main card.
      this.version = this.ctl.version;
      this.tab = null;
      this.page = 0;
    }
    const sig = `${this.ctl.version}|${this.tab}|${this.page}|${this.ctl.placing ? 'p' : ''}|${p.age}|${p.techs.length}|${p.bell ? 1 : 0}`;
    if (sig !== this.shown) {
      this.shown = sig;
      this.rebuild();
    }
    for (const f of this.live) f();
  }

  private rebuild(): void {
    this.live = [];
    hideTip();
    const ents = [...this.ctl.selection].map((id) => this.world.get(id)).filter((e): e is Entity => !!e);
    if (!ents.length && !this.ctl.placing) {
      this.root.hidden = true;
      this.tab = null;
      return;
    }
    this.root.hidden = false;
    this.renderCard(this.commands());
    if (this.ctl.placing) this.renderPlacingInfo();
    else if (ents.length === 1) this.renderSingle(ents[0]);
    else this.renderGroup(ents);
  }

  // ---------- command card ----------

  private commands(): Array<Cmd | null> {
    const { ctl } = this;
    if (ctl.placing) {
      const def = BUILDING_DEFS[ctl.placing.type];
      return [
        { icon: ICONS.check, label: `Place ${def.name}`, run: () => ctl.confirmPlacing(), disabled: () => !ctl.placementValid() },
        null,
        null,
        null,
        null,
        { icon: ICONS.close, label: 'Cancel', run: () => ctl.cancelPlacing() },
      ];
    }
    const own = ctl.ownUnits();
    const villagers = own.some(isGatherer);
    // Villagers raise buildings on land; fishing ships only fish traps.
    const fishers = own.some((u) => isGatherer(u) && UNIT_DEFS[u.type].naval);
    const landBuilders = own.some((u) => isGatherer(u) && !UNIT_DEFS[u.type].naval);
    const res = this.world.players[this.player].resources;
    if (this.tab && (landBuilders || fishers)) {
      const tab = TABS.find((t) => t.key === this.tab)!;
      const age = this.world.players[this.player].age;
      const actions: Cmd[] = tab.types.map((type) => {
        const def = BUILDING_DEFS[type];
        const cost = buildingCost(this.world, this.player, type) as Record<string, number>;
        const locked = def.age > age;
        return {
          icon: ICON[type],
          label: def.name,
          caption: locked ? AGES[def.age].numeral : Object.values(cost).join('/'),
          run: () => {
            this.tab = null;
            ctl.startPlacing(type);
          },
          disabled: () => locked || Object.entries(cost).some(([k, v]) => res[k as Res] < v) || !this.hasRequired(type),
          tip: () =>
            tipHtml(
              def.name,
              `${def.description}${locked ? `<br><i>Requires the ${AGES[def.age].name} Age.</i>` : ''}${this.hasRequired(type) ? '' : `<br><i>Requires a ${BUILDING_DEFS[def.requires!].name}.</i>`}`,
              cost,
            ),
        };
      });
      return this.paged(actions, [{ icon: ICONS.back, label: 'Back', run: () => ((this.tab = null), (this.page = 0)) }]);
    }
    const building = this.ownBuilding();
    if (building) return this.buildingCommands(building);
    const slots: Array<Cmd | null> = [];
    if (fishers && !landBuilders) {
      const t = TABS.find((x) => x.key === 'water')!;
      slots.push({
        icon: ICON.fish_trap,
        label: 'Build Fish Trap',
        run: () => ((this.tab = t.key), (this.page = 0)),
        tip: () => tipHtml('Build', 'Fish Traps: renewable food in deep water, worked by a fishing ship.'),
      });
    }
    if (landBuilders) {
      for (const t of TABS.slice(0, 4))
        slots.push({
          icon: t.icon,
          label: `Build ${t.name}`,
          run: () => ((this.tab = t.key), (this.page = 0)),
          disabled: () => !t.types.length,
          tip: () => tipHtml(`Build ${t.name} Buildings`, t.types.length ? t.types.map((k) => BUILDING_DEFS[k].name).join(', ') : 'Available in a later age.'),
        });
    }
    if (own.length) slots.push({ icon: ICONS.stop, label: 'Stop', run: () => ctl.stop(), tip: () => tipHtml('Stop', 'Abandon the current task.') });
    // Four build tabs leave no room for Delete: Stop and Deselect matter more for villagers.
    if (landBuilders) return [...slots.slice(0, 5), { icon: ICONS.close, label: 'Deselect', run: () => ctl.deselect() }];
    const soldiers = own.filter((u) => !isGatherer(u));
    if (soldiers.length && !villagers) {
      // One button cycles the stance; its icon shows the current one.
      const current = () => soldiers[0].stance;
      const btn: Cmd = {
        icon: ICON[current()],
        label: 'Stance',
        caption: STANCE_TEXT[current()][0],
        run: () => {
          const next = STANCES[(STANCES.indexOf(current()) + 1) % STANCES.length];
          ctl.command({ type: 'stance', ids: soldiers.map((u) => u.id), stance: next });
          // The stance applies next tick; show it now.
          for (const u of soldiers) u.stance = next;
          this.shown = '';
        },
        tip: () => tipHtml(`Stance: ${STANCE_TEXT[current()][0]}`, `${STANCE_TEXT[current()][1]}<br><i>Tap to cycle: Aggressive, Defensive, Stand Ground, No Attack.</i>`),
      };
      slots.push(btn);
    }
    // Siege: bombard a spot, pack or unpack, let riders out.
    if (!villagers && soldiers.some((u) => UNIT_DEFS[u.type].groundAttack))
      slots.push({
        icon: ICONS.attackGround,
        label: 'Attack ground',
        active: () => ctl.targeting === 'ground',
        run: () => ctl.armTargeting('ground'),
        tip: () => tipHtml('Attack ground', 'Tap a spot to bombard it until told otherwise.'),
      });
    const trebs = soldiers.filter((u) => UNIT_DEFS[u.type].packs);
    if (trebs.length && slots.length < 4)
      slots.push({
        icon: trebs[0].packed ? ICONS.unpack : ICONS.pack,
        label: trebs[0].packed ? 'Unpack' : 'Pack',
        run: () => {
          ctl.command({ type: 'pack', ids: trebs.map((u) => u.id), packed: !trebs[0].packed });
          this.shown = '';
        },
        tip: () => tipHtml(trebs[0].packed ? 'Unpack' : 'Pack', 'Trebuchets must unpack to fire and pack to move (5 seconds each). They do it themselves when ordered to attack or move.'),
      });
    const carriers = soldiers.filter((u) => u.cargo.length);
    const ships = carriers.some((u) => UNIT_DEFS[u.type].naval);
    if (carriers.length && slots.length < 4)
      slots.push({
        icon: ICONS.ungarrison,
        label: 'Unload',
        run: () => {
          for (const c of carriers) ctl.command({ type: 'ungarrison', id: c.id });
        },
        tip: () =>
          ships
            ? tipHtml('Unload', 'Land everyone on the nearest shore. Or tap a point on land to sail there and land them by it.')
            : tipHtml('Unload', 'Let the riders out. A siege tower next to an enemy wall puts them down on the far side.'),
      });
    while (slots.length < 4) slots.push(null);
    slots.push(own.length ? this.deleteCmd() : null);
    slots.push({ icon: ICONS.close, label: 'Deselect', run: () => ctl.deselect() });
    return slots;
  }

  /** The single building of yours that is selected, if that is the selection. */
  private ownBuilding() {
    if (this.ctl.selection.size !== 1) return null;
    const b = this.world.building([...this.ctl.selection][0]);
    return b && b.owner === this.player ? b : null;
  }

  private hasRequired(type: BuildingType): boolean {
    const req = BUILDING_DEFS[type].requires;
    return !req || [...this.world.buildings(this.player)].some((b) => b.type === req && b.complete);
  }

  private deleteCmd(): Cmd {
    return { icon: ICONS.trash, label: 'Delete', confirm: true, run: () => this.ctl.deleteSelected(), tip: () => tipHtml('Delete', 'Tap twice. Unfinished buildings refund what was not yet built.') };
  }

  /** Lays out actions over pages of the 3x2 card, keeping `tail` (back, delete...) at the end of every page. */
  private paged(actions: Array<Cmd | null>, tail: Array<Cmd | null>): Array<Cmd | null> {
    const room = 6 - tail.length;
    let slots: Array<Cmd | null>;
    if (actions.length <= room) slots = [...actions];
    else {
      const per = room - 1;
      const pages = Math.ceil(actions.length / per);
      const pg = this.page % pages;
      slots = actions.slice(pg * per, pg * per + per);
      while (slots.length < per) slots.push(null);
      slots.push({ icon: ICONS.more, label: 'More', caption: `${pg + 1}/${pages}`, run: () => (this.page = (pg + 1) % pages), tip: () => tipHtml('More commands', `Page ${pg + 1} of ${pages}.`) });
    }
    while (slots.length < room) slots.push(null);
    return [...slots, ...tail];
  }

  private techCmd(b: { id: number }, id: TechId): Cmd {
    const t = TECH_DEFS[id];
    const cost = t.cost as Record<string, number>;
    const res = this.world.players[this.player].resources;
    const why = () => researchBlock(this.world, this.player, id);
    return {
      icon: techIcon(id),
      label: `Research ${t.name}`,
      caption: Object.values(cost).join('/'),
      run: () => this.ctl.command({ type: 'research', id: b.id, tech: id }),
      disabled: () => !!why() || Object.entries(cost).some(([k, v]) => res[k as Res] < v),
      tip: () => {
        const w = why();
        return tipHtml(t.name, `${t.description}<br>${t.time}s${w ? `<br><i>${w}.</i>` : ''}`, cost);
      },
    };
  }

  private buildingCommands(b: NonNullable<ReturnType<CommandCenter['ownBuilding']>>): Array<Cmd | null> {
    const def = BUILDING_DEFS[b.type];
    const p = this.world.players[this.player];
    const res = p.resources;
    const tail: Array<Cmd | null> = [this.deleteCmd(), { icon: ICONS.close, label: 'Deselect', run: () => this.ctl.deselect() }];
    if (!b.complete) return this.paged([], tail);
    if (b.type === 'market') {
      if (this.tab === 'buy' || this.tab === 'sell') {
        const action = this.tab;
        const goods = (['food', 'wood', 'stone'] as const).map((r): Cmd => {
          const price = () => (action === 'buy' ? p.market[r] : sellPrice(this.world, this.player, r));
          return {
            icon: ICON[r],
            label: `${action === 'buy' ? 'Buy' : 'Sell'} ${RES_NAMES[r]}`,
            caption: `${price()}`,
            run: () => {
              this.ctl.command({ type: 'trade', id: b.id, action, res: r });
              this.shown = '';
            },
            disabled: () => (action === 'buy' ? res.gold < p.market[r] : res[r] < 100),
            tip: () => tipHtml(`${action === 'buy' ? 'Buy' : 'Sell'} 100 ${RES_NAMES[r]}`, `${action === 'buy' ? 'Costs' : 'Earns'} ${price()} gold. Prices move with every trade.`),
          };
        });
        return this.paged(goods, [null, null, { icon: ICONS.back, label: 'Back', run: () => (this.tab = null) }]);
      }
      return this.paged(
        [
          { icon: ICONS.buy, label: 'Buy', run: () => (this.tab = 'buy'), tip: () => tipHtml('Buy', 'Buy 100 food, wood or stone for gold.') },
          { icon: ICONS.sell, label: 'Sell', run: () => (this.tab = 'sell'), tip: () => tipHtml('Sell', 'Sell 100 food, wood or stone for gold.') },
        ],
        tail,
      );
    }
    const actions: Cmd[] = [];
    for (const unit of def.trains) {
      // Each faction trains only its own unique unit.
      if (UNIT_DEFS[unit].faction && UNIT_DEFS[unit].faction !== p.faction) continue;
      const u = unitStats(this.world, this.player, unit);
      const cost = unitCost(this.world, this.player, unit) as Record<string, number>;
      const locked = u.age > p.age;
      actions.push({
        icon: ICON[unit],
        label: `Train ${UNIT_DEFS[unit].name}`,
        caption: locked ? AGES[u.age].numeral : Object.values(cost).join('/'),
        run: () => this.ctl.command({ type: 'train', id: b.id, unit }),
        disabled: () => locked || Object.entries(cost).some(([k, v]) => res[k as Res] < v),
        tip: () => tipHtml(`Train ${u.name}`, `${u.description}<br>${u.trainTime}s · ${u.hp} HP${matchup(u)}${locked ? `<br><i>Requires the ${AGES[u.age].name} Age.</i>` : ''}`, cost),
      });
    }
    // The town bell, right after the villager: it's for emergencies.
    if (b.type === 'town_center') {
      const ringing = () => !!this.world.players[this.player].bell;
      actions.push({
        icon: ICONS.bell,
        label: 'Town Bell',
        active: ringing,
        caption: ringing() ? 'All clear' : 'Ring',
        run: () => this.ctl.command({ type: 'bell', on: !ringing() }),
        tip: () =>
          tipHtml(
            ringing() ? 'All Clear' : 'Ring the Town Bell',
            ringing()
              ? 'Ring again to send the villagers back out to what they were doing.'
              : 'Every villager runs for the nearest Town Center, tower or Castle (each one inside adds an arrow). Ring again and they go back to work.',
          ),
      });
    }
    // Research: everything not yet done whose age is now or next (ages: only the next one).
    for (const id of techsAt(b.type)) {
      const t = TECH_DEFS[id];
      if (p.techs.includes(id) || t.age > p.age + 1) continue;
      const ageUp = t.effects.find((e) => e.type === 'age');
      if (ageUp && ageUp.age !== p.age + 1) continue;
      actions.push(this.techCmd(b, id));
    }
    const extra: Cmd[] = [];
    if (def.garrison)
      extra.push({
        icon: ICONS.ungarrison,
        label: 'Ungarrison',
        caption: `${b.garrison.length}/${def.garrison}`,
        run: () => this.ctl.command({ type: 'ungarrison', id: b.id }),
        disabled: () => !this.world.building(b.id)?.garrison.length,
        tip: () => tipHtml('Ungarrison', 'Send everyone inside back out. Tap the building with villagers or soldiers selected to send them in; each adds an arrow.'),
      });
    if (def.gate)
      extra.push({
        icon: ICONS.lock,
        label: 'Lock gate',
        active: () => !!this.world.building(b.id)?.locked,
        run: () => this.ctl.command({ type: 'lockGate', id: b.id, locked: !this.world.building(b.id)?.locked }),
        tip: () => tipHtml('Lock gate', 'A locked gate stays shut, even to your own people.'),
      });
    if (def.trains.length)
      extra.push({
        icon: ICONS.repeat,
        label: 'Repeat',
        active: () => !!this.world.building(b.id)?.repeat,
        run: () => this.ctl.command({ type: 'repeat', id: b.id, on: !this.world.building(b.id)?.repeat }),
        tip: () => tipHtml('Repeat production', 'Keep training the same unit while you can afford it.'),
      });
    if (b.type === 'farm' || b.type === 'mill')
      extra.push({
        icon: ICONS.reseed,
        label: 'Auto-reseed farms',
        active: () => this.world.players[this.player].autoReseed,
        run: () => this.ctl.command({ type: 'autoReseed', on: !this.world.players[this.player].autoReseed }),
        tip: () => tipHtml('Auto-reseed farms', `Replant fields when they are harvested, for ${BUILDING_DEFS.farm.cost.wood} wood each.`),
      });
    return this.paged([...actions, ...extra], tail);
  }

  private renderCard(cmds: Array<Cmd | null>): void {
    this.card.innerHTML = '';
    for (const c of cmds) {
      if (!c) {
        this.card.appendChild(el('div', 'socket'));
        continue;
      }
      const b = el('button', 'cmd-btn', `${c.icon}${c.caption ? `<span class="cmd-cap">${c.caption}</span>` : ''}`);
      b.setAttribute('aria-label', c.label);
      let armed = 0;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (c.confirm && !armed) {
          b.classList.add('armed');
          armed = window.setTimeout(() => {
            armed = 0;
            b.classList.remove('armed');
          }, 2000);
          return;
        }
        clearTimeout(armed);
        c.run();
      });
      if (c.active) {
        const a = c.active;
        const refresh = () => b.classList.toggle('active', a());
        refresh();
        this.live.push(refresh);
      }
      tip(b, c.tip ?? (() => tipHtml(c.label, '')));
      if (c.disabled) {
        const d = c.disabled;
        const refresh = () => b.toggleAttribute('disabled', d());
        refresh();
        this.live.push(refresh);
      }
      this.card.appendChild(b);
    }
  }

  // ---------- info panel ----------

  private renderSingle(e: Entity): void {
    const name = e.kind === 'unit' ? unitStats(this.world, e.owner, e.type).name : e.kind === 'building' ? BUILDING_DEFS[e.type].name : e.type[0].toUpperCase() + e.type.slice(1);
    const owner = e.kind === 'resource' ? '' : e.owner === this.player ? 'Your realm' : `Player ${e.owner + 1}`;
    this.info.innerHTML = `
      <div class="pf-frame"><div class="pf">${portrait(e)}</div></div>
      <div class="ci-body">
        <div class="ci-head"><span class="ci-name">${name}</span><span class="ci-owner">${owner}</span></div>
        <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="stats"></div>
        <div class="ci-status"><span class="ci-status-text"></span><span class="carry"></span><span class="queue"></span></div>
      </div>`;
    const fill = this.info.querySelector<HTMLElement>('.hp-fill')!;
    const hpText = this.info.querySelector<HTMLElement>('.hp-text')!;
    const statusEl = this.info.querySelector<HTMLElement>('.ci-status-text')!;
    const carryEl = this.info.querySelector<HTMLElement>('.carry')!;
    const stats = this.info.querySelector<HTMLElement>('.stats')!;
    const queueEl = this.info.querySelector<HTMLElement>('.queue')!;
    this.renderStats(stats, e);
    let queueSig = '';
    let headBar: HTMLElement | null = null;
    let lastCarry = '';
    this.live.push(() => {
      const cur = this.world.get(e.id);
      if (!cur) return;
      let frac = 1, text = '', st = '', carry = '';
      if (cur.kind === 'unit') {
        const max = unitStats(this.world, cur.owner, cur.type).hp;
        frac = cur.hp / max;
        text = `${Math.ceil(cur.hp)} / ${max}`;
        st = cur.owner === this.player ? status(this.world, cur) : '';
        if (cur.carry && cur.carry.amount > 0)
          carry = `<span class="icon">${ICON[cur.carry.res]}</span><span class="carry-bar"><span style="width:${(cur.carry.amount / CAP) * 100}%"></span></span><b>${cur.carry.amount}/${CAP}</b>`;
      } else if (cur.kind === 'building') {
        const def = BUILDING_DEFS[cur.type];
        const maxHp = buildingMaxHp(this.world, cur);
        frac = cur.complete ? cur.hp / maxHp : cur.progress;
        text = cur.complete ? `${Math.ceil(cur.hp)} / ${maxHp}` : `Building… ${Math.floor(cur.progress * 100)}%`;
        st = !cur.complete ? 'Under construction' : cur.type === 'farm' ? `${cur.amount} food left in this planting` : def.description;
        if (cur.complete && def.trains.length && cur.owner === this.player) {
          const head = cur.queue[0];
          st = cur.housed
            ? 'Waiting for houses: population limit reached'
            : head?.tech
              ? `Researching ${TECH_DEFS[head.tech].name}`
              : head?.unit
                ? `Training ${unitStats(this.world, cur.owner, head.unit).name}`
                : cur.rally
                  ? 'Ready'
                  : 'Tap the map to set a rally point';
          const sig = cur.queue.map((q) => q.unit ?? q.tech).join(',');
          if (sig !== queueSig) {
            queueSig = sig;
            headBar = this.renderQueue(queueEl, cur.id, cur.queue.map((q) => (q.unit ? ICON[q.unit] : techIcon(q.tech!))));
          }
          if (headBar && cur.queue[0]) headBar.style.width = `${cur.queue[0].progress * 100}%`;
        }
      } else {
        text = `${cur.amount} food`;
        st = 'Select villagers, then tap it to gather.';
      }
      fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      fill.classList.toggle('low', frac < 0.35);
      fill.classList.toggle('build', cur.kind === 'building' && !cur.complete);
      if (hpText.textContent !== text) hpText.textContent = text;
      if (statusEl.textContent !== st) statusEl.textContent = st;
      if (carry !== lastCarry) carryEl.innerHTML = lastCarry = carry;
    });
  }

  /** Training queue: the head with a progress bar, then the rest; tap any to cancel (full refund). */
  private renderQueue(box: HTMLElement, id: number, icons: string[]): HTMLElement | null {
    box.innerHTML = '';
    let bar: HTMLElement | null = null;
    const units = icons;
    units.slice(0, 8).forEach((icon, i) => {
      const q = el('button', i === 0 ? 'qitem head' : 'qitem', `${icon}${i === 0 ? '<span class="qbar"><span></span></span>' : ''}`);
      q.setAttribute('aria-label', 'Cancel');
      q.addEventListener('click', () => this.ctl.command({ type: 'cancelTrain', id, index: i }));
      if (i === 0) bar = q.querySelector<HTMLElement>('.qbar span');
      box.appendChild(q);
    });
    if (units.length > 8) box.appendChild(el('span', 'qmore', `+${units.length - 8}`));
    return bar;
  }

  private renderStats(box: HTMLElement, e: Entity): void {
    const items: Array<[string, string, string]> = [];
    if (e.kind === 'unit') {
      const d = unitStats(this.world, e.owner, e.type);
      items.push(['attack', String(d.attack), 'Attack']);
      items.push(['meleeArmor', String(d.meleeArmor), 'Melee armor']);
      items.push(['pierceArmor', String(d.pierceArmor), 'Pierce armor']);
      if (d.range) items.push(['range', String(d.range), 'Range']);
      items.push(['speed', d.speed.toFixed(1), 'Speed (tiles per second)']);
      items.push(['los', String(d.los), 'Line of sight']);
    } else if (e.kind === 'building') {
      const d = BUILDING_DEFS[e.type];
      items.push(['meleeArmor', String(d.meleeArmor), 'Melee armor']);
      items.push(['pierceArmor', String(d.pierceArmor), 'Pierce armor']);
      items.push(['los', String(d.los), 'Line of sight']);
      if (d.pop) items.push(['pop', `+${d.pop}`, 'Population supported']);
      for (const r of d.dropoff) items.push([r, '', `Stores ${RES_NAMES[r as Res]}`]);
    }
    for (const [icon, value, label] of items) {
      const s = el('span', 'stat-chip', `<span class="icon">${ICON[icon]}</span>${value ? `<b>${value}</b>` : ''}`);
      tip(s, () => tipHtml(label, ''));
      box.appendChild(s);
    }
    if (e.kind === 'unit') {
      const d = UNIT_DEFS[e.type];
      const s = el('span', 'stat-chip matchup', `<span class="icon">${ICON.attack}</span>`);
      tip(s, () => tipHtml(d.name, matchup(d).replace(/^<br>/, '')));
      box.appendChild(s);
    }
  }

  private renderGroup(ents: Entity[]): void {
    this.info.innerHTML = '';
    const grid = el('div', 'pgrid');
    const max = 16;
    for (const e of ents.slice(0, max)) {
      const t = el('button', 'ptile', `${portrait(e)}<span class="ptile-hp"><span></span></span>`);
      const bar = t.querySelector<HTMLElement>('.ptile-hp span')!;
      this.live.push(() => {
        const cur = this.world.get(e.id);
        if (cur?.kind === 'unit') bar.style.width = `${(cur.hp / UNIT_DEFS[cur.type].hp) * 100}%`;
      });
      t.addEventListener('click', () => this.ctl.select([e.id]));
      grid.appendChild(t);
    }
    if (ents.length > max) grid.appendChild(el('div', 'ptile more', `+${ents.length - max}`));
    const head = el('div', 'ci-head', `<span class="ci-name">${ents.length} selected</span><span class="ci-owner">Tap a portrait to pick one</span>`);
    const body = el('div', 'ci-body');
    body.append(head, grid);
    this.info.appendChild(body);
  }

  private renderPlacingInfo(): void {
    const p = this.ctl.placing!;
    const def = BUILDING_DEFS[p.type];
    if (p.wall) {
      const plan = this.ctl.wallPlan();
      const gates = plan.filter((t) => t.gate).length;
      const total: Record<string, number> = {};
      for (const [k, v] of Object.entries(buildingCost(this.world, this.player, p.type))) total[k] = (total[k] ?? 0) + (v ?? 0) * (plan.length - gates);
      for (const [k, v] of Object.entries(buildingCost(this.world, this.player, p.wall.kind === 'stone' ? 'gate' : 'palisade_gate'))) total[k] = (total[k] ?? 0) + (v ?? 0) * gates;
      this.info.innerHTML = `
        <div class="pf-frame"><div class="pf">${portrait({ kind: 'building', type: p.type, owner: this.player })}</div></div>
        <div class="ci-body">
          <div class="ci-head"><span class="ci-name">${def.name}</span><span class="ci-owner">${plan.length ? costHtml(total) : costHtml(buildingCost(this.world, this.player, p.type) as Record<string, number>)}</span></div>
          <div class="ci-status"><span class="ci-status-text">${plan.length ? `${plan.length - gates} segments, ${gates} gate${gates === 1 ? '' : 's'}` : 'Drag along the ground to draw a wall.'}</span></div>
          <div class="ci-status"><span class="ci-status-text dim">Drag again to add lines. Tap a segment to make it a gate. Then confirm.</span></div>
        </div>`;
      return;
    }
    this.info.innerHTML = `
      <div class="pf-frame"><div class="pf">${portrait({ kind: 'building', type: p.type, owner: this.player })}</div></div>
      <div class="ci-body">
        <div class="ci-head"><span class="ci-name">${def.name}</span><span class="ci-owner">${costHtml(buildingCost(this.world, this.player, p.type) as Record<string, number>)}</span></div>
        <div class="ci-status"><span class="ci-status-text">Tap the map to choose a spot, then confirm.</span></div>
        <div class="ci-status"><span class="ci-status-text dim">${def.description}</span></div>
      </div>`;
  }
}
