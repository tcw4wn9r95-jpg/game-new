// The campaigns: three stories of different lengths, each a run of chapters
// (scenarios) with their own setup, goals and script. All names and text are
// original to Steel & Signal.
import type { UnitType } from './entities';
import { type Plan, type ScenarioDef, type Wave, registerScenarios } from './scenario';

export interface CampaignDef {
  id: string;
  title: string;
  /** "Short", "Long"... and roughly how long it takes. */
  length: string;
  blurb: string;
  chapters: string[];
  /** Every chapter playable from the start (stand-alone challenges). */
  open?: boolean;
}

const min = (m: number) => m * 60;

// ---------- Operation Ember (short: learn to hold a base) ----------

const forwardBase: ScenarioDef = {
  id: 'ember-1',
  campaign: 'ember',
  title: 'Forward Base',
  length: 'About 10 minutes',
  briefing: [
    'The Brannoch valley has been empty since the dam failed. You lead the reconstruction team back in: three engineers, a supply truck and a satellite uplink.',
    'Stand up a working base before winter. Gather food and wood, put up housing for the convoys on the road behind you, and expand.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4401 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 300, wood: 300, gold: 100, stone: 100 } },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [
      { kind: 'gather', amounts: { food: 600, wood: 600 }, label: 'Gather 600 food and 600 wood' },
      { kind: 'build', type: 'house', count: 4, label: 'Build 4 housing units' },
      { kind: 'age', age: 1, label: 'Advance to the Expansion Age' },
    ],
    lose: [],
    waves: [],
    messages: [
      { at: 3, text: 'The valley is quiet. Put the engineers to work: food first, then wood.' },
      { at: 150, text: 'More convoys are on the road. They will need housing.' },
      { at: 330, text: 'To expand you need two Foundation buildings, a Sawmill and a Food Depot, say, and 500 food.' },
    ],
  }),
};

const raidersAtTheFord: ScenarioDef = {
  id: 'ember-2',
  campaign: 'ember',
  title: 'Raiders at the Bridge',
  length: 'About 15 minutes',
  briefing: [
    'Word of the new base has reached the Ashen Riders, a militia in buggies who hold out in the hills. They come down to the bridge every few minutes, testing your nerve.',
    'Hold out for 12 minutes: keep the Command Center standing and your people alive. Train soldiers at the Barracks, and sound the air-raid siren when raiders reach the fields.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4402 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 600, wood: 500, gold: 200, stone: 200 }, units: [['villager', 5], ['militia', 3]], buildings: [['barracks', 1], ['house', 3]] },
  enemy: { kind: 'horde' },
  plan: () => ({
    objectives: [{ kind: 'survive', seconds: min(12), label: 'Hold out for 12 minutes' }],
    lose: [
      { kind: 'lose', type: 'town_center', label: 'The Command Center was destroyed' },
      { kind: 'villagers', below: 4, label: 'Too many of your engineers were lost' },
    ],
    waves: [
      { at: min(2), units: { scout: 4 }, from: 0, raid: true, text: 'Buggies at the bridge! They are after the engineers.' },
      { at: min(4), units: { scout: 4, militia: 4 }, from: 1, raid: true, text: 'Raiders from the hills!' },
      { at: min(6), units: { scout: 6, militia: 5, archer: 3 }, from: -1, raid: true, text: 'A larger convoy is coming!' },
      { at: min(8), units: { scout: 7, militia: 6, archer: 5 }, from: -1, raid: true, text: 'The Ashen Riders roll in force!' },
      { at: min(10), units: { scout: 8, spearman: 5, archer: 5, militia: 4 }, from: -1, raid: true, text: 'The last of them, desperate.' },
    ],
    messages: [
      { at: 5, text: 'Drones saw buggies in the hills. Train Breachers, and AT Troopers once you can: they stop vehicles.' },
      { at: min(11.5), text: 'Air support is inbound. Hold on.' },
    ],
  }),
};

const watchfort: ScenarioDef = {
  id: 'ember-3',
  campaign: 'ember',
  title: 'The Firebase',
  length: 'About 25 minutes',
  briefing: [
    'The raiders answer to a warlord who has dug a concrete firebase across the river and takes a toll from every truck that passes.',
    'Bring it down. The warlord has a small base of his own and will defend it, but he has grown lazy behind his walls.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4403 },
  factions: ['highland', 'mountain'],
  player: { resources: { food: 800, wood: 800, gold: 500, stone: 300 }, age: 1, units: [['villager', 7], ['militia', 4], ['archer', 3]], buildings: [['barracks', 1], ['archery_range', 1], ['house', 4], ['lumber_camp', 1], ['mill', 1]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 2, resources: { food: 400, wood: 400, gold: 400, stone: 400 }, buildings: [['castle', 1], ['barracks', 1], ['house', 3]], units: [['spearman', 3], ['archer', 3]] },
  plan: () => ({
    objectives: [{ kind: 'destroy', types: ['castle'], label: 'Destroy the firebase (the Fortress)' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Command Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Fortresses shrug off small arms. You will need breaching dozers: advance to the Network Age and build a Vehicle Factory.' },
      { at: min(15), text: 'Signals intercepts say the warlord is recalling his troops. Strike before they arrive.' },
    ],
  }),
};

// ---------- Varrow Conflict (long: a nation's war) ----------

const saltAndTimber: ScenarioDef = {
  id: 'march-1',
  campaign: 'march',
  title: 'Steel and Salt',
  length: 'About 20 minutes',
  briefing: [
    'The Republic of Varrow is poor in everything but sea and forest. Its newly elected president needs a navy, and a navy needs food, timber and a harbour.',
    'Build a Naval Dock and a trawler fleet, stockpile what a war will need, and advance to the Network Age.',
  ],
  map: { type: 'coastal', size: 'standard', seed: 5501 },
  factions: ['coastal', 'highland'],
  player: { resources: { food: 500, wood: 600, gold: 200, stone: 200 }, units: [['villager', 6]] },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [
      { kind: 'train', types: ['fishing_ship'], count: 5, label: 'Have 5 trawlers' },
      { kind: 'gather', amounts: { food: 2000, wood: 2000, gold: 600 }, label: 'Gather 2000 food, 2000 wood, 600 gold' },
      { kind: 'age', age: 2, label: 'Advance to the Network Age' },
    ],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'Find the shore and build a Naval Dock. Trawlers feed a base without farms.' },
      { at: min(8), text: 'The forests are deep. Sawmills close to the trees save long trips.' },
    ],
  }),
};

