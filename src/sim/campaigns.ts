// The campaigns: three stories of different lengths, each a run of chapters
// (scenarios) with their own setup, goals and script. All names and text are
// original to Hearth & Crown.
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

// ---------- The Ember Road (short: learn to hold a village) ----------

const firstHearth: ScenarioDef = {
  id: 'ember-1',
  campaign: 'ember',
  title: 'First Hearth',
  length: 'About 10 minutes',
  briefing: [
    'The river valley of Brannoch has been empty since the floods. You lead the first families back: three villagers, a cart of seed and a promise.',
    'Build a living town before the winter. Gather food and wood, raise houses for the families on the road behind you, and grow into a township.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4401 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 300, wood: 300, gold: 100, stone: 100 } },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [
      { kind: 'gather', amounts: { food: 600, wood: 600 }, label: 'Gather 600 food and 600 wood' },
      { kind: 'build', type: 'house', count: 4, label: 'Build 4 houses' },
      { kind: 'age', age: 1, label: 'Advance to the Township Age' },
    ],
    lose: [],
    waves: [],
    messages: [
      { at: 3, text: 'The valley is quiet. Put the villagers to work: food first, then wood.' },
      { at: 150, text: 'More families are on the road. They will need houses.' },
      { at: 330, text: 'To become a township you need two Settlement buildings, a Lumber Camp and a Mill, say, and 500 food.' },
    ],
  }),
};

const raidersAtTheFord: ScenarioDef = {
  id: 'ember-2',
  campaign: 'ember',
  title: 'Raiders at the Ford',
  length: 'About 15 minutes',
  briefing: [
    'Word of the new town has reached the Ashen Riders, horse-thieves who winter in the hills. They come down to the ford every few minutes, testing your nerve.',
    'Hold out for 12 minutes: keep the Town Center standing and your people alive. Train soldiers at the Barracks, and ring the town bell when riders reach the fields.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4402 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 600, wood: 500, gold: 200, stone: 200 }, units: [['villager', 5], ['militia', 3]], buildings: [['barracks', 1], ['house', 3]] },
  enemy: { kind: 'horde' },
  plan: () => ({
    objectives: [{ kind: 'survive', seconds: min(12), label: 'Hold out for 12 minutes' }],
    lose: [
      { kind: 'lose', type: 'town_center', label: 'The Town Center has burned' },
      { kind: 'villagers', below: 4, label: 'Too many of your people were cut down' },
    ],
    waves: [
      { at: min(2), units: { scout: 4 }, from: 0, raid: true, text: 'Riders at the ford! They are after the villagers.' },
      { at: min(4), units: { scout: 4, militia: 4 }, from: 1, raid: true, text: 'Raiders from the hills!' },
      { at: min(6), units: { scout: 6, militia: 5, archer: 3 }, from: -1, raid: true, text: 'A larger band is coming!' },
      { at: min(8), units: { scout: 7, militia: 6, archer: 5 }, from: -1, raid: true, text: 'The Ashen Riders ride in force!' },
      { at: min(10), units: { scout: 8, spearman: 5, archer: 5, militia: 4 }, from: -1, raid: true, text: 'The last of them, desperate.' },
    ],
    messages: [
      { at: 5, text: 'Scouts saw riders in the hills. Train Militia, and Spearmen once you can: they stop horses.' },
      { at: min(11.5), text: 'Dawn is close. Hold on.' },
    ],
  }),
};

const watchfort: ScenarioDef = {
  id: 'ember-3',
  campaign: 'ember',
  title: 'The Watchfort',
  length: 'About 25 minutes',
  briefing: [
    'The riders answer to a lord who has built a stone watchfort across the river and takes a toll from every cart that passes.',
    'Bring it down. The lord has a small town of his own and will defend it, but he has grown lazy behind his walls.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 4403 },
  factions: ['highland', 'mountain'],
  player: { resources: { food: 800, wood: 800, gold: 500, stone: 300 }, age: 1, units: [['villager', 7], ['militia', 4], ['archer', 3]], buildings: [['barracks', 1], ['archery_range', 1], ['house', 4], ['lumber_camp', 1], ['mill', 1]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 2, resources: { food: 400, wood: 400, gold: 400, stone: 400 }, buildings: [['castle', 1], ['barracks', 1], ['house', 3]], units: [['spearman', 3], ['archer', 3]] },
  plan: () => ({
    objectives: [{ kind: 'destroy', types: ['castle'], label: 'Destroy the watchfort (the Castle)' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Town Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Castles shrug off swords and arrows. You will need rams: advance to the Stronghold Age and build a Siege Workshop.' },
      { at: min(15), text: 'Spies say the lord is calling his men home. Strike before they arrive.' },
    ],
  }),
};

// ---------- Crown of the March (long: a kingdom's war) ----------

const saltAndTimber: ScenarioDef = {
  id: 'march-1',
  campaign: 'march',
  title: 'Salt and Timber',
  length: 'About 20 minutes',
  briefing: [
    'The March of Varrow is poor in everything but sea and forest. Its young queen needs a fleet, and a fleet needs fish, timber and a harbour.',
    'Build a Dock and a fishing fleet, gather the stores a war will need, and advance to the Stronghold Age.',
  ],
  map: { type: 'coastal', size: 'standard', seed: 5501 },
  factions: ['coastal', 'highland'],
  player: { resources: { food: 500, wood: 600, gold: 200, stone: 200 }, units: [['villager', 6]] },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [
      { kind: 'train', types: ['fishing_ship'], count: 5, label: 'Have 5 fishing ships' },
      { kind: 'gather', amounts: { food: 2000, wood: 2000, gold: 600 }, label: 'Gather 2000 food, 2000 wood, 600 gold' },
      { kind: 'age', age: 2, label: 'Advance to the Stronghold Age' },
    ],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'Find the shore and build a Dock. Fishing ships feed a town without farms.' },
      { at: min(8), text: 'The forests are deep. Lumber camps close to the trees save long walks.' },
    ],
  }),
};

