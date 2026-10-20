import { describe, expect, it } from 'vitest';
import { pruneBefore } from '../src/content/features/pvp/retention';
import { opponentsFor, pageCount, pvpViewModel } from '../src/content/features/pvp/view-model';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle, IncomingAttack, IncomingTotals, Player, Plunder } from '../src/shared/model';

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
const name = (id: PlayerId) => names[id];
const lookups = {
  name,
  building: (id: string) => (id === 'R_IronAge_Residential2' ? 'Strohdachhaus' : undefined),
  resourceName: () => undefined,
  note: (id: PlayerId) => (id === 1001 ? '**stark**\n- *Schilde*' : undefined),
};
const noIncoming = { incoming: [], incomingTotals: { battles: 0, held: 0, plunders: 0 } };
const battlesTab = {
  tab: 'battles' as const,
  plunders: [],
  plunderTotals: { count: 0, repelled: 0, fp: 0 },
  ...noIncoming,
  ...lookups,
};

describe('pvp view model', () => {
  it('shows one row per battle with name, time, result and measured armies', () => {
    const vm = pvpViewModel({
      battles: [battle(1, 1001), battle(2, 1002, { result: 'surrendered', auto: false, rounds: 5 })],
      total: 2,
      page: 0,
      filter: { text: '' },
      ...battlesTab,
      now,
    });
    expect(vm.rows[0]).toEqual({
      battleId: 1,
      opponent: 1001,
      name: 'Testgegner',
      when: 'heute 13:49',
      result: 'gewonnen',
      battle: 'Autokampf',
      attacker: { attack: 368, defense: 269 },
      defender: { attack: 406, defense: 443 },
      note: 'stark\n• Schilde',
    });
    expect(vm.rows[1]).toMatchObject({ name: '1002', result: 'aufgegeben', battle: '5 Runden', note: '' });
    expect(vm).toMatchObject({ page: 0, pages: 1, empty: undefined, picked: undefined });
  });

  it('names one round in singular', () => {
    const vm = pvpViewModel({
      battles: [battle(1, 1001, { auto: false, rounds: 1 }), battle(2, 1001, { auto: false, rounds: 4 })],
      total: 2,
      page: 0,
      filter: { text: '' },
      ...battlesTab,
      now,
    });
    expect(vm.rows.map((r) => r.battle)).toEqual(['1 Runde', '4 Runden']);
  });

  it('tells no battles from no match and names the picked player', () => {
    const base = { ...battlesTab, battles: [], total: 0, page: 0, now };
    expect(pvpViewModel({ ...base, filter: { text: '' } }).empty).toBe('none');
    expect(pvpViewModel({ ...base, filter: { text: 'xy' } }).empty).toBe('noMatch');
    const picked = pvpViewModel({ ...base, filter: { text: '', opponent: playerId(1001) } });
    expect(picked).toMatchObject({ empty: 'noMatch', picked: 'Testgegner' });
  });

  it('shows one row per plunder with building, loot and Double Loot, and the plunder totals', () => {
    const vm = pvpViewModel({
      ...lookups,
      ...noIncoming,
      tab: 'plunders',
      battles: [],
      plunders: [plunder(1001, { doubleLoot: true }), plunder(1002, { cityEntityId: buildingDefId('R_Unknown') })],
      total: 2,
      plunderTotals: { count: 2, repelled: 0, fp: 10 },
      page: 0,
      filter: { text: '' },
      now,
    });
    expect(vm.plunders).toEqual([
      {
        opponent: 1001,
        name: 'Testgegner',
        when: 'heute 14:05',
        building: 'Strohdachhaus',
        loot: '1.220 Münzen, 5 Forge-Punkte',
        doubleLoot: true,
        note: 'stark\n• Schilde',
      },
      expect.objectContaining({ name: '1002', building: 'R_Unknown', doubleLoot: false, note: '' }),
    ]);
    expect(vm).toMatchObject({ tab: 'plunders', rows: [], plunderTotals: '2 Plünderungen, 10 FP', pages: 1 });
  });

  it('shows a repelled plunder without building and loot, and counts repelled ones in the totals', () => {
    const vm = pvpViewModel({
      ...lookups,
      ...noIncoming,
      tab: 'plunders',
      battles: [],
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
      total: 7,
      plunderTotals: { count: 5, repelled: 2, fp: 120 },
      page: 0,
      filter: { text: '' },
      now,
    });
    expect(vm.plunders).toEqual([
      {
        opponent: 1001,
        name: 'Testgegner',
        when: 'heute 14:05',
        building: '–',
        loot: 'abgewehrt',
        doubleLoot: false,
        note: 'stark\n• Schilde',
      },
    ]);
    expect(vm.plunderTotals).toBe('5 Plünderungen, 2 abgewehrt, 120 FP');
  });

  it('names one plunder in singular', () => {
    const vm = pvpViewModel({ ...battlesTab, battles: [], total: 0, page: 0, filter: { text: '' }, now });
    expect(vm.plunderTotals).toBe('0 Plünderungen, 0 FP');
    expect(
      pvpViewModel({
        ...battlesTab,
        plunderTotals: { count: 1, repelled: 0, fp: 1234 },
        battles: [],
        total: 0,
        page: 0,
        filter: { text: '' },
        now,
      }).plunderTotals,
    ).toBe('1 Plünderung, 1.234 FP');
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
    const vm = pvpViewModel({
      ...battlesTab,
      tab: 'incoming',
      battles: [],
      incoming: [
        attack(1, { defense: 'broken' }),
        attack(2, { defense: 'held', attacker: playerId(1002), at: at - 3 * DAY }),
        attack(3, { kind: 'plunder', cityEntityId: buildingDefId('R_IronAge_Residential2') }),
        attack(4, { kind: 'plunder', cityEntityId: buildingDefId('R_Unknown') }),
      ],
      incomingTotals: { battles: 3, held: 1, plunders: 2 },
      total: 4,
      page: 0,
      filter: { text: '' },
      now,
    });
    expect(vm.incoming).toEqual([
      {
        attacker: 1001,
        name: 'Testgegner',
        when: 'heute 14:05',
        what: 'Kampf: durchbrochen',
        note: 'stark\n• Schilde',
      },
      { attacker: 1002, name: '1002', when: '16.10., 14:05', what: 'Kampf: gehalten', note: '' },
      expect.objectContaining({ what: 'Plünderung: Strohdachhaus' }),
      expect.objectContaining({ what: 'Plünderung: R_Unknown' }),
    ]);
    expect(vm).toMatchObject({
      tab: 'incoming',
      rows: [],
      plunders: [],
      incomingTotals: '3 Angriffe, 1 abgewehrt, 2 Plünderungen',
    });
  });

  it('names one attack and one plunder in singular and leaves out held ones when there are none', () => {
    const totals = (incomingTotals: IncomingTotals) =>
      pvpViewModel({ ...battlesTab, incomingTotals, battles: [], total: 0, page: 0, filter: { text: '' }, now })
        .incomingTotals;
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