const saintsBones: ScenarioDef = {
  id: 'march-2',
  campaign: 'march',
  title: 'The Black Drives',
  length: 'About 30 minutes',
  briefing: [
    'Across Varrow lie the encrypted drives of the old intelligence service, scattered when the ministry fell. Whoever holds them holds the country\'s secrets.',
    'A rival strongman, General Orme, is after them too. Bring three drives home to your Intel HQs before he does, and hold them.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 5502 },
  factions: ['coastal', 'mountain'],
  player: { resources: { food: 1200, wood: 1000, gold: 800, stone: 400 }, age: 1, units: [['villager', 10], ['scout', 1], ['spearman', 4]], buildings: [['house', 5], ['barracks', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 1]] },
  enemy: { kind: 'ai', difficulty: 'normal', age: 1, resources: { food: 800, wood: 800, gold: 600, stone: 300 } },
  plan: () => ({
    objectives: [{ kind: 'relics', count: 3, label: 'Keep 3 intel drives in your Intel HQs' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Command Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Intel HQs come with the Network Age. Field agents carry the drives: guard them on the road.' },
      { at: min(12), text: "Orme's agents are on the move. Don't let him gather the drives first." },
    ],
  }),
};

const usurper: ScenarioDef = {
  id: 'march-3',
  campaign: 'march',
  title: 'The Coup',
  length: 'About 45 minutes',
  briefing: [
    'General Orme has declared himself head of state from his fortress at Hollin, and his armoured brigades are the best in Varrow.',
    'This ends with one government. Keep your Commander safe in the Fortress, and take down the general. Remove him and his regime falls apart.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 5503 },
  mode: 'regicide',
  factions: ['coastal', 'steppe'],
  player: { resources: { food: 1000, wood: 1000, gold: 600, stone: 300 }, age: 1, units: [['villager', 8]], buildings: [['house', 4], ['barracks', 1]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Take out General Orme (the enemy Commander)' }],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'Your Commander waits in the Fortress. If the enemy reaches the bunker, all is lost.' },
      { at: min(20), text: 'The general rarely leaves his walls. Missile launchers and breaching dozers will be needed.' },
    ],
  }),
};

// ---------- The Last Bastion (the invasion) ----------

/**
 * The siege of Highmoor: a rich, well-founded town with time to fortify,
 * then wave after wave from three directions, each larger and better armed,
 * until the final assault. Win by keeping the Castle standing to the end.
 */
function bastionPlan(variant: string): Plan {
  const total = Number(variant) || 30;
  const end = min(total);
  const prep = min(total <= 20 ? 6 : total <= 30 ? 8 : 10);
  const waves: Wave[] = [];
  const gap = total <= 20 ? 75 : total <= 30 ? 85 : 95;
  const count = Math.floor((end - prep - 90) / gap);
  for (let i = 0; i < count; i++) {
    const s = i / Math.max(1, count - 1); // 0 .. 1 over the siege
    const n = (base: number, grow: number) => Math.round(base + grow * s);
    const units: Partial<Record<UnitType, number>> = {
      militia: n(4, 8),
      spearman: n(2, 6),
      archer: n(3, 9),
    };
    if (s > 0.15) units.scout = n(1, 5);
    if (s > 0.25) units.knight = n(1, 8);
    if (s > 0.3) units.ram = s > 0.7 ? 3 : s > 0.45 ? 2 : 1;
    if (s > 0.45) units.mangonel = s > 0.75 ? 2 : 1;
    if (s > 0.55) units.skirmisher = n(0, 6);
    if (s > 0.7) units.trebuchet = s > 0.9 ? 2 : 1;
    if (s > 0.8) units.siege_tower = 1;
    const techs: Wave['techs'] = [];
    if (i === Math.floor(count * 0.3)) techs.push('age2', 'forging', 'fletching', 'scale_mail', 'scale_barding', 'padded_archer');
    if (i === Math.floor(count * 0.6)) techs.push('age3', 'iron_casting', 'bodkin_arrow', 'chain_mail', 'chain_barding', 'leather_archer', 'swordsman', 'crossbowman', 'pikeman');
    waves.push({
      at: prep + i * gap,
      units,
      from: i < 2 ? 0 : i % 3 === 2 ? -1 : i % 3,
      techs,
      text: i === 0 ? 'The horde is here! The first column comes down the east highway.' : s > 0.7 ? 'A great column approaches, with heavy weapons!' : 'Another column is coming!',
    });
  }
  // The final assault, from every side.
  waves.push({
    at: end - 90,
    units: { militia: 14, spearman: 10, archer: 14, knight: 10, ram: 4, trebuchet: 2, mangonel: 2, skirmisher: 6 },
    from: -1,
    techs: ['capped_ram', 'onager'],
    text: 'The final assault! Every unit of the horde converges on Highmoor!',
  });
  return {
    objectives: [{ kind: 'survive', seconds: end, label: `Keep the Fortress standing for ${total} minutes` }],
    lose: [{ kind: 'keep', label: 'The Highmoor Fortress has fallen' }],
    waves,
    messages: [
      { at: 3, text: `The horde arrives in ${Math.round(prep / 60)} minutes. Wall the base, raise towers, train an army.` },
      { at: prep - 120, text: 'Two minutes until the horde arrives. Man the walls!' },
      { at: prep + (end - prep) / 2, text: 'Halfway. The horde has brought armorers: their soldiers hit harder now.' },
      { at: end - 180, text: 'Three minutes left. A relief column has been sighted on the western highway!' },
    ],
  };
}

const lastBastion: ScenarioDef = {
  id: 'bastion-1',
  campaign: 'bastion',
  title: 'The Siege of Highmoor',
  length: '20, 30 or 45 minutes',
  briefing: [
    'From the east comes the Grey Horde: a mercenary army with no flag and no mercy. Every town in its path has burned. Highmoor is the last before the capital.',
    'You have a deep war chest, a strong Fortress and a few minutes of calm. Use them: wall the base, raise towers, fill the barracks. Then hold. If the Fortress stands when the time is up, the nation is saved.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 6601 },
  factions: ['mountain', 'steppe'],
  player: {
    resources: { food: 5000, wood: 5000, gold: 4000, stone: 5000 },
    age: 2,
    keep: 'castle',
    units: [['villager', 22], ['militia', 6], ['archer', 6], ['spearman', 4]],
    buildings: [['house', 10], ['barracks', 1], ['archery_range', 1], ['stable', 1], ['blacksmith', 1], ['siege_workshop', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 1]],
  },
  enemy: { kind: 'horde' },
  variants: [
    { id: '20', label: '20 min', note: 'A short siege: 6 minutes to prepare.' },
    { id: '30', label: '30 min', note: 'The full siege: 8 minutes to prepare.' },
    { id: '45', label: '45 min', note: 'An epic siege: 10 minutes to prepare, and many more waves.' },
  ],
  plan: bastionPlan,
};

// ---------- The Salt Isles (naval) ----------

const landfall: ScenarioDef = {
  id: 'isles-1',
  campaign: 'isles',
  title: 'Landfall',
  length: 'About 20 minutes',
  briefing: [
    'The Salt Isles are ruled from the sea. A pirate syndicate on the far island hijacks every ship that sails, and its harbour is the root of it.',
    'Shut that harbour down. Build warships at your Naval Dock, sink what sails against you, and destroy every enemy Naval Dock.',
  ],
  map: { type: 'islands', size: 'skirmish', seed: 7701 },
  factions: ['coastal', 'highland'],
  player: { resources: { food: 600, wood: 1500, gold: 500, stone: 200 }, age: 1, units: [['villager', 6]], buildings: [['dock', 1], ['house', 3], ['lumber_camp', 1]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 1, buildings: [['dock', 2]] },
  plan: () => ({
    objectives: [{ kind: 'destroy', types: ['dock'], label: "Destroy every enemy Naval Dock" }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Command Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Patrol Boats outshoot trawlers and docks. Gunboats shred patrol boats up close.' },
      { at: 420, text: 'The pirates are arming ships of their own. Strike before their fleet grows.' },
    ],
  }),
};

const seaLanes: ScenarioDef = {
  id: 'isles-2',
  campaign: 'isles',
  title: 'The Sea Lanes',
  length: 'About 25 minutes',
  briefing: [
    'With the harbour shut, the islanders look to you. But a fleet must be fed and crewed, and the Consortium across the strait wants the shipping lanes for itself.',
    'Build a navy of eight warships and bring in the catch to feed it, while the Consortium tests your shores.',
  ],
  map: { type: 'islands', size: 'standard', seed: 7702 },
  factions: ['coastal', 'steppe'],
  player: { resources: { food: 800, wood: 1500, gold: 700, stone: 300 }, age: 1, units: [['villager', 8], ['fishing_ship', 2]], buildings: [['dock', 1], ['house', 4], ['mill', 1], ['lumber_camp', 1]] },
  enemy: { kind: 'ai', difficulty: 'normal', age: 1 },
  plan: () => ({
    objectives: [
      { kind: 'train', types: ['galley', 'fire_ship', 'demolition_raft', 'siege_barge'], count: 8, label: 'Have 8 warships' },
      { kind: 'gather', amounts: { food: 3000 }, label: 'Bring in 3000 food' },
    ],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Command Center has fallen' }],
    waves: [],
    messages: [{ at: 5, text: 'Fish farms and trawlers keep a fleet fed. Guard them: warships hunt boats.' }],
  }),
};

const seaKing: ScenarioDef = {
  id: 'isles-3',
  campaign: 'isles',
  title: 'Admiral of the Strait',
  length: 'About 45 minutes',
  briefing: [
    'The Consortium has hired an admiral and armed every hull it owns. Only one fleet will leave the Salt Isles.',
    'Win the war: take the sea, then carry your army across and bring their island down.',
  ],
  map: { type: 'islands', size: 'standard', seed: 7703 },
  factions: ['coastal', 'mountain'],
  player: { resources: { food: 1000, wood: 1500, gold: 800, stone: 400 }, age: 1, units: [['villager', 10]], buildings: [['dock', 1], ['house', 5], ['barracks', 1]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Defeat the Consortium' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Landing Craft carry armies over the water: gather soldiers by the shore and send them across.' }],
  }),
};

// ---------- The Banner War (Domination) ----------

const crossings: ScenarioDef = {
  id: 'banner-1',
  campaign: 'banner',
  title: 'Hold the Crossings',
  length: 'About 20 minutes',
  briefing: [
    'Two private military companies fight over the river valley. The contract goes to whoever holds its crossings: three control points by the bridges.',
    'Take the points and keep them. Each one held scores; reach the target first, or hold them all for three minutes.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 8801 },
  mode: 'domination',
  factions: ['steppe', 'highland'],
  player: { resources: { food: 600, wood: 500, gold: 300, stone: 300 }, units: [['villager', 4], ['scout', 2], ['militia', 4]], buildings: [['barracks', 1], ['house', 3]] },
  enemy: { kind: 'ai', difficulty: 'easy' },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win on points, or hold every control point for 3 minutes' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Keep soldiers by an uplink for 20 seconds to take it. A tower beside it speeds the capture.' }],
  }),
};

