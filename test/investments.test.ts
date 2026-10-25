import { describe, expect, it } from 'vitest';
import { myInvestments } from '../src/content/domain/investments';
import {
  DEFAULT_MINE_FILTER,
  type InvestmentsInput,
  investmentsViewModel,
  type MineFilter,
} from '../src/content/features/investments/view-model';
import { toGreatBuildingListRows } from '../src/content/game/convert';
import type { RankingRow } from '../src/content/stores/great-building-model';
import { applyListRow } from '../src/persistence/great-buildings/merge';
import { type BuildingDefId, playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding, Relations } from '../src/shared/model';
import contributions from './fixtures/gb-contributions.json';

const world = worldId('de20');

/** a building with an own place; `over` changes what a case needs */
const building = (over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world,
  owner: playerId(2001),
  entityId: 1,
  cityEntityId: 'X_Test_Landmark1' as BuildingDefId,
  level: 10,
  invested: 190,
  required: 240,
  ownContribution: true,
  contribution: { rank: 1, forgePoints: 100, reward: 50, at: 1_000 },
  seenAt: 1_000,
  ...over,
});

const reward = (fp: number) => ({ fp, blueprints: 0, medals: 0 });

/** own 100 on place 1, place 2 holds 90, rest 50 */
const counterRankings: RankingRow[] = [
  { rank: 1, name: 'Ich', self: true, fp: 100, reward: reward(50) },
  { rank: 2, player: playerId(3001), name: 'B', self: false, fp: 90, reward: reward(25) },
  { rank: 3, name: 'Noch kein Mäzen', self: false, reward: reward(10) },
];

const withRankings = (rankings: RankingRow[], over: Partial<KnownGreatBuilding> = {}) => {
  const invested = rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0);
  return building({ invested, rankings, rankingsLevel: 10, rankingsInvested: invested, maxLevel: 20, ...over });
};

describe('status of an own place', () => {
  it('is unsafe with rankings when the next place can still pass (100 on P1, P2 holds 90, rest 50)', () => {
    const [row] = myInvestments([withRankings(counterRankings)], 0).rows;
    expect(row).toMatchObject({ rest: 50, status: 'unsafe' });
  });

  it('is not safe without rankings when own deposit covers the rest but not the others with it', () => {
    const [row] = myInvestments([building()], 0).rows;
    expect(row).toMatchObject({ rest: 50, status: 'unknown' });
  });

  it('is safe without rankings once the own deposit holds the others and the rest together', () => {
    const [row] = myInvestments([building({ contribution: { rank: 1, forgePoints: 120, reward: 50, at: 1 } })], 0).rows;
    expect(row?.status).toBe('safe');
    const [short] = myInvestments(
      [building({ contribution: { rank: 1, forgePoints: 119, reward: 50, at: 1 } })],
      0,
    ).rows;
    // 119 against 190 − 119 = 71 others and 50 rest; 120 held 70 and 50
    expect(short?.status).toBe('unknown');
  });

  it('decides with the rankings where the rule without them cannot (own 150, P2 100, P3 60, rest 40)', () => {
    const rankings: RankingRow[] = [
      { rank: 1, name: 'Ich', self: true, fp: 150, reward: reward(80) },
      { rank: 2, player: playerId(3001), name: 'B', self: false, fp: 100, reward: reward(40) },
      { rank: 3, player: playerId(3002), name: 'C', self: false, fp: 60, reward: reward(20) },
    ];
    const b = withRankings(rankings, {
      required: 350,
      contribution: { rank: 1, forgePoints: 150, reward: 80, at: 1 },
    });
    expect(myInvestments([b], 0).rows[0]?.status).toBe('safe');
    // the same building without its rankings
    expect(myInvestments([{ ...b, rankings: undefined }], 0).rows[0]?.status).toBe('unknown');
  });

  it('falls back to the rule without rankings when the stored ones do not match the progress or the level', () => {
    const stale = withRankings(counterRankings, { invested: 200 });
    expect(myInvestments([stale], 0).rows[0]).toMatchObject({ rest: 40, status: 'unknown' });
    const otherLevel = withRankings(counterRankings, { rankingsLevel: 9 });
    expect(myInvestments([otherLevel], 0).rows[0]?.status).toBe('unknown');
  });

  it('decides with the rankings also on a building at its highest level or not connected', () => {
    const blocked = withRankings(counterRankings, { maxLevel: 10, connected: false });
    expect(myInvestments([blocked], 0).rows[0]?.status).toBe('unsafe');
  });
});