const saintsBones: ScenarioDef = {
  id: 'march-2',
  campaign: 'march',
  title: "The Saints' Bones",
  length: 'About 30 minutes',
  briefing: [
    'Across the March lie the reliquaries of the old saints, scattered when the abbeys fell. Whoever keeps them, the people say, keeps the crown.',
    'A rival claimant, the Duke of Orme, is after them too. Bring three relics home to your Monasteries before he does, and hold them.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 5502 },
  factions: ['coastal', 'mountain'],
  player: { resources: { food: 1200, wood: 1000, gold: 800, stone: 400 }, age: 1, units: [['villager', 10], ['scout', 1], ['spearman', 4]], buildings: [['house', 5], ['barracks', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 1]] },
  enemy: { kind: 'ai', difficulty: 'normal', age: 1, resources: { food: 800, wood: 800, gold: 600, stone: 300 } },
  plan: () => ({
    objectives: [{ kind: 'relics', count: 3, label: 'Keep 3 relics in your Monasteries' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Town Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Monasteries come with the Stronghold Age. Monks carry the relics: guard them on the road.' },
      { at: min(12), text: "The Duke's monks are on the move. Don't let him gather the relics first." },
    ],
  }),
};

const usurper: ScenarioDef = {
  id: 'march-3',
  campaign: 'march',
  title: 'The Usurper',
  length: 'About 45 minutes',
  briefing: [
    'The Duke of Orme has crowned himself in his castle at Hollin, and his armies are the best in the March.',
    'This ends with one crown. Keep your sovereign safe in the Castle, and bring down the usurper. Kill him and his realm falls apart.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 5503 },
  mode: 'regicide',
  factions: ['coastal', 'steppe'],
  player: { resources: { food: 1000, wood: 1000, gold: 600, stone: 300 }, age: 1, units: [['villager', 8]], buildings: [['house', 4], ['barracks', 1]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Slay the usurper (the enemy King)' }],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'Your sovereign waits in the Castle. If the enemy reaches the throne, all is lost.' },
      { at: min(20), text: 'The usurper rarely leaves his walls. Trebuchets and rams will be needed.' },
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
      text: i === 0 ? 'The horde is here! The first warband comes from the east road.' : s > 0.7 ? 'A great host approaches, with siege engines!' : 'Another warband is coming!',
    });
  }
  // The final assault, from every side.
  waves.push({
    at: end - 90,
    units: { militia: 14, spearman: 10, archer: 14, knight: 10, ram: 4, trebuchet: 2, mangonel: 2, skirmisher: 6 },
    from: -1,
    techs: ['capped_ram', 'onager'],
    text: 'The final assault! Every banner of the horde marches on Highmoor!',
  });
  return {
    objectives: [{ kind: 'survive', seconds: end, label: `Keep the Castle standing for ${total} minutes` }],
    lose: [{ kind: 'keep', label: 'The Castle of Highmoor has fallen' }],
    waves,
    messages: [
      { at: 3, text: `The horde arrives in ${Math.round(prep / 60)} minutes. Wall the town, raise towers, train an army.` },
      { at: prep - 120, text: 'Two minutes until the horde arrives. Man the walls!' },
      { at: prep + (end - prep) / 2, text: 'Halfway. The horde has brought blacksmiths: their soldiers hit harder now.' },
      { at: end - 180, text: 'Three minutes left. Relief riders have been sighted on the western road!' },
    ],
  };
}

const lastBastion: ScenarioDef = {
  id: 'bastion-1',
  campaign: 'bastion',
  title: 'The Siege of Highmoor',
  length: '20, 30 or 45 minutes',
  briefing: [
    'From the east comes the Grey Horde: no cities, no mercy, only the march. Every town in its path has burned. Highmoor is the last before the capital.',
    'You have a rich treasury, a strong Castle and a few minutes of peace. Use them: wall the town, raise towers, fill the barracks. Then hold. If the Castle stands when the time is up, the realm is saved.',
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
    'The Salt Isles are ruled from the sea. A pirate lord on the far island taxes every boat that sails, and his harbour is the root of it.',
    'Burn his harbour. Build warships at your Dock, sink what sails against you, and destroy every enemy Dock.',
  ],
  map: { type: 'islands', size: 'skirmish', seed: 7701 },
  factions: ['coastal', 'highland'],
  player: { resources: { food: 600, wood: 1500, gold: 500, stone: 200 }, age: 1, units: [['villager', 6]], buildings: [['dock', 1], ['house', 3], ['lumber_camp', 1]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 1, buildings: [['dock', 2]] },
  plan: () => ({
    objectives: [{ kind: 'destroy', types: ['dock'], label: "Destroy every enemy Dock" }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Town Center has fallen' }],
    waves: [],
    messages: [
      { at: 5, text: 'Galleys outshoot fishing boats and Docks. Fire Ships burn galleys up close.' },
      { at: 420, text: 'The pirates are building warships of their own. Strike before their fleet grows.' },
    ],
  }),
};

const seaLanes: ScenarioDef = {
  id: 'isles-2',
  campaign: 'isles',
  title: 'The Sea Lanes',
  length: 'About 25 minutes',
  briefing: [
    'With the harbour burned, the islanders look to you. But a fleet must be fed and crewed, and the Merchant Houses across the strait want the trade for themselves.',
    'Build a navy of eight warships and bring in the catch to feed it, while the Merchant Houses test your shores.',
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
    lose: [{ kind: 'lose', type: 'town_center', label: 'Your Town Center has fallen' }],
    waves: [],
    messages: [{ at: 5, text: 'Fish traps and fishing ships keep a fleet fed. Guard them: warships hunt boats.' }],
  }),
};

const seaKing: ScenarioDef = {
  id: 'isles-3',
  campaign: 'isles',
  title: 'The Sea King',
  length: 'About 45 minutes',
  briefing: [
    'The Merchant Houses have crowned an admiral and called every hull to war. Only one fleet will leave the Salt Isles.',
    'Win the war: take the sea, then carry your army across and bring their island down.',
  ],
  map: { type: 'islands', size: 'standard', seed: 7703 },
  factions: ['coastal', 'mountain'],
  player: { resources: { food: 1000, wood: 1500, gold: 800, stone: 400 }, age: 1, units: [['villager', 10]], buildings: [['dock', 1], ['house', 5], ['barracks', 1]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Defeat the Merchant Houses' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Transport Ships carry armies over the water: gather soldiers by the shore and send them across.' }],
  }),
};

// ---------- The Banner War (Domination) ----------

const crossings: ScenarioDef = {
  id: 'banner-1',
  campaign: 'banner',
  title: 'Hold the Crossings',
  length: 'About 20 minutes',
  briefing: [
    'Two barons quarrel over the river valley. The king will give it to whoever holds its crossings: three banner sites by the fords.',
    'Take the sites and keep them. Each one held scores points; reach the target first, or hold them all for three minutes.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 8801 },
  mode: 'domination',
  factions: ['steppe', 'highland'],
  player: { resources: { food: 600, wood: 500, gold: 300, stone: 300 }, units: [['villager', 4], ['scout', 2], ['militia', 4]], buildings: [['barracks', 1], ['house', 3]] },
  enemy: { kind: 'ai', difficulty: 'easy' },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win on points, or hold every site for 3 minutes' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Stand soldiers by a banner for 20 seconds to take it. A tower beside it speeds the capture.' }],
  }),
};

