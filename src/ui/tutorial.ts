// The guided first match: a short lesson card walks a new player through
// gathering, a house, a villager, advancing an age, a wall, an army and an
// attack on an enemy outpost. Each step watches the match for its goal, lights
// up the buttons it talks about and marks the spot on the map.
import type { Controller } from '../input/controller';
import type { Camera } from '../render/camera';
import { isGatherer } from '../sim/economy';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit } from '../sim/entities';
import { buildingCost, unitCost } from '../sim/techs';
import { Feature } from '../sim/terrain';
import type { World } from '../sim/world';
import { audio } from './audio';

export interface TutorialHost {
  world: World;
  controller: Controller;
  camera: Camera;
  player: number;
  hudRoot: HTMLElement;
  /** A gold ring on the ground (seen only where the player has sight). */
  ring(x: number, y: number): void;
  ping(x: number, y: number): void;
  /** The lesson is over: back to the menu, or straight into a real match. */
  onFinish(next: 'menu' | 'match'): void;
}

interface Step {
  title: string;
  /** Instructions; may change with the state of play. */
  text: (t: Tutorial) => string;
  /** Goal reached (none: the player taps Next). */
  done?: (t: Tutorial) => boolean;
  /** "1 of 2" style progress. */
  progress?: (t: Tutorial) => string;
  /** HUD buttons to light up (CSS selectors). */
  glow?: string[];
  /** Where on the map to point. */
  mark?: (t: Tutorial) => { x: number; y: number } | null;
  /** Called once when the step begins (top up resources, say). */
  start?: (t: Tutorial) => void;
}

const btn = (label: string) => `.cmd-btn[aria-label="${label}"]`;

export class Tutorial {
  private index = 0;
  private readonly card: HTMLElement;
  private lastMark = 0;
  private glowing: Element[] = [];
  private shown = '';
  /** Villagers when the "train a villager" step began. */
  villagersAtStart = 0;
  outpost = 0;
  private finished = false;