describe('profit, growth and order', () => {
  it('takes the reward with the own Arc bonus minus the own deposit', () => {
    // 50 × 1.9 = 95
    expect(myInvestments([building()], 90).rows[0]).toMatchObject({ gross: 95, profit: -5 });
    // 5 × 1.9 = 9.5 rounds up like in the calculator
    const small = building({ contribution: { rank: 5, forgePoints: 3, reward: 5, at: 1 } });
    expect(myInvestments([small], 90).rows[0]).toMatchObject({ gross: 10, profit: 7 });
  });

  it('shows growth when the progress passed the one of the last opening', () => {
    const grown = myInvestments([building({ growthBase: 150 })], 0).rows[0];
    expect(grown?.growth).toBe(40);
    expect(myInvestments([building()], 0).rows[0]?.growth).toBeUndefined();
    expect(myInvestments([building({ growthBase: 190 })], 0).rows[0]?.growth).toBeUndefined();
    expect(myInvestments([building({ growthBase: 250 })], 0).rows[0]?.growth).toBeUndefined();
  });

  it('leaves out buildings without an own place', () => {
    const none = building({ contribution: undefined });
    expect(myInvestments([none], 0).rows).toEqual([]);
  });

  it('puts growth first, then what levels soonest', () => {
    const rows = myInvestments(
      [
        building({ entityId: 1, invested: 100, required: 400 }),
        building({ entityId: 2, invested: 100, required: 150 }),
        building({ entityId: 3, invested: 100, required: 600, growthBase: 50 }),
        building({ entityId: 4, invested: 100, required: 300, growthBase: 90 }),
      ],
      0,
    ).rows;
    expect(rows.map((r) => r.entityId)).toEqual([4, 3, 2, 1]);
  });

  it('sums the Forge points in circulation and the profit of safe rows and of all rows', () => {
    const safe = building({ entityId: 1, contribution: { rank: 1, forgePoints: 140, reward: 100, at: 1 } });
    const unknown = building({ entityId: 2 });
    const result = myInvestments([safe, unknown], 0);
    expect(result.totals).toEqual({ circulating: 240, profitSafe: -40, profitTotal: -90 });
  });
});

describe('the recorded town hall list', () => {
  const rows = toGreatBuildingListRows(contributions.contributions.responseData, playerId(contributions.me));
  const buildings = rows.flatMap((r) => applyListRow(world, undefined, r, 8_000, true) ?? []);

  it('has a row per building with its own place, profit and rest', () => {
    const result = myInvestments(buildings, 90);
    expect(result.rows).toHaveLength(12);
    const kapitol = result.rows.find((r) => r.entityId === 13);
    expect(kapitol).toMatchObject({
      level: 60,
      rank: 3,
      forgePoints: 156,
      reward: 125,
      gross: 238,
      profit: 82,
      invested: 2704,
      required: 2784,
      rest: 80,
      status: 'unknown',
    });
    expect(kapitol?.growth).toBeUndefined();
  });

  it('knows no row as safe without rankings, since the others hold more than the own deposits', () => {
    expect(myInvestments(buildings, 90).rows.every((r) => r.status === 'unknown')).toBe(true);
  });

  it('sums all rows and orders them by the rest', () => {
    const result = myInvestments(buildings, 90);
    expect(result.totals).toEqual({ circulating: 4896, profitSafe: 0, profitTotal: 4342 });
    expect(result.rows.map((r) => r.rest)).toEqual([17, 67, 80, 120, 231, 237, 425, 472, 539, 1735, 5263, 5913]);
  });
});

