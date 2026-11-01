import { describe, expect, it } from 'vitest';
import { battlesViewModel } from '../src/content/features/pvp/battles/view-model';
import { incomingViewModel } from '../src/content/features/pvp/incoming/view-model';
import { plundersViewModel } from '../src/content/features/pvp/plunders/view-model';
import { pruneBefore } from '../src/content/features/pvp/retention';
import { opponentsFor, pageCount, type ViewInput } from '../src/content/features/pvp/rows';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle, IncomingAttack, IncomingTotals, Player, Plunder } from '../src/shared/model';
import { playerLookups } from './helpers/player-lookups';

const now = new Date(2026, 9, 19, 15, 0).getTime();
const DAY = 86_400_000;

const battle = (battleId: number, opponent: number, change: Partial<Battle> = {}): Battle => ({
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
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { money: 1220, strategy_points: 5 },
  doubleLoot: false,
  ...change,
});

const player = (id: number, name: string) => ({ id: playerId(id), name }) as Player;
const names: Record<number, string> = { 1001: 'Testgegner' };
const base: ViewInput = {
  filter: { text: '' },
  page: 0,
  lookups: playerLookups({
    playerName: (id: PlayerId) => names[id],
    playerGuild: (id: PlayerId) => (id === 1001 ? { name: 'Testgilde', url: '' } : undefined),
  }),
  building: (id) => (id === 'R_IronAge_Residential2' ? 'Strohdachhaus' : undefined),
  resourceName: () => undefined,
  note: (id: PlayerId) => (id === 1001 ? '**stark**\n- *Schilde*' : undefined),
  now,
  expanded: new Set(),
};
const noPlunderTotals = { count: 0, repelled: 0, fp: 0 };
const battlesOf = (battles: Battle[], change: Partial<ViewInput> = {}, plunderTotals = noPlunderTotals) =>
  battlesViewModel({ ...base, ...change, battles, total: battles.length, plunderTotals });