const fieldOfBanners: ScenarioDef = {
  id: 'banner-2',
  campaign: 'banner',
  title: 'Field of Banners',
  length: 'About 35 minutes',
  briefing: [
    'The quarrel has become a war, fought across the lake country for five banner sites. The rival baron has hired seasoned captains.',
    'Hold more of the field than he does for longer. Fortify what you take: towers and Castles near a site make it hard to lose.',
  ],
  map: { type: 'lakes', size: 'standard', seed: 8802 },
  mode: 'domination',
  factions: ['mountain', 'coastal'],
  player: { resources: { food: 800, wood: 800, gold: 500, stone: 600 }, age: 1, units: [['villager', 8], ['scout', 1], ['spearman', 4]], buildings: [['barracks', 1], ['house', 4]] },
  enemy: { kind: 'ai', difficulty: 'normal', age: 1 },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win on points, or hold every site for 3 minutes' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Five sites: two near each base, one in the middle. The middle one decides most wars.' }],
  }),
};

// ---------- Trials (stand-alone challenges) ----------

const hungryWinter: ScenarioDef = {
  id: 'trial-winter',
  campaign: 'trials',
  title: 'The Hungry Winter',
  length: '15 minutes, against the clock',
  briefing: [
    'The harvest failed and the snows came early. The granaries must hold 2500 food before the passes close, or the town will not see spring.',
    'Gather 2500 food in 15 minutes. Farms, fish, game and berries all count. Plan your workers well.',
  ],
  map: { type: 'lakes', size: 'skirmish', seed: 9901 },
  factions: ['highland', 'steppe'],
  player: { resources: { food: 200, wood: 800, gold: 200, stone: 100 }, units: [['villager', 6]], buildings: [['mill', 1], ['house', 3]] },
  enemy: { kind: 'none' },
  plan: () => ({
    objectives: [{ kind: 'gather', amounts: { food: 2500 }, label: 'Gather 2500 food' }],
    lose: [{ kind: 'timeout', seconds: min(15), label: 'Winter came before the granaries were full' }],
    waves: [],
    messages: [
      { at: 5, text: 'Villagers cost food, but every one you add gathers more. Farms last; berries and game are quick.' },
      { at: min(10), text: 'Five minutes left. The passes are closing.' },
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
      text: i === 0 ? 'Raiders come out of the woods!' : s > 0.6 ? 'A war-host with rams comes through the trees!' : 'More raiders are coming!',
    });
  });
  return {
    objectives: [{ kind: 'survive', seconds: min(25), label: 'Hold out for 25 minutes' }],
    lose: [{ kind: 'lose', type: 'town_center', label: 'The Town Center of Ironwood has fallen' }],
    waves,
    messages: [
      { at: 5, text: 'No Castle here, only what you build. Palisades are cheap; stone walls hold. Towers by the Town Center add arrows.' },
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
    'Ironwood is a timber town in the lake country, without a castle or a garrison. Raiders have learned that, and they are coming.',
    'Hold the Town Center for 25 minutes against raids from the forests. Your treasury is modest; spend it well.',
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
  title: 'The Wonder Race',
  length: 'About 45 minutes',
  briefing: [
    'Two rich cities, one prize: the king has promised his crown to whoever raises the greatest monument. Your rival is as rich as you, and does not intend to lose.',
    'Build a Wonder and keep it standing for 8 minutes, or stop your rival from doing the same and win by conquest.',
  ],
  map: { type: 'heartland', size: 'standard', seed: 9903 },
  factions: ['mountain', 'coastal'],
  player: { resources: { food: 3000, wood: 3000, gold: 3000, stone: 3000 }, age: 3, units: [['villager', 30], ['knight', 4], ['archer', 6]], buildings: [['house', 10], ['barracks', 1], ['archery_range', 1], ['stable', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 2]] },
  enemy: { kind: 'ai', difficulty: 'hard', age: 3, resources: { food: 3000, wood: 3000, gold: 3000, stone: 3000 }, units: [['villager', 30]], buildings: [['house', 10], ['barracks', 1], ['stable', 1], ['mill', 1], ['lumber_camp', 1], ['mining_camp', 2]] },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Win: a Wonder that stands 8 minutes, or conquest' }],
    lose: [],
    waves: [],
    messages: [
      { at: 5, text: 'A Wonder takes 1000 of everything and a long time to build. Put many villagers on it, and guard them.' },
      { at: min(20), text: 'Spies report your rival is gathering stone. Watch for his Wonder.' },
    ],
  }),
};