const fieldOfBanners: ScenarioDef = {
  id: 'banner-2',
  campaign: 'banner',
  title: 'Field of Signals',
  length: 'About 35 minutes',
  briefing: [
    'The dispute has become a war, fought across the lake country for five control points. The rival company has hired seasoned officers.',
    'Hold more of the field than they do for longer. Fortify what you take: towers and Fortresses near a point make it hard to lose.',
  ],
  map: { type: 'lakes', size: 'standard', seed: 8802 },
  mode: 'domination',
  factions: ['mountain', 'coastal'],
  player: { resources: { food: 800, wood: 800, gold: 500, stone: 600 }, age: 1, units: [['villager', 8], ['scout', 1], ['spearman', 4]], buildings: [['barracks', 1], ['house', 4]] },
  enemy: { kind: 'ai', difficulty: 'normal', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win on points, or hold every control point for 3 minutes' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Five points: two near each base, one in the middle. The middle one decides most wars.' }],
  }),
};

// ---------- Trials (stand-alone challenges) ----------

const hungryWinter: ScenarioDef = {
  id: 'trial-winter',
  campaign: 'trials',
  title: 'The Hungry Winter',
  length: '15 minutes, against the clock',
  briefing: [
    'The harvest failed and the blizzards came early. The depots must hold 2500 food before the highways close, or the town will not see spring.',
    'Gather 2500 food in 15 minutes. Farms, fish, game and berries all count. Plan your workers well.',
  ],
  map: { type: 'lakes', size: 'skirmish', seed: 9901 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 200, wood: 800, gold: 200, stone: 100 }, units: [['villager', 6]], buildings: [['mill', 1], ['house', 3]] },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [{ kind: 'gather', amounts: { food: 2500 }, label: 'Gather 2500 food' }],
    lose: [{ kind: 'timeout', seconds: min(15), label: 'Winter came before the depots were full' }],
    waves: [],
    messages: [
      { at: 5, text: 'Engineers cost food, but every one you add gathers more. Farms last; berries and livestock are quick.' },
      { at: min(10), text: 'Five minutes left. The highways are closing.' },
    ],
  }),
};