describe('pvp view model', () => {
  it('adds the details to the expanded rows only', () => {
    const units = { units: [{ unitTypeId: 'rogue', startHp: 10, endHp: 8 }] };
    const first = battle(1, 1001);
    const vm = battlesOf([{ ...first, attacker: { ...first.attacker, ...units } }, battle(2, 1002)], {
      expanded: new Set([1]),
    });
    expect(vm.rows[0]?.details).toBeDefined();
    expect(vm.rows[0]?.details).toMatchObject({
      summary: 'gewonnen, Autokampf, 2 Runden',
      own: [{ unit: 'rogue', hp: '8/10 LP', dead: false }],
      army: { own: { attack: 368, defense: 269 }, opponent: { attack: 406, defense: 443 } },
    });
    expect(vm.rows[1]?.details).toBeUndefined();
  });

  it('shows one row per battle with name, time, result and measured armies', () => {
    const vm = battlesOf([battle(1, 1001), battle(2, 1002, { result: 'surrendered', auto: false, rounds: 5 })]);
    expect(vm.rows[0]).toEqual({
      battleId: 1,
      opponent: 1001,
      name: 'Testgegner',
      nameTip: 'Testgegner [Testgilde]',
      url: 'https://foestats.com/de/de20/players/1001',
      when: 'heute 13:49',
      result: 'gewonnen',
      battle: 'Autokampf',
      attacker: { attack: 368, defense: 269 },
      defender: { attack: 406, defense: 443 },
      note: 'stark\n• Schilde',
    });
    expect(vm.rows[1]).toMatchObject({
      name: '1002',
      nameTip: '1002',
      result: 'aufgegeben',
      battle: '5 Runden',
      note: '',
    });
    expect(vm).toMatchObject({ tab: 'battles', page: 0, pages: 1, empty: undefined, picked: undefined });
  });

  it('names one round in singular', () => {
    const vm = battlesOf([battle(1, 1001, { auto: false, rounds: 1 }), battle(2, 1001, { auto: false, rounds: 4 })]);
    expect(vm.rows.map((r) => r.battle)).toEqual(['1 Runde', '4 Runden']);
  });

  it('tells no battles from no match and names the picked player', () => {
    expect(battlesOf([]).empty).toBe('none');
    expect(battlesOf([], { filter: { text: 'xy' } }).empty).toBe('noMatch');
    const picked = battlesOf([], { filter: { text: '', opponent: playerId(1001) } });
    expect(picked).toMatchObject({ empty: 'noMatch', picked: 'Testgegner' });
  });

  it('shows one row per plunder with building, loot and Double Loot, and the plunder totals', () => {
    const vm = plundersViewModel({
      ...base,
      plunders: [plunder(1001, { doubleLoot: true }), plunder(1002, { cityEntityId: buildingDefId('R_Unknown') })],
      plunderTotals: { count: 2, repelled: 0, fp: 10 },
    });
    expect(vm.rows).toEqual([
      {
        opponent: 1001,
        name: 'Testgegner',
        nameTip: 'Testgegner [Testgilde]',
        url: 'https://foestats.com/de/de20/players/1001',
        when: 'heute 14:05',
        building: 'Strohdachhaus',
        loot: '1.220 Münzen, 5 Forge-Punkte',
        doubleLoot: true,
        note: 'stark\n• Schilde',
      },
      expect.objectContaining({ name: '1002', building: 'R_Unknown', doubleLoot: false, note: '' }),
    ]);
    expect(vm).toMatchObject({ tab: 'plunders', totals: '2 Plünderungen, 10 FP', pages: 1 });
  });

  it('shows a repelled plunder without building and loot, and counts repelled ones in the totals', () => {
    const vm = plundersViewModel({
      ...base,
      plunders: [
        {
          world: worldId('de20'),
          at: plunder(1001).at,
          opponent: playerId(1001),
          outcome: 'repelled',
          resources: {},
          doubleLoot: false,
        },
      ],
      plunderTotals: { count: 5, repelled: 2, fp: 120 },
    });
    expect(vm.rows).toEqual([
      {
        opponent: 1001,
        name: 'Testgegner',
        nameTip: 'Testgegner [Testgilde]',
        url: 'https://foestats.com/de/de20/players/1001',
        when: 'heute 14:05',
        building: '–',
        loot: 'abgewehrt',
        doubleLoot: false,
        note: 'stark\n• Schilde',
      },
    ]);
    expect(vm.totals).toBe('5 Plünderungen, 2 abgewehrt, 120 FP');
  });

  it('names one plunder in singular, also above the battles', () => {
    expect(battlesOf([]).totals).toBe('0 Plünderungen, 0 FP');
    expect(battlesOf([], {}, { count: 1, repelled: 0, fp: 1234 }).totals).toBe('1 Plünderung, 1.234 FP');
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
        attack(3, { kind: 'plunder', cityEntityId: buildingDefId('R_IronAge_Residential2') }),
        attack(4, { kind: 'plunder', cityEntityId: buildingDefId('R_Unknown') }),
        // from the old toolbox, without the outcome
        attack(5, {}),
      ],
      incomingTotals: { battles: 3, held: 1, plunders: 2 },
    });
    expect(vm.rows).toEqual([
      {
        attacker: 1001,
        name: 'Testgegner',
        nameTip: 'Testgegner [Testgilde]',
        url: 'https://foestats.com/de/de20/players/1001',
        when: 'heute 14:05',
        what: 'Kampf: durchbrochen',
        note: 'stark\n• Schilde',
      },
      {
        attacker: 1002,
        name: '1002',
        nameTip: '1002',
        url: 'https://foestats.com/de/de20/players/1002',
        when: '16.10., 14:05',
        what: 'Kampf: gehalten',
        note: '',
      },
      expect.objectContaining({ what: 'Plünderung: Strohdachhaus' }),
      expect.objectContaining({ what: 'Plünderung: R_Unknown' }),
      expect.objectContaining({ what: 'Kampf' }),
    ]);
    expect(vm).toMatchObject({ tab: 'incoming', totals: '3 Angriffe, 1 abgewehrt, 2 Plünderungen' });
  });

  it('names one attack and one plunder in singular and leaves out held ones when there are none', () => {
    const totals = (incomingTotals: IncomingTotals) =>
      incomingViewModel({ ...base, incoming: [], incomingTotals }).totals;
    expect(totals({ battles: 1, held: 0, plunders: 1 })).toBe('1 Angriff, 1 Plünderung');
    expect(totals({ battles: 0, held: 0, plunders: 0 })).toBe('0 Angriffe, 0 Plünderungen');
  });

  it('counts pages of 20', () => {
    expect([0, 20, 21, 41].map(pageCount)).toEqual([1, 1, 2, 3]);
  });
});

describe('pvp filter', () => {
  const players = [player(1, 'Anna'), player(2, 'Hannes'), player(3, 'Bert')];

  it('matches names by text, ignoring case', () => {
    expect(opponentsFor({ text: ' ann' }, players)).toEqual([1, 2]);
    expect(opponentsFor({ text: 'zz' }, players)).toEqual([]);
    expect(opponentsFor({ text: ' ' }, players)).toBeUndefined();
  });

  it('prefers a picked player over the text', () => {
    expect(opponentsFor({ text: 'ann', opponent: playerId(3) }, players)).toEqual([3]);
  });
});

describe('battle retention', () => {
  it('keeps everything by default and cuts at the chosen number of days', () => {
    expect(pruneBefore('forever', now)).toBeUndefined();
    expect(pruneBefore('30', now)).toBe(now - 30 * DAY);
    expect(pruneBefore('365', now)).toBe(now - 365 * DAY);
  });
});