const kingslayer: ScenarioDef = {
  id: 'trial-king',
  campaign: 'trials',
  title: 'Kingslayer',
  length: 'About 15 minutes',
  briefing: [
    'A tyrant hides in his Castle across the valley. His soldiers are few, his walls are not. Your knights are waiting for the word.',
    'Slay the enemy King. Keep yours alive.',
  ],
  map: { type: 'heartland', size: 'skirmish', seed: 9904 },
  mode: 'regicide',
  factions: ['steppe', 'mountain'],
  player: { resources: { food: 800, wood: 800, gold: 800, stone: 300 }, age: 2, units: [['knight', 8], ['spearman', 6], ['archer', 6], ['ram', 2]], buildings: [['barracks', 1], ['stable', 1], ['siege_workshop', 1], ['house', 5]] },
  enemy: { kind: 'ai', difficulty: 'easy', age: 2, units: [['spearman', 6], ['archer', 6]] },
  plan: () => ({
    objectives: [{ kind: 'win', label: 'Slay the enemy King' }],
    lose: [],
    waves: [],
    messages: [{ at: 5, text: 'Rams break Castles. When the Castle falls the King runs: hunt him down.' }],
  }),
};

registerScenarios([firstHearth, raidersAtTheFord, watchfort, saltAndTimber, saintsBones, usurper, lastBastion, landfall, seaLanes, seaKing, crossings, fieldOfBanners, hungryWinter, ironwood, wonderRace, kingslayer]);