describe('marked owner', () => {
  it('tells per row whether the owner is marked, for the star beside the name', () => {
    const rows = investmentsViewModel({
      visible: 100,
      investments: myInvestments([building(), building({ owner: playerId(2002), entityId: 2 })], 90),
      now: 0,
      greatBuildingName: () => undefined,
      playerName: () => undefined,
      playerUrl: () => '',
      isMarked: () => false,
      ownerMarked: (id) => id === playerId(2002),
      filter: DEFAULT_MINE_FILTER,
      relations: () => undefined,
    }).rows;
    expect(rows.map((r) => [r.entityId, r.ownerMarked])).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});

describe('totals line', () => {
  const vm = (profitSafe: number) =>
    investmentsViewModel({
      visible: 100,
      investments: { rows: [], totals: { circulating: 100, profitSafe, profitTotal: profitSafe - 10 } },
      now: 0,
      greatBuildingName: () => undefined,
      playerName: () => undefined,
      playerUrl: () => '',
      isMarked: () => false,
      ownerMarked: () => false,
      filter: DEFAULT_MINE_FILTER,
      relations: () => undefined,
    }).totals;

  it('shows the safe profit green only above 0', () => {
    expect(vm(12)).toMatchObject({ profitSafe: '+12', gain: true });
    expect(vm(0).gain).toBe(false);
    expect(vm(-3)).toMatchObject({ profitSafe: '−3', gain: false });
  });
});

describe('relation and filters of the own investments', () => {
  const ALL_REACH = { neighbor: true, friend: true, guildMember: true, none: true };
  const owners: Record<number, Relations | undefined> = {
    2001: { neighbor: true, friend: false, guildMember: true },
    2002: { neighbor: false, friend: false, guildMember: false },
    2003: undefined,
  };
  const names: Record<number, string> = { 2001: 'Anna', 2002: 'Bert', 2003: 'Carla' };
  /** three buildings: Anna (neighbor, guild) safe +50, Bert (no relation) unknown −20, Carla (unknown owner) unsafe +10 */
  const rows = () => {
    const safe = building({
      owner: playerId(2001),
      entityId: 1,
      cityEntityId: 'X_Test_Alpha' as BuildingDefId,
      contribution: { rank: 1, forgePoints: 150, reward: 200, at: 1 },
    });
    const unknown = building({
      owner: playerId(2002),
      entityId: 2,
      cityEntityId: 'X_Test_Beta' as BuildingDefId,
      invested: 1000,
      required: 2000,
      contribution: { rank: 2, forgePoints: 80, reward: 60, at: 1 },
    });
    const unsafe = withRankings(counterRankings, {
      owner: playerId(2003),
      entityId: 3,
      cityEntityId: 'X_Test_Gamma' as BuildingDefId,
      contribution: { rank: 1, forgePoints: 100, reward: 110, at: 1 },
    });
    return [safe, unknown, unsafe];
  };
  const vm = (over: Partial<MineFilter> = {}, extra: Partial<InvestmentsInput> = {}) =>
    investmentsViewModel({
      visible: 100,
      investments: myInvestments(rows(), 0),
      now: 0,
      greatBuildingName: (def) => def.replace('X_Test_', ''),
      playerName: (id) => names[id],
      playerUrl: () => '',
      isMarked: (_o, entityId) => entityId === 2,
      ownerMarked: (id) => id === playerId(2003),
      relations: (id) => owners[id],
      filter: { ...DEFAULT_MINE_FILTER, reach: ALL_REACH, ...over },
      ...extra,
    });
  const names3 = (v: ReturnType<typeof vm>) => v.rows.map((r) => r.ownerName).sort();

  it('names the relation per row like the possible tab, an owner the store does not know as unknown', () => {
    const byOwner = Object.fromEntries(vm().rows.map((r) => [r.ownerName, r]));
    expect(byOwner.Anna).toMatchObject({
      reach: 'neighbor',
      reasons: ['neighbor', 'guildMember'],
      reachTip: 'Nachbar, Gilde',
    });
    expect(byOwner.Bert).toMatchObject({
      reach: 'none',
      reasons: ['none'],
      reachTip: 'keine Beziehung, nicht erreichbar',
    });
    expect(byOwner.Carla).toMatchObject({ reach: 'unknown', reasons: ['unknown'] });
  });

  it('sorts by the relation: neighbors first, out of reach last', () => {
    const sorted = vm({}, { sort: [{ column: 'reach', desc: false }] });
    expect(sorted.rows.map((r) => r.ownerName)).toEqual(['Anna', 'Carla', 'Bert']);
  });

  it('keeps by default the reachable and the unknown owners, as the possible tab does', () => {
    expect(names3(vm({ reach: DEFAULT_MINE_FILTER.reach }))).toEqual(['Anna', 'Carla']);
  });

  it('keeps a row when one of its reasons is on', () => {
    const guild = { neighbor: false, friend: false, guildMember: true, none: false };
    expect(names3(vm({ reach: guild }))).toEqual(['Anna', 'Carla']);
    const none = { neighbor: false, friend: false, guildMember: false, none: true };
    expect(names3(vm({ reach: none }))).toEqual(['Bert', 'Carla']);
  });

  it('filters by a part of the player and of the building name, in any case', () => {
    expect(names3(vm({ player: ' AN' }))).toEqual(['Anna']);
    expect(names3(vm({ name: 'ETA' }))).toEqual(['Bert']);
  });

  it('filters the marked buildings and those of marked owners', () => {
    expect(names3(vm({ onlyMarked: true }))).toEqual(['Bert', 'Carla']);
  });

  it('filters by the status, each toggle on lets its rows through', () => {
    const only = (key: 'safe' | 'unsafe' | 'unknown') => ({
      status: { safe: false, unsafe: false, unknown: false, [key]: true },
    });
    expect(names3(vm(only('safe')))).toEqual(['Anna']);
    expect(names3(vm(only('unknown')))).toEqual(['Bert']);
    expect(names3(vm(only('unsafe')))).toEqual(['Carla']);
    expect(vm({ status: { safe: false, unsafe: false, unknown: false } }).rows).toEqual([]);
  });

  it('has no totals of a selection while nothing is left out, the totals of the filtered rows when rows are', () => {
    const all = vm();
    expect(all.rows).toHaveLength(3);
    expect(all.selection).toBeUndefined();
    const some = vm({ player: 'an' });
    // the totals line stays over all own investments
    expect(some.totals).toEqual(all.totals);
    expect(some.selection).toEqual({ circulating: '150', profitSafe: '+50', profitTotal: '+50', gain: true });
    const none = vm({ player: 'x' });
    expect(none.selection).toEqual({ circulating: '0', profitSafe: '0', profitTotal: '0', gain: false });
  });

  it('counts only the safe rows in the safe profit of the selection', () => {
    const sel = vm({ status: { safe: false, unsafe: true, unknown: true } }).selection;
    expect(sel).toMatchObject({ circulating: '180', profitSafe: '0', profitTotal: '−10' });
  });

  it('tells apart no investment at all from a filter that leaves none', () => {
    expect(vm().empty).toBe(false);
    expect(vm({ player: 'x' }).empty).toBe(false);
    expect(vm({}, { investments: myInvestments([], 0) }).empty).toBe(true);
  });
});