  constructor(private readonly host: TutorialHost) {
    this.card = document.createElement('div');
    this.card.className = 'tut-card frame';
    host.hudRoot.appendChild(this.card);
    host.hudRoot.classList.add('has-card');
    this.card.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'next') this.advance();
      else if (a === 'skip') host.onFinish('menu');
      else if (a === 'show') {
        const m = STEPS[this.index].mark?.(this);
        if (m) host.camera.centerOn(m.x, m.y);
      } else if (a === 'play') host.onFinish('match');
      else if (a === 'menu') host.onFinish('menu');
      else if (a === 'fold') this.card.classList.toggle('folded');
    });
    STEPS[0].start?.(this);
  }

  get world(): World {
    return this.host.world;
  }

  get me(): number {
    return this.host.player;
  }

  /** Sets up the lesson's enemy outpost on a new match. */
  setup(): void {
    const w = this.world;
    const home = w.map.starts[this.me], far = w.map.starts.find((_, i) => i !== this.me)!;
    // An enemy Barracks a third of the way across, with two guards.
    for (let k = 0.38; k < 0.75; k += 0.03) {
      const cx = Math.round(home.x + (far.x - home.x) * k), cy = Math.round(home.y + (far.y - home.y) * k);
      const spot = this.freeSpot(cx, cy, 'barracks');
      if (!spot) continue;
      const enemy = w.map.starts.findIndex((_, i) => i !== this.me);
      const b = w.placeBuilding('barracks', enemy, spot.x, spot.y, true);
      for (let i = 0; i < 2; i++) w.spawnUnit('militia', enemy, b.x + 1 + i, b.y + b.size + 0.7).stance = 'stand';
      this.outpost = b.id;
      break;
    }
    // The enemy's own villagers and scout stay home and leave the learner be.
    for (const u of w.units()) if (u.owner !== this.me && u.type !== 'militia') u.stance = 'passive';
  }

  private freeSpot(cx: number, cy: number, type: BuildingType): { x: number; y: number } | null {
    const w = this.world;
    const size = BUILDING_DEFS[type].size;
    for (let r = 0; r < 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          let ok = true;
          for (let ty = y - 1; ty <= y + size && ok; ty++)
            for (let tx = x - 1; tx <= x + size && ok; tx++) {
              if (!w.grid.inside(tx, ty) || !w.grid.isWalkable(tx, ty) || w.map.feature[ty * w.map.size + tx] !== Feature.None) ok = false;
            }
          if (ok) return { x, y };
        }
    return null;
  }

  // ---------- queries used by the steps ----------

  units(pred: (u: Unit) => boolean = () => true): Unit[] {
    return [...this.world.units(this.me)].filter(pred);
  }

  buildings(type: BuildingType, complete = false): Building[] {
    return [...this.world.buildings(this.me)].filter((b) => b.type === type && (!complete || b.complete));
  }

  gathering(res: string): number {
    return this.units((u) => isGatherer(u) && ((u.order?.type === 'gather' && u.order.res === res) || (u.order?.type === 'dropoff' && u.carry?.res === res))).length;
  }

  soldiers(): Unit[] {
    return this.units((u) => !isGatherer(u) && u.type !== 'scout' && u.type !== 'king' && !UNIT_DEFS[u.type].naval);
  }

  selected(pred: (u: Unit) => boolean): boolean {
    return [...this.host.controller.selection].some((id) => {
      const u = this.world.unit(id);
      return !!u && u.owner === this.me && pred(u);
    });
  }

  townCenter(): Building | undefined {
    return this.buildings('town_center')[0];
  }

  /** Nearest thing to the Town Center: a food source, a tree... */
  nearest(kind: 'food' | 'tree'): { x: number; y: number } | null {
    const w = this.world, tc = this.townCenter();
    if (!tc) return null;
    const cx = tc.x + tc.size / 2, cy = tc.y + tc.size / 2;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    const consider = (x: number, y: number) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) (bd = d), (best = { x, y });
    };
    if (kind === 'food') for (const r of w.resources()) if ((r.type === 'sheep' || r.type === 'deer') && r.amount > 0) consider(r.x, r.y);
    const N = w.map.size;
    const want = kind === 'food' ? Feature.Berries : Feature.Tree;
    for (let y = Math.max(0, tc.y - 16); y < Math.min(N, tc.y + 18); y++)
      for (let x = Math.max(0, tc.x - 16); x < Math.min(N, tc.x + 18); x++) if (w.map.feature[y * N + x] === want && w.map.amount[y * N + x] > 0) consider(x + 0.5, y + 0.5);
    return best;
  }

  /** Makes sure the player can afford something (the lesson is about the buttons, not the waiting). */
  afford(cost: Partial<Record<'food' | 'wood' | 'gold' | 'stone', number>>, times = 1): void {
    const r = this.world.players[this.me].resources;
    for (const [k, v] of Object.entries(cost)) r[k as 'food'] = Math.max(r[k as 'food'], (v ?? 0) * times);
  }

  // ---------- flow ----------

  private advance(): void {
    if (this.index >= STEPS.length - 1) return;
    this.index++;
    this.shown = '';
    audio.play('step');
    STEPS[this.index].start?.(this);
  }

  /** Per frame: check the goal, refresh the card, light up the buttons, mark the map. */
  update(now: number): void {
    if (this.finished) return;
    if (STEPS[this.index].done?.(this)) {
      if (this.index === STEPS.length - 2) {
        this.finished = true;
        this.index++;
        this.shown = '';
        audio.play('victory');
        this.render();
        this.glow([]);
        return;
      }
      this.advance();
    }
    const step = STEPS[this.index];
    this.render();
    this.glow(step.glow ?? []);
    const m = step.mark?.(this);
    if (m && now - this.lastMark > 1.3) {
      this.lastMark = now;
      this.host.ring(m.x, m.y);
      if (!this.world.fog[this.me]?.isVisible(m.x, m.y)) this.host.ping(m.x, m.y);
    }
  }

  private render(): void {
    const step = STEPS[this.index];
    const last = this.index === STEPS.length - 1;
    const progress = step.progress?.(this) ?? '';
    const html = `
      <div class="tut-head"><span class="tut-step">${last ? 'Lesson complete' : `Lesson ${this.index + 1} of ${STEPS.length - 1}`}</span><button class="tut-fold" data-a="fold" aria-label="Fold">–</button></div>
      <div class="tut-title">${step.title}</div>
      <div class="tut-text">${step.text(this)}</div>
      ${progress ? `<div class="tut-progress">${progress}</div>` : ''}
      <div class="tut-actions">
        ${last ? '<button class="btn btn-gold" data-a="play">Play a Match</button><button class="btn btn-wood btn-small" data-a="menu">Menu</button>' : ''}
        ${!last && !step.done ? '<button class="btn btn-gold btn-small" data-a="next">Next</button>' : ''}
        ${!last && step.mark ? '<button class="btn btn-wood btn-small" data-a="show">Show me</button>' : ''}
        ${!last ? '<button class="tut-skip" data-a="skip">Skip tutorial</button>' : ''}
      </div>`;
    if (html === this.shown) return;
    this.shown = html;
    this.card.innerHTML = html;
  }

  private glow(selectors: string[]): void {
    const now = selectors.length ? [...this.host.hudRoot.querySelectorAll(selectors.join(','))] : [];
    for (const e of this.glowing) if (!now.includes(e)) e.classList.remove('tut-glow');
    for (const e of now) e.classList.add('tut-glow');
    this.glowing = now;
  }

  destroy(): void {
    this.host.hudRoot.classList.remove('has-card');
    this.glow([]);
    this.card.remove();
  }
}

