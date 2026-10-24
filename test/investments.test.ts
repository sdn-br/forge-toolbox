import { describe, expect, it } from 'vitest';
import { myInvestments } from '../src/content/domain/investments';
import { investmentsViewModel } from '../src/content/features/investments/view-model';
import { toGreatBuildingListRows } from '../src/content/game/convert';
import type { RankingRow } from '../src/content/stores/great-building-model';
import { applyListRow } from '../src/persistence/great-buildings/merge';
import { type BuildingDefId, playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding } from '../src/shared/model';
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

describe('totals line', () => {
  const vm = (profitSafe: number) =>
    investmentsViewModel({
      tab: 'mine',
      investments: { rows: [], totals: { circulating: 100, profitSafe, profitTotal: profitSafe - 10 } },
      now: 0,
      greatBuildingName: () => undefined,
      playerName: () => undefined,
      playerUrl: () => '',
    }).totals;

  it('shows the safe profit green only above 0', () => {
    expect(vm(12)).toMatchObject({ profitSafe: '+12', gain: true });
    expect(vm(0).gain).toBe(false);
    expect(vm(-3)).toMatchObject({ profitSafe: '−3', gain: false });
  });
});