/** Ironwood: a smaller town with no castle, holding out in the lake country. */
function ironwoodPlan(): Plan {
  const waves: Wave[] = [];
  const at = [3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5, 17.5, 19.5, 21.5, 23];
  at.forEach((m, i) => {
    const s = i / (at.length - 1);
    const n = (base: number, grow: number) => Math.round(base + grow * s);
    const units: Partial<Record<UnitType, number>> = { militia: n(3, 7), archer: n(2, 6) };
    if (s > 0.2) units.scout = n(1, 4);
    if (s > 0.35) units.spearman = n(1, 5);
    if (s > 0.5) units.knight = n(1, 4);
    if (s > 0.6) units.ram = s > 0.85 ? 2 : 1;
    if (s > 0.75) units.mangonel = 1;
    waves.push({
      at: min(m),
      units,
      from: i % 3 === 2 ? -1 : i % 2,
      techs: i === 5 ? ['forging', 'fletching', 'scale_mail'] : i === 8 ? ['age2', 'iron_casting', 'bodkin_arrow', 'swordsman'] : [],
      text: i === 0 ? 'Raiders come out of the woods!' : s > 0.6 ? 'A column with breaching dozers comes through the trees!' : 'More raiders are coming!',
    });
  });
  return {
    objectives: [{ kind: 'survive', seconds: min(25), label: 'Hold out for 25 minutes' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'The Ironwood Command Center has fallen' }],
    waves,
    messages: [
      { at: 5, text: 'No Fortress here, only what you build. Sandbags are cheap; concrete walls hold. Towers by the Command Center add firepower.' },
      { at: min(22), text: 'Three minutes to dawn. Hold!' },
    ],
  };
}