const STEPS: Step[] = [
  {
    title: 'Welcome, my liege',
    text: () =>
      'This short lesson takes you from a camp in the wilds to your first battle. <b>Drag</b> to look around and <b>pinch</b> to zoom. The game waits for you at every step.',
  },
  {
    title: 'Your villagers',
    text: () => 'Villagers gather, build and repair. <b>Tap one of your villagers</b> by the Town Center to select it.',
    done: (t) => t.selected((u) => u.type === 'villager'),
    glow: ['.side-btn[aria-label="Idle Villagers"]'],
    mark: (t) => t.units((u) => u.type === 'villager')[0] ?? null,
  },
  {
    title: 'Gather food',
    text: () => 'With a villager selected, <b>tap the sheep or the berry bushes</b>. Food trains villagers and soldiers and advances your age.',
    done: (t) => t.gathering('food') >= 1,
    mark: (t) => t.nearest('food'),
  },
  {
    title: 'Chop wood',
    text: () => 'Select another villager and <b>tap a tree</b>. Wood is for buildings. <i>Tip: the idle villager button finds the next villager with nothing to do.</i>',
    done: (t) => t.gathering('wood') >= 1,
    progress: (t) => `Food ${t.gathering('food')} · Wood ${t.gathering('wood')} villagers`,
    glow: ['.side-btn[aria-label="Idle Villagers"]'],
    mark: (t) => t.nearest('tree'),
  },
  {
    title: 'Build a House',
    text: () => 'Each House shelters 5 people. Select a villager, tap <b>Build Economy</b>, then <b>House</b>. Tap the ground where it should go and confirm with the <b>✓</b>.',
    start: (t) => t.afford(buildingCost(t.world, t.me, 'house')),
    done: (t) => t.buildings('house').length > 0,
    glow: [btn('Build Economy'), btn('House'), btn('Place House')],
  },
  {
    title: 'Raise the walls',
    text: () => 'Your villager is building the House. <b>Wait for it to finish</b>; more villagers on the job build faster.',
    done: (t) => t.buildings('house', true).length > 0,
    mark: (t) => {
      const h = t.buildings('house')[0];
      return h ? { x: h.x + h.size / 2, y: h.y + h.size / 2 } : null;
    },
  },
  {
    title: 'A new villager',
    text: () => 'More hands, more of everything. <b>Tap the Town Center</b> and <b>Train Villager</b>.',
    start: (t) => {
      t.villagersAtStart = t.units((u) => u.type === 'villager').length;
      t.afford(unitCost(t.world, t.me, 'villager'));
    },
    done: (t) => t.units((u) => u.type === 'villager').length > t.villagersAtStart,
    progress: (t) => {
      const tc = t.townCenter();
      const q = tc?.queue[0];
      return q?.unit ? `Training… ${Math.floor(q.progress * 100)}%` : '';
    },
    glow: [btn('Train Villager')],
    mark: (t) => {
      const tc = t.townCenter();
      return tc ? { x: tc.x + tc.size / 2, y: tc.y + tc.size / 2 } : null;
    },
  },
  {
    title: 'A Lumber Camp',
    text: () => 'To advance an age you need two buildings of this age. Start with a <b>Lumber Camp</b> beside the trees (Build Economy): woodcutters drop their loads there.',
    start: (t) => t.afford(buildingCost(t.world, t.me, 'lumber_camp')),
    done: (t) => t.buildings('lumber_camp').length > 0,
    glow: [btn('Build Economy'), btn('Lumber Camp'), btn('Place Lumber Camp')],
    mark: (t) => t.nearest('tree'),
  },
  {
    title: 'A Barracks',
    text: () => 'Now a <b>Barracks</b> (Build Military). It trains soldiers and counts toward advancing.',
    start: (t) => t.afford(buildingCost(t.world, t.me, 'barracks')),
    done: (t) => t.buildings('barracks').length > 0,
    glow: [btn('Build Military'), btn('Barracks'), btn('Place Barracks')],
  },
  {
    title: 'Advance an age',
    text: (t) =>
      t.buildings('lumber_camp', true).length && t.buildings('barracks', true).length
        ? 'Both are standing. Select the <b>Town Center</b> and research the <b>Township Age</b>. It takes a while: tap the <b>1×</b> button to speed the game up.'
        : 'Wait for the Lumber Camp and Barracks to be finished, then select the <b>Town Center</b> and research the <b>Township Age</b>. Tap <b>1×</b> to speed things up.',
    start: (t) => t.afford({ food: 500 }),
    done: (t) => t.world.players[t.me].age >= 1,
    progress: (t) => {
      const q = t.townCenter()?.queue.find((x) => x.tech === 'age2');
      return q ? `Advancing… ${Math.floor(q.progress * 100)}%` : '';
    },
    glow: [btn('Research Township Age'), '.speed-btn'],
    mark: (t) => {
      const tc = t.townCenter();
      return tc ? { x: tc.x + tc.size / 2, y: tc.y + tc.size / 2 } : null;
    },
  },
  {
    title: 'Wall the town',
    text: () =>
      'Walls make attackers pay. Select a villager, tap <b>Build Defense</b> and <b>Palisade Wall</b>, then <b>drag along the ground</b> to draw a line and confirm. Gates let your own people through.',
    start: (t) => t.afford({ wood: 120 }),
    done: (t) => t.buildings('palisade_wall').length + t.buildings('palisade_gate').length >= 5,
    progress: (t) => `${t.buildings('palisade_wall').length + t.buildings('palisade_gate').length} of 5 segments`,
    glow: [btn('Build Defense'), btn('Palisade Wall'), btn('Place Palisade Wall')],
  },
  {
    title: 'Raise an army',
    text: () => 'Select the <b>Barracks</b> and train <b>5 soldiers</b>. Militia are sturdy swordsmen; Spearmen stop horsemen.',
    start: (t) => t.afford(unitCost(t.world, t.me, 'militia'), 5),
    done: (t) => t.soldiers().length >= 5,
    progress: (t) => `${Math.min(5, t.soldiers().length)} of 5 soldiers`,
    glow: [btn('Train Militia'), btn('Train Spearman')],
    mark: (t) => {
      const b = t.buildings('barracks')[0];
      return b ? { x: b.x + b.size / 2, y: b.y + b.size / 2 } : null;
    },
  },
  {
    title: 'Attack!',
    text: () =>
      'Scouts report an enemy outpost (the ping on the minimap). Tap the <b>crossed swords</b> to select your whole army, then <b>tap the enemy Barracks</b> to attack. Tap <b>Show me</b> to look.',
    // The scouts' report puts the outpost on the map.
    start: (t) => {
      const b = t.world.building(t.outpost);
      if (b) t.world.fog[t.me]?.explore(b.x + b.size / 2, b.y + b.size / 2, 9);
    },
    done: (t) => !t.world.get(t.outpost),
    glow: ['.side-btn[aria-label="Select All Military"]'],
    mark: (t) => {
      const b = t.world.building(t.outpost);
      return b ? { x: b.x + b.size / 2, y: b.y + b.size / 2 } : null;
    },
  },
  {
    title: 'Victory!',
    text: () =>
      'The outpost has fallen. You know the essentials: gather, build, advance, fortify and fight. A real match is longer: four ages, siege engines, ships, and an opponent who fights back.',
  },
];