export const CAMPAIGNS: CampaignDef[] = [
  { id: 'ember', title: 'The Ember Road', length: 'Short · 3 chapters · about 50 min', blurb: 'Found a town in an empty valley and see off the riders who prey on it.', chapters: ['ember-1', 'ember-2', 'ember-3'] },
  { id: 'march', title: 'Crown of the March', length: 'Long · 3 chapters · about 1 h 40 min', blurb: 'A young queen, a rival duke, and a war for the crown of a poor, proud land.', chapters: ['march-1', 'march-2', 'march-3'] },
  { id: 'bastion', title: 'The Last Bastion', length: 'One chapter · 20 to 45 min', blurb: 'A rich town, a few minutes of peace, then the Grey Horde. Keep the Castle standing.', chapters: ['bastion-1'] },
  { id: 'isles', title: 'The Salt Isles', length: 'Medium · 3 chapters · about 1 h 30 min', blurb: 'An island realm ruled from the sea: burn the pirate harbour, build a navy, win the war at sea.', chapters: ['isles-1', 'isles-2', 'isles-3'] },
  { id: 'banner', title: 'The Banner War', length: 'Short · 2 chapters · about 55 min', blurb: 'Two barons, a valley and its banner sites. Take them, fortify them, hold them.', chapters: ['banner-1', 'banner-2'] },
  { id: 'trials', title: 'Trials', length: 'Challenges · 4 · 15 to 45 min each', blurb: 'Stand-alone tests, all open: a race against winter, a timber-town siege, a Wonder race, a royal hunt.', chapters: ['trial-winter', 'trial-ironwood', 'trial-wonder', 'trial-king'], open: true },
];