const ironwood: ScenarioDef = {
  id: 'trial-ironwood',
  campaign: 'trials',
  title: 'Ironwood Holdfast',
  length: 'About 25 minutes',
  briefing: [
    'Ironwood is a logging town in the lake country, without a fortress or a garrison. Raiders have learned that, and they are coming.',
    'Hold the Command Center for 25 minutes against raids from the forests. Your budget is modest; spend it well.',
  ],
  map: { type: 'lakes', size: 'standard', seed: 9902 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 1500, wood: 2000, gold: 800, stone: 800 }, age: 1, units: [['villager', 14], ['militia', 4], ['archer', 4]], buildings: [['barracks', 1], ['archery_range', 1], ['house', 6], ['lumber_camp', 1], ['mill', 1], ['mining_camp', 1]] },
  enemy: { kind: 'horde' },
  plan: ironwoodPlan,
};

const wonderRace: ScenarioDef = {
  id: 'trial-wonder',
  campaign: 'trials',
  title: 'The Space Race',
  length: 'About 45 minutes',
  briefing: [
    'Two rich city-states, one prize: the first to put a rocket into orbit wins the century. Your rival is as rich as you, and does not intend to lose.',
    'Build a Launch Complex and keep it standing for 8 minutes, or stop your rival from doing the same and win by conquest.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 9903 },
  factions: ['mountain', 'coastal'],
  player: { resources: { food: 3000, wood: 3000, gold: 3000, stone: 3000 }, age: 3, units: [['villager', 30], ['knight', 4], ['archer', 6]], buildings: [['house', 10], ['barracks', 1], ['archery_range', 1], ['stable', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 2]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 3, resources: { food: 3000, wood: 3000, gold: 3000, stone: 3000 }, units: [['villager', 30]], buildings: [['house', 10], ['barracks', 1], ['stable', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 2]] },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win: a Launch Complex that stands 8 minutes, or conquest' }],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'A Launch Complex takes 1000 of everything and a long time to build. Put many engineers on it, and guard them.' },
      { at: min(20), text: 'Satellites show your rival stockpiling stone. Watch for their Launch Complex.' },
    ],
  }),
};

