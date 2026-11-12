import { describe, expect, it } from 'vitest';
import { prunedBy, reselect } from '../src/content/features/pvp/battles/selection';
import { battlePanelVm, battlesViewModel } from '../src/content/features/pvp/battles/view-model';
import { incomingViewModel } from '../src/content/features/pvp/incoming/view-model';
import { pruneBefore } from '../src/content/features/pvp/retention';
import {
  isFiltered,
  type MarkFilter,
  NO_FILTER,
  opponentsFor,
  pickedPlayer,
  rowsShown,
  type ViewInput,
} from '../src/content/features/pvp/rows';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type {
  BattleSummary,
  BattleWithPlunder,
  FoughtBattle,
  IncomingAttack,
  IncomingTotals,
  Player,
  Plunder,
} from '../src/shared/model';
import { playerLookups } from './helpers/player-lookups';

const now = new Date(2026, 9, 19, 15, 0).getTime();
const DAY = 86_400_000;

const battle = (battleId: number, opponent: number, change: Partial<FoughtBattle> = {}): FoughtBattle => ({
  world: worldId('de20'),
  battleId,
  at: new Date(2026, 9, 19, 13, 49).getTime(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 2,
  era: eraId('ColonialAge'),
  attacker: { bonuses: { attack_boost: 233, attacker_defense_boost: 134, military_boost: 135 }, units: [] },
  defender: {
    bonuses: { defender_attack_boost: 353, defense_boost: 390, fierce_resistance: 32.5, advanced_tactics: 20.5 },
    units: [],
  },
  ...change,
});

const plunder = (opponent: number, change: Partial<Plunder> = {}): Plunder => ({
  world: worldId('de20'),
  at: new Date(2026, 9, 19, 14, 5).getTime(),
  opponent: playerId(opponent),
  outcome: 'plundered',
  entityId: 350,
  def: buildingDefId('R_IronAge_Residential2'),
  resources: { money: 1220, strategy_points: 5 },
  doubleLoot: false,
  ...change,
});

const player = (id: number, name: string, marks: Partial<Player> = {}) =>
  ({ id: playerId(id), name, ...marks }) as Player;
const names: Record<number, string> = { 1001: 'Testgegner' };
const base: ViewInput = {
  filter: NO_FILTER,
  lookups: playerLookups({
    playerName: (id: PlayerId) => names[id],
    playerGuild: (id: PlayerId) => (id === 1001 ? { name: 'Testgilde', url: '' } : undefined),
    plunderWorthy: (id: PlayerId) => (id === 1001 ? true : undefined),
    noAttack: (id: PlayerId) => (id === 1001 ? false : undefined),
  }),
  building: (id) => (id === 'R_IronAge_Residential2' ? 'Strohdachhaus' : undefined),
  resourceName: () => undefined,
  unit: (id: string) => (id === 'rogue' ? { name: 'Agent', unitClass: 'light_melee' } : undefined),
  note: (id: PlayerId) => (id === 1001 ? '**stark**\n- *Schilde*' : undefined),
  now,
};
const summaryOf = (battles: BattleWithPlunder[]): BattleSummary => ({
  battles: battles.length,
  won: battles.filter((b) => b.result === 'won').length,
  plunders: 0,
  repelled: 0,
  fp: 0,
});
const battlesOf = (battles: BattleWithPlunder[], change: Partial<ViewInput> = {}, summary = summaryOf(battles)) =>
  battlesViewModel({ ...base, ...change, battles, summary, from: 0 });

describe('pvp view model', () => {
  it('marks the selected row only', () => {
    const vm = battlesOf([battle(1, 1001), battle(2, 1002)], { selected: 2 });
    expect(vm.rows.map((r) => r.selected)).toEqual([false, true]);
  });

  it('shows one row per battle with name, marks, time, result and measured armies', () => {
    const vm = battlesOf([battle(1, 1001), battle(2, 1002, { result: 'surrendered', auto: false, rounds: 5 })]);
    expect(vm.rows[0]).toEqual({
      battleId: 1,
      opponent: 1001,
      name: 'Testgegner',
      nameTip: 'Testgegner [Testgilde]',
      url: 'https://foestats.com/de/de20/players/1001',
      plunderWorthy: true,
      noAttack: false,
      picked: false,
      when: 'heute 13:49',
      result: 'gewonnen',
      outcome: 'won',
      battle: 'Autokampf',
      attacker: { attack: 368, defense: 269 },
      defender: { attack: 406, defense: 443 },
      selected: false,
      note: 'stark\n• Schilde',
    });
    expect(vm.rows[1]).toMatchObject({
      name: '1002',
      nameTip: '1002',
      result: 'aufgegeben',
      battle: '5 Runden',
      note: '',
      picked: false,
    });
    // a player the store does not know has no marks to toggle
    expect(vm.rows[1]?.plunderWorthy).toBeUndefined();
    expect(vm.rows[1]?.noAttack).toBeUndefined();
    expect(vm).toMatchObject({ tab: 'battles', total: 2, from: 0, empty: undefined });
  });

  it('fills the funnel of the rows whose name the field names exactly, in any case', () => {
    const rows = battlesOf([battle(1, 1001), battle(2, 1002)], { filter: { ...NO_FILTER, name: ' testGEGNER ' } }).rows;
    expect(rows.map((r) => r.picked)).toEqual([true, false]);
    const part = battlesOf([battle(1, 1001)], { filter: { ...NO_FILTER, name: 'Test' } }).rows;
    expect(part[0]?.picked).toBe(false);
    const byId = battlesOf([battle(2, 1002)], { filter: { ...NO_FILTER, name: '1002' } }).rows;
    expect(byId[0]?.picked).toBe(true);
  });

  it('marks a battle with its plunder by the sack, plundered or repelled, and none without', () => {
    const rows = battlesOf([
      { ...battle(1, 1001), plunder: plunder(1001) },
      { ...battle(2, 1001), plunder: plunder(1001, { outcome: 'repelled', resources: {} }) },
      battle(3, 1001),
    ]).rows;
    expect(rows.map((r) => r.loot)).toEqual(['plundered', 'repelled', undefined]);
  });

  it('shows a fought battle in the side panel with units, armies and result, then its plunder', () => {
    const units = { units: [{ unitTypeId: 'rogue', startHp: 10, endHp: 8 }] };
    const first = battle(1, 1001);
    const vm = battlePanelVm(
      { ...first, attacker: { ...first.attacker, ...units }, plunder: plunder(1001, { doubleLoot: true }) },
      base,
    );
    expect(vm).toMatchObject({
      name: 'Testgegner',
      guild: { name: 'Testgilde', url: '' },
      when: 'heute 13:49',
      outcome: 'won',
      result: 'gewonnen',
      inferred: false,
      details: {
        summary: 'Autokampf, 2 Runden',
        own: [{ unit: 'Agent', tip: 'Einheit: Agent\nTyp: Leichte Einheit\nLP: 8/10', health: 0.8, dead: false }],
        army: { own: { attack: 368, defense: 269 }, opponent: { attack: 406, defense: 443 } },
      },
      plunder: {
        outcome: 'plundered',
        building: 'Strohdachhaus',
        loot: ['1.220 Münzen', '5 Forge-Punkte'],
        doubleLoot: true,
      },
    });
    expect(battlePanelVm(battle(2, 1002), base).plunder).toBeUndefined();
    expect(battlePanelVm(battle(2, 1002), base).guild).toBeUndefined();
  });

  it('names the era of a plundered good in the tooltip of the loot in the panel, not in its lines', () => {
    const input: ViewInput = {
      ...base,
      resourceName: (id) => (id === 'wine' ? 'Wein' : undefined),
      goodEra: (id) => (id === 'wine' ? 'Bronzezeit' : undefined),
    };
    const p = plunder(1001, { resources: { wine: 5, money: 20 } });
    expect(battlePanelVm({ ...battle(1, 1001), plunder: p }, input).plunder).toMatchObject({
      loot: ['5 Wein', '20 Münzen'],
      lootTip: '5 Wein (Bronzezeit)\n20 Münzen',
    });
  });

  it('names the building of the plunder in the panel, unknown by its id, none by a dash', () => {
    const plunderOf = (p: Plunder) => battlePanelVm({ ...battle(1, 1001), plunder: p }, base).plunder;
    expect(plunderOf(plunder(1001, { def: buildingDefId('R_Unknown') }))).toEqual({
      when: 'heute 14:05',
      outcome: 'plundered',
      building: 'R_Unknown',
      loot: ['1.220 Münzen', '5 Forge-Punkte'],
      doubleLoot: false,
    });
    expect(
      plunderOf(plunder(1001, { outcome: 'repelled', resources: {}, entityId: undefined, def: undefined })),
    ).toEqual({ when: 'heute 14:05', outcome: 'repelled', building: '–', loot: [], doubleLoot: false });
  });

  it('gives the plunder in the panel the image of its building once it is known', () => {
    const images = { ...base, buildingImage: (id: string) => (id === 'R_Unknown' ? 'https://cdn/r.png' : undefined) };
    const plunderOf = (p: Plunder) => battlePanelVm({ ...battle(1, 1001), plunder: p }, images).plunder;
    expect(plunderOf(plunder(1001, { def: buildingDefId('R_Unknown') }))?.image).toBe('https://cdn/r.png');
    expect(plunderOf(plunder(1001))).not.toHaveProperty('image');
  });

  it('shows an inferred battle as won at the latest at its time, without armies, in the panel only its plunder', () => {
    const at = new Date(2026, 9, 19, 14, 5).getTime();
    const inferred: BattleWithPlunder = {
      world: worldId('de20'),
      battleId: -at,
      at,
      opponent: playerId(1001),
      result: 'won',
      inferred: true,
      plunderAt: at,
      plunder: plunder(1001, { at }),
    };
    expect(battlesOf([inferred]).rows[0]).toEqual({
      battleId: -at,
      opponent: 1001,
      name: 'Testgegner',
      nameTip: 'Testgegner [Testgilde]',
      url: 'https://foestats.com/de/de20/players/1001',
      plunderWorthy: true,
      noAttack: false,
      picked: false,
      when: '≈ heute 14:05',
      result: 'gewonnen',
      outcome: 'won',
      battle: 'erschlossen',
      inferred: true,
      loot: 'plundered',
      selected: false,
      note: 'stark\n• Schilde',
    });
    const panel = battlePanelVm(inferred, base);
    expect(panel).toMatchObject({
      inferred: true,
      when: 'spätestens heute 14:05',
      plunder: { building: 'Strohdachhaus' },
    });
    expect(panel.details).toBeUndefined();
  });

  it('names one round in singular', () => {
    const vm = battlesOf([battle(1, 1001, { auto: false, rounds: 1 }), battle(2, 1001, { auto: false, rounds: 4 })]);
    expect(vm.rows.map((r) => r.battle)).toEqual(['1 Runde', '4 Runden']);
  });

  it('tells no battles from no match, each filter counting', () => {
    expect(battlesOf([]).empty).toBe('none');
    const marks = NO_FILTER.marks;
    const loot = NO_FILTER.loot;
    for (const change of [
      { name: 'xy' },
      { marks: { ...marks, plunder: false } },
      { marks: { ...marks, noAttack: false } },
      { marks: { ...marks, none: false } },
      { loot: { ...loot, with: false } },
      { loot: { ...loot, without: false } },
    ]) {
      expect(battlesOf([], { filter: { ...NO_FILTER, ...change } }).empty).toBe('noMatch');
    }
    // the sack filter does not apply to the attacks on the own city
    const incoming = (filter = NO_FILTER) =>
      incomingViewModel({
        ...base,
        filter,
        incoming: [],
        incomingTotals: { battles: 0, held: 0, plunders: 0 },
        from: 0,
      });
    expect(incoming({ ...NO_FILTER, loot: { with: true, without: false } }).empty).toBe('none');
    expect(incoming({ ...NO_FILTER, marks: { ...NO_FILTER.marks, noAttack: false } }).empty).toBe('noMatch');
  });

  it('sums up the battles and their plunders the filter matches', () => {
    const totals = (summary: BattleSummary) => battlesOf([], {}, summary).totals;
    expect(totals({ battles: 9, won: 8, plunders: 3, repelled: 2, fp: 2 })).toBe(
      '9 Kämpfe, 8 gewonnen · 3 Plünderungen, 2 abgewehrt, 2 FP',
    );
    expect(totals({ battles: 1, won: 1, plunders: 1, repelled: 0, fp: 1234 })).toBe(
      '1 Kampf, 1 gewonnen · 1 Plünderung, 1.234 FP',
    );
    expect(totals({ battles: 0, won: 0, plunders: 0, repelled: 0, fp: 0 })).toBe(
      '0 Kämpfe, 0 gewonnen · 0 Plünderungen, 0 FP',
    );
  });

  it('keeps the index of the first loaded row and the total over the whole list', () => {
    const vm = battlesViewModel({
      ...base,
      battles: [battle(1, 1001)],
      summary: { ...summaryOf([]), battles: 90 },
      from: 40,
    });
    expect(vm).toMatchObject({ total: 90, from: 40 });
  });

  it('shows one row per attack on the own city and the totals of those attacks', () => {
    const at = new Date(2026, 9, 19, 14, 5).getTime();
    const attack = (key: number, change: Partial<IncomingAttack>): IncomingAttack => ({
      world: worldId('de20'),
      kind: 'battle',
      key,
      at,
      attacker: playerId(1001),
      ...change,
    });
    const vm = incomingViewModel({
      ...base,
      incoming: [
        attack(1, { defense: 'broken' }),
        attack(2, { defense: 'held', attacker: playerId(1002), at: at - 3 * DAY }),
        attack(3, { kind: 'plunder', def: buildingDefId('R_IronAge_Residential2') }),
        attack(4, { kind: 'plunder', def: buildingDefId('R_Unknown') }),
        // from the old toolbox, without the outcome
        attack(5, {}),
      ],
      incomingTotals: { battles: 3, held: 1, plunders: 2 },
      from: 0,
    });
    expect(vm.rows).toEqual([
      {
        opponent: 1001,
        name: 'Testgegner',
        nameTip: 'Testgegner [Testgilde]',
        url: 'https://foestats.com/de/de20/players/1001',
        plunderWorthy: true,
        noAttack: false,
        picked: false,
        when: 'heute 14:05',
        what: 'Kampf: durchbrochen',
        note: 'stark\n• Schilde',
      },
      {
        opponent: 1002,
        name: '1002',
        nameTip: '1002',
        url: 'https://foestats.com/de/de20/players/1002',
        picked: false,
        when: '16.10., 14:05',
        what: 'Kampf: gehalten',
        note: '',
      },
      expect.objectContaining({ what: 'Plünderung: Strohdachhaus' }),
      expect.objectContaining({ what: 'Plünderung: R_Unknown' }),
      expect.objectContaining({ what: 'Kampf' }),
    ]);
    expect(vm).toMatchObject({ tab: 'incoming', totals: '3 Angriffe, 1 abgewehrt, 2 Plünderungen', total: 5 });
  });

  it('names one attack and one plunder in singular and leaves out held ones when there are none', () => {
    const totals = (incomingTotals: IncomingTotals) =>
      incomingViewModel({ ...base, incoming: [], incomingTotals, from: 0 }).totals;
    expect(totals({ battles: 1, held: 0, plunders: 1 })).toBe('1 Angriff, 1 Plünderung');
    expect(totals({ battles: 0, held: 0, plunders: 0 })).toBe('0 Angriffe, 0 Plünderungen');
  });
});

describe('pvp filter', () => {
  const players = [
    player(1, 'Anna', { plunderWorthy: true }),
    player(2, 'Hannes', { noAttack: true }),
    player(3, 'Bert', { plunderWorthy: true }),
    player(4, 'Ann'),
  ];
  const scope = (change: Partial<typeof NO_FILTER>, known = players) =>
    opponentsFor({ ...NO_FILTER, ...change }, known);
  const filter = (change: Partial<typeof NO_FILTER>) => scope(change).opponents;
  const marks = (change: Partial<MarkFilter>): Partial<typeof NO_FILTER> => ({
    marks: { plunder: false, noAttack: false, none: false, ...change },
  });

  it('matches names by text, ignoring case', () => {
    expect(filter({ name: ' NN' })).toEqual([1, 2, 4]);
    expect(filter({ name: 'zz' })).toEqual([]);
    expect(scope({ name: ' ' })).toEqual({});
  });

  it('takes the exact name of a known player alone, as the funnel writes it', () => {
    expect(filter({ name: 'ann ' })).toEqual([4]);
    expect(filter({ name: 'Bert' })).toEqual([3]);
  });

  it('takes the id a row shows for a player the store does not know', () => {
    expect(filter({ name: '222' })).toEqual([222]);
  });

  it('shows every player with all mark toggles on', () => {
    expect(scope({})).toEqual({});
  });

  it('keeps the players of the mark toggles that are on, together with the name', () => {
    expect(filter(marks({ plunder: true }))).toEqual([1, 3]);
    expect(filter(marks({ noAttack: true }))).toEqual([2]);
    expect(filter(marks({ plunder: true, noAttack: true }))).toEqual([1, 2, 3]);
    expect(filter({ ...marks({ plunder: true }), name: 'an' })).toEqual([1]);
    expect(filter({ ...marks({ noAttack: true }), name: 'Anna' })).toEqual([]);
    expect(filter(marks({}))).toEqual([]);
  });

  it('shows the players without a mark with "ohne Markierung", the unknown ones too', () => {
    // a known player without a mark is named, the unknown ones pass because the scope leaves out instead
    expect(scope(marks({ none: true }))).toEqual({ exceptOpponents: [1, 2, 3] });
    expect(scope(marks({ none: true, plunder: true }))).toEqual({ exceptOpponents: [2] });
    expect(filter({ ...marks({ none: true }), name: 'an' })).toEqual([4]);
    // the id of an unknown player in the field
    expect(filter({ ...marks({ none: true }), name: '222' })).toEqual([222]);
    expect(filter({ ...marks({ plunder: true }), name: '222' })).toEqual([]);
  });

  it('shows a player with both marks while either of its toggles is on', () => {
    const both = [player(5, 'Doppelt', { plunderWorthy: true, noAttack: true })];
    expect(scope(marks({ plunder: true }), both).opponents).toEqual([5]);
    expect(scope(marks({ noAttack: true }), both).opponents).toEqual([5]);
    expect(scope(marks({ none: true }), both)).toEqual({ exceptOpponents: [5] });
  });

  it('leaves the sack toggles to the store', () => {
    expect(scope({ loot: { with: true, without: false } })).toEqual({});
  });

  it('counts as filtered when any toggle is off', () => {
    expect(isFiltered(NO_FILTER, 'battles')).toBe(false);
    expect(isFiltered({ ...NO_FILTER, marks: { ...NO_FILTER.marks, none: false } }, 'incoming')).toBe(true);
    expect(isFiltered({ ...NO_FILTER, loot: { with: false, without: true } }, 'battles')).toBe(true);
    expect(isFiltered({ ...NO_FILTER, loot: { with: false, without: true } }, 'incoming')).toBe(false);
  });

  it('picks the one player the field names exactly, for the note card', () => {
    expect(pickedPlayer('ANNA', players)).toBe(1);
    expect(pickedPlayer('An', players)).toBeUndefined();
    expect(pickedPlayer('', players)).toBeUndefined();
    expect(pickedPlayer('555', players)).toBe(555);
    expect(pickedPlayer('X', [player(1, 'X'), player(2, 'x')])).toBeUndefined();
  });
});

describe('pvp row window', () => {
  it('picks the drawn rows out of the loaded slice', () => {
    const loaded = Array.from({ length: 60 }, (_, i) => 20 + i);
    expect(rowsShown(loaded, 20, 100, { top: 41, below: 56 })).toEqual([41, 42, 43]);
    expect(rowsShown(loaded, 20, 100, { top: 18, below: 78 })).toEqual([20, 21]);
  });
});

describe('pvp selection', () => {
  const at = (battleId: number, time: number) => ({ ...battle(battleId, 1001), at: time });
  const selected = at(5, 500);

  it('keeps the selected battle as read again, with a plunder that came meanwhile', () => {
    const again = { ...selected, plunder: plunder(1001) };
    expect(reselect(selected, [at(6, 600), again], 0, 2)).toBe(again);
  });

  it('clears the selection when the slice spans its time but no longer has it', () => {
    expect(reselect(selected, [at(6, 600), at(4, 400)], 10, 30)).toBeUndefined();
    expect(reselect(selected, [], 0, 0)).toBeUndefined();
    // the slice reaches the end of the list
    expect(reselect(selected, [at(6, 600)], 0, 1)).toBeUndefined();
  });

  it('keeps the selection when the slice does not reach its time', () => {
    expect(reselect(selected, [at(9, 900), at(8, 800)], 0, 50)).toBe(selected);
    expect(reselect(selected, [at(3, 300), at(2, 200)], 20, 50)).toBe(selected);
  });

  it('knows when pruning deletes the battle: it stays while it or its plunder is newer', () => {
    expect(prunedBy(selected, 501)).toBe(true);
    expect(prunedBy(selected, 500)).toBe(false);
    expect(prunedBy({ ...selected, plunderAt: 700 }, 600)).toBe(false);
  });
});

describe('battle retention', () => {
  it('keeps everything by default and cuts at the chosen number of days', () => {
    expect(pruneBefore('forever', now)).toBeUndefined();
    expect(pruneBefore('30', now)).toBe(now - 30 * DAY);
    expect(pruneBefore('365', now)).toBe(now - 365 * DAY);
  });
});