const kingslayer: ScenarioDef = {
  id: 'trial-king',
  campaign: 'trials',
  title: 'Decapitation Strike',
  length: 'About 15 minutes',
  briefing: [
    'A dictator hides in his Fortress across the valley. His soldiers are few, his walls are not. Your tank crews are waiting for the word.',
    'Take out the enemy Commander. Keep yours alive.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 9904 },
  mode: 'regicide',
  factions: ['steppe', 'mountain'],
  player: { resources: { food: 800, wood: 800, gold: 800, stone: 300 }, age: 2, units: [['knight', 8], ['spearman', 6], ['archer', 6], ['ram', 2]], buildings: [['barracks', 1], ['stable', 1], ['siege_workshop', 1], ['house', 5]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 2, units: [['spearman', 6], ['archer', 6]] },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Take out the enemy Commander' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Breaching dozers crack Fortresses. When it falls the Commander runs: hunt him down.' }],
  }),
};

registerScenarios([forwardBase, raidersAtTheFord, watchfort, saltAndTimber, saintsBones, usurper, lastBastion, landfall, seaLanes, seaKing, crossings, fieldOfBanners, hungryWinter, ironwood, wonderRace, kingslayer]);

export const CAMPAIGNS: CampaignDef[] = [
  { id: 'ember', title: 'Operation Ember', length: 'Short · 3 missions · about 50 min', blurb: 'Rebuild a base in an empty valley and see off the raiders who prey on it.', chapters: ['ember-1', 'ember-2', 'ember-3'] },
  { id: 'march', title: 'The Varrow Conflict', length: 'Long · 3 missions · about 1 h 40 min', blurb: 'A new president, a rogue general, and a war for a poor, proud republic.', chapters: ['march-1', 'march-2', 'march-3'] },
  { id: 'bastion', title: 'The Last Bastion', length: 'One mission · 20 to 45 min', blurb: 'A rich town, a few minutes of calm, then the Grey Horde. Keep the Fortress standing.', chapters: ['bastion-1'] },
  { id: 'isles', title: 'The Salt Isles', length: 'Medium · 3 missions · about 1 h 30 min', blurb: 'An island nation ruled from the sea: shut down the pirate harbour, build a navy, win the war at sea.', chapters: ['isles-1', 'isles-2', 'isles-3'] },
  { id: 'banner', title: 'The Contract War', length: 'Short · 2 missions · about 55 min', blurb: 'Two private armies, a valley and its control points. Take them, fortify them, hold them.', chapters: ['banner-1', 'banner-2'] },
  { id: 'trials', title: 'Trials', length: 'Challenges · 4 · 15 to 45 min each', blurb: 'Stand-alone tests, all open: a race against winter, a logging-town siege, a space race, a decapitation strike.', chapters: ['trial-winter', 'trial-ironwood', 'trial-wonder', 'trial-king'], open: true },
];
