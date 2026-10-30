import { describe, expect, it } from 'vitest';
import { type ConstructionInput, calculateConstruction } from '../src/content/domain/gb-calculator';
import { toGreatBuildingEntity, toRankingRows } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { RankingRow } from '../src/content/model/great-building';
import { roundHalfUp } from '../src/shared/math';
import fixture from './fixtures/great-buildings.json';

const ARC = 95.5;

/** the input for one of the recorded openings, with the recorded Arc bonus */
function recorded(entityId: number, factor = 90): ConstructionInput {
  const opening = fixture.openings.find((o) => o.entity.requestData[0] === entityId);
  if (!opening) throw new Error(`no opening ${entityId}`);
  const entity = toGreatBuildingEntity(opening.entity.responseData as GameCityEntity);
  const rankings = toRankingRows(opening.construction.responseData.rankings);
  if (!entity || !rankings) throw new Error('fixture does not parse');
  return { ...entity, rankings, arcBonus: ARC, factor };
}

const reward = (fp: number, blueprints = 0, medals = 0) => ({ fp, blueprints, medals });
const owner = (fp: number): RankingRow => ({ name: 'Owner', self: false, fp });
const place = (rank: number, net: number, fp?: number, self = false): RankingRow => ({
  rank,
  name: fp === undefined ? 'Noch kein Mäzen' : `P${rank}`,
  self,
  ...(fp !== undefined && { fp }),
  reward: reward(net),
});

const input = (required: number, rankings: RankingRow[], change: Partial<ConstructionInput> = {}) => ({
  level: 10,
  maxLevel: 20,
  connected: true,
  required,
  rankings,
  arcBonus: 90,
  factor: 90,
  ...change,
});

describe('roundHalfUp', () => {
  it('rounds halves up, also when the float product lands just below', () => {
    expect(roundHalfUp(1405.5)).toBe(1406);
    expect(roundHalfUp(1405.4999)).toBe(1405);
    expect(roundHalfUp(5 * 1.9)).toBe(10);
    expect(roundHalfUp(0.1 + 0.2 + 0.2)).toBe(1);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
});

describe('calculateConstruction on recorded great buildings', () => {
  it('empty places: only the first is free, the others cost the same and are unavailable', () => {
    // 1909 St. 75: 3062 needed, only the owner's 251 in it, places 730/365/120/30/5 FP
    const calc = calculateConstruction(recorded(1909));
    expect(calc).toMatchObject({ rest: 2811, missing: 2811, myDeposit: 0, myRank: undefined });
    expect(calc.places.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    // safe: round(2811 / 2) = 1406; gross round(730 × 1.955) = 1427; demand round(730 × 1.9) = 1387, below safe
    expect(calc.places[0]).toMatchObject({
      holder: undefined,
      holderFp: 0,
      net: 730,
      gross: 1427,
      blueprints: 29,
      medals: 2111,
      safeCost: 1406,
      demandCost: 1387,
      demandBelowSafe: true,
      demandOverRest: false,
      demandProfit: 40,
      safeExtra: 1406,
      profit: 21,
      rate: 192.6,
      available: true,
      status: 'profit',
    });
    expect(calc.places.slice(1).map((p) => [p.safeCost, p.status])).toEqual([
      [1406, 'unavailable'],
      [1406, 'unavailable'],
      [1406, 'unavailable'],
      [1406, 'unavailable'],
    ]);
  });

  it('own first place with the owner and an almost empty rest: exactly safe with the recorded deposit', () => {
    // 650 St. 49: 1612 needed, 917 in (me 696 on 1, owner 220, 1 FP on 2), so the others may add 1612 - 221 = 1391
    const calc = calculateConstruction(recorded(650));
    expect(calc).toMatchObject({ rest: 1391, missing: 695, myDeposit: 696, myRank: 1 });
    // own place: round((1 + 1391) / 2) = 696; gross round(440 × 1.955) = 860
    expect(calc.places[0]).toMatchObject({ mine: true, safeCost: 696, safeExtra: 0, gross: 860, profit: 164 });
    expect(calc.places[0]?.status).toBe('mine');
    expect(calc.places.slice(1).every((p) => p.status === 'unavailable')).toBe(true);
  });

  it('ranks without reward count as deposits but are no places', () => {
    // 1500 St. 100: 9176 needed, 6279 in, me 3397 on 1, ranks 6 and 7 pay nothing
    const calc = calculateConstruction(recorded(1500));
    expect(calc).toMatchObject({ rest: 6294, missing: 2897, myDeposit: 3397, myRank: 1 });
    expect(calc.places.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    // own place: next is 500 on rank 2, round((500 + 6294) / 2) = 3397
    expect(calc.places[0]).toMatchObject({ mine: true, safeCost: 3397, gross: 3558, profit: 161 });
  });

  it('own second place: the first is out of reach, the places below are unavailable', () => {
    // 2434 St. 52: 2400 needed, 2189 in, me 575 on 2, the owner's 100 between rank 3 and 4
    const calc = calculateConstruction(recorded(2434));
    expect(calc).toMatchObject({ rest: 786, missing: 211, myDeposit: 575, myRank: 2 });
    // rank 1 holds 1150, safe round((1150 + 786) / 2) = 968 is less: taken for good
    expect(calc.places[0]).toMatchObject({ holder: 'Spieler 2010', holderFp: 1150, safeCost: 968, available: false });
    // own place: next is 363, round((363 + 786) / 2) = round(574.5) = 575
    expect(calc.places[1]).toMatchObject({ mine: true, safeCost: 575, safeExtra: 0 });
    expect(calc.places.map((p) => p.status)).toEqual([
      'unavailable',
      'mine',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('the Arc factor asks exactly the gross reward', () => {
    const calc = calculateConstruction(recorded(1909, ARC));
    expect(calc.places[0]).toMatchObject({ demandCost: 1427, demandProfit: 0, demandBelowSafe: false });
  });

  it('the demand follows the factor on an empty building, whatever the safe cost', () => {
    const demand = (factor: number) => calculateConstruction(recorded(1909, factor)).places.map((p) => p.demandCost);
    // round(N × (1 + factor / 100)) for 730/365/120/30/5
    expect(demand(80)).toEqual([1314, 657, 216, 54, 9]);
    expect(demand(90)).toEqual([1387, 694, 228, 57, 10]);
    expect(demand(100)).toEqual([1460, 730, 240, 60, 10]);
    expect(demand(-100)).toEqual([0, 0, 0, 0, 0]);
    // the safe cost stays the same for every factor
    expect(calculateConstruction(recorded(1909, 80)).places[0]?.safeCost).toBe(1406);
  });
});

describe('calculateConstruction on edge cases', () => {
  // scenario of the user, 2026-10-22: 5404 needed, places 1275/640/215/55/10, Arc 95.5 %
  const scenario = (rows: RankingRow[]) =>
    calculateConstruction(
      input(
        5404,
        [...rows, ...[1275, 640, 215, 55, 10].slice(rows.length).map((net, i) => place(rows.length + i + 1, net))],
        {
          arcBonus: 95.5,
        },
      ),
    );

  it('scenario empty: only the first place can be had, the others cost the same and are dominated', () => {
    const calc = scenario([]);
    expect(calc.rest).toBe(5404);
    // dominated: not secured, yet not available, as the place above costs the same
    expect(calc.places.map((p) => [p.safeCost, p.secured, p.available])).toEqual([
      [2702, false, true],
      [2702, false, false],
      [2702, false, false],
      [2702, false, false],
      [2702, false, false],
    ]);
  });

  it('scenario partly filled: a place is safe at its cost even when that passes the place above for now', () => {
    // others 1500 on 1 and 900 on 2, me 400 on 3: rest 5404 - 2400 = 3004, 2604 still missing
    const calc = scenario([place(1, 1275, 1500), place(2, 640, 900), place(3, 215, 400, true)]);
    expect(calc).toMatchObject({ rest: 3004, missing: 2604, myDeposit: 400, myRank: 3 });
    // 1952 is first for now; rank 1 can pass it again, rank 2 cannot: place 2 is safe at round((900 + 3004) / 2)
    expect(calc.places[0]).toMatchObject({ safeCost: 2252, safeExtra: 1852, available: true, secured: false });
    expect(calc.places[1]).toMatchObject({ safeCost: 1952, safeExtra: 1552, available: true });
    // own place: no one below, round(3004 / 2) = 1502; 400 / 215 = 186 %, 1502 / 215 = 698.6 %
    expect(calc.places[2]).toMatchObject({
      mine: true,
      secured: false,
      safeCost: 1502,
      safeExtra: 1102,
      depositRate: 186,
      rate: 698.6,
    });
  });

  it('scenario own first place: safe once the deposit reaches the safe cost', () => {
    const calc = scenario([place(1, 1275, 2800, true)]);
    // round(5404 / 2) = 2702 is less than the own 2800
    expect(calc.places[0]).toMatchObject({
      mine: true,
      secured: true,
      safeCost: 2702,
      safeExtra: -98,
      depositRate: 219.6,
    });
    // gross round(1275 × 1.955) = 2493 minus the own 2800, the larger of deposit and safe cost
    expect(calc.places[0]?.profit).toBe(-307);
  });

  it('the own place not yet safe: the profit counts the safe cost, the worse mark ignores the own place', () => {
    // me 400 on 3 of the partly filled scenario: 420 - max(400, 1502)
    const calc = scenario([place(1, 1275, 1500), place(2, 640, 900), place(3, 215, 400, true)]);
    expect(calc.places[2]?.profit).toBe(-1082);
    // place 2 counts against place 1 only
    expect(calc.places.slice(0, 3).map((p) => p.status)).toEqual(['profit', 'worse', 'mine']);
  });

  it('a held place whose holder cannot be passed anymore is secured, not dominated', () => {
    // rest 101: rank 1 holds 101, safe round(202 / 2) = 101
    const calc = calculateConstruction(input(302, [place(1, 100, 101), place(2, 100, 100)]));
    expect(calc.places[0]).toMatchObject({ safeCost: 101, secured: true, available: false });
    // rank 2: round(201 / 2) = 101, the same as above: dominated
    expect(calc.places[1]).toMatchObject({ safeCost: 101, secured: false, available: false });
  });

  it('takes a held place, marks lower places worse and keeps the owner out of the places', () => {
    // 350 in, rest 650: rank 1 safe round((200 + 650) / 2) = 425, gross round(300 × 1.9) = 570
    const calc = calculateConstruction(input(1000, [owner(100), place(1, 300, 200), place(2, 150, 50), place(3, 50)]));
    expect(calc.rest).toBe(650);
    expect(calc.places).toHaveLength(3);
    expect(calc.places[0]).toMatchObject({ safeCost: 425, demandCost: 570, gross: 570, profit: 145, rate: 141.7 });
    expect(calc.places[0]?.status).toBe('profit');
    // rank 2: round(700 / 2) = 350 for 285 gross; rank 3 empty: round(650 / 2) = 325 for 95
    expect(calc.places[1]).toMatchObject({ safeCost: 350, profit: -65, status: 'worse' });
    expect(calc.places[2]).toMatchObject({ safeCost: 325, holderFp: 0, profit: -230, status: 'worse' });
  });

  it('shows a loss when the best free place costs more than it pays', () => {
    const calc = calculateConstruction(input(1000, [place(1, 100, 400)]));
    expect(calc.places[0]).toMatchObject({ safeCost: 500, gross: 190, profit: -310, status: 'loss' });
  });

  it('warns when the safe cost is all that is left, marks a demand above it and leaves the warning out of the best', () => {
    // 201 needed, 100 on rank 1: rest 101, safe round(201 / 2) = 101 = rest
    const calc = calculateConstruction(input(201, [place(1, 100, 100), place(2, 50)]));
    expect(calc.places[0]).toMatchObject({
      safeCost: 101,
      // round(100 × 1.9) = 190 is more than the 101 still to pay; kept, only marked
      demandCost: 190,
      demandOverRest: true,
      demandBelowSafe: false,
      levelWarning: true,
      status: 'levelWarning',
    });
    // rank 2: round(101 / 2) = 51 for 95 gross; not worse, the warned place does not count as best
    expect(calc.places[1]).toMatchObject({ safeCost: 51, profit: 44, status: 'profit' });
  });

  it('a place above the own one costs the total deposit; the extra is what is still to add', () => {
    // 450 in, mine 100: rest 650
    const calc = calculateConstruction(input(1000, [place(1, 400, 300), place(2, 200, 100, true), place(3, 100, 50)]));
    expect(calc).toMatchObject({ rest: 650, myDeposit: 100, myRank: 2 });
    expect(calc.places[0]).toMatchObject({ safeCost: 475, safeExtra: 375, gross: 760, profit: 285, status: 'profit' });
    // own place: round((50 + 650) / 2) = 350, 250 more to be safe
    expect(calc.places[1]).toMatchObject({ safeCost: 350, safeExtra: 250, status: 'mine' });
    expect(calc.places[2]?.status).toBe('unavailable');
  });

  it('gives no cost, profit or rate below the own place, the own deposit cannot hold two places, only the demand', () => {
    // like the recorded Basilius-Kathedrale: 1543 needed, owner 166, 820 on 1, mine 279 on 2, places 3 to 5 empty
    const calc = calculateConstruction(
      input(1543, [owner(166), place(1, 410, 820), place(2, 205, 279, true), place(3, 70), place(4, 20), place(5, 5)]),
    );
    expect(calc).toMatchObject({ rest: 557, missing: 278, myDeposit: 279, myRank: 2 });
    expect(calc.places[0]).toMatchObject({ safeCost: 689, available: false });
    expect(calc.places[1]).toMatchObject({ safeCost: 279, safeExtra: 0, status: 'mine' });
    for (const p of calc.places.slice(2)) {
      expect(p).toMatchObject({ available: false, status: 'unavailable' });
      expect([p.safeCost, p.safeExtra, p.profit, p.rate]).toEqual([undefined, undefined, undefined, undefined]);
    }
    // the owner's demand stays as an offer, its extra is all of it: the own deposit cannot move down
    expect(calc.places[2]).toMatchObject({ demandCost: 133, demandExtra: 133 });
    // gross, blueprints and medals stay as information
    expect(calc.places[2]).toMatchObject({ net: 70, gross: 133 });
  });

  it('the own place without a successor needs half of what is left', () => {
    const calc = calculateConstruction(input(500, [place(1, 200, 100, true), place(2, 100)]));
    expect(calc.places[0]).toMatchObject({ safeCost: 250, safeExtra: 150 });
  });

  it('a full building has no free place', () => {
    const calc = calculateConstruction(input(300, [owner(100), place(1, 100, 200)]));
    expect(calc).toMatchObject({ rest: 0, missing: 0 });
    expect(calc.places[0]?.status).toBe('unavailable');
  });

  it('is blocked at the highest level and when the building is not connected', () => {
    const rows = [place(1, 100)];
    expect(calculateConstruction(input(500, rows, { level: 20 }))).toMatchObject({ blocked: 'maxLevel', places: [] });
    expect(calculateConstruction(input(500, rows, { connected: false }))).toMatchObject({
      blocked: 'unconnected',
      rest: 500,
      places: [],
    });
  });

  it('rounds blueprints and medals with the Arc bonus', () => {
    const calc = calculateConstruction(input(500, [{ rank: 1, name: '', self: false, reward: reward(5, 3, 11) }]));
    // 5 × 1.9 = 9.5, 3 × 1.9 = 5.7, 11 × 1.9 = 20.9
    expect(calc.places[0]).toMatchObject({ gross: 10, blueprints: 6, medals: 21 });
  });
});

describe('fallback place and worthwhile places', () => {
  const rewards = [1200, 600, 300, 100, 20];
  /** places 1 to 5 with the rewards above, holders given from place 1 on, `me` marks the own place (1-based) */
  const level = (holders: number[], me?: number) =>
    rewards.map((net, i) => place(i + 1, net, holders[i], me === i + 1));
  const calc = (holders: number[], me: number | undefined, missing: number) =>
    calculateConstruction(input(holders.reduce((a, b) => a + b, 0) + missing, level(holders, me), { arcBonus: 0 }));

  it('has no fallback place while nothing is paid in', () => {
    expect(calc([], undefined, 2000).fallbackGross).toBeUndefined();
  });

  it('is the own place when the points left cannot pay one pass', () => {
    // a newcomer needs 601 to pass the own 600
    expect(calc([1000, 700, 600], 3, 600).fallbackGross).toBe(300);
  });

  it('drops one place per pass the points allow', () => {
    // one pass for 601, the second finds 399 left
    expect(calc([1000, 700, 600], 3, 1000).fallbackGross).toBe(100);
  });

  it('lets holders below be passed for the difference, cheapest first', () => {
    // places 4 and 5 hold 590 and 500: 11 + 101, then a newcomer for 601 does not fit into 388
    expect(calc([1000, 700, 600, 590, 500], 3, 500).fallbackGross).toBe(20);
    // 713 in all fit into 1000
    expect(calc([1000, 700, 600, 590, 500], 3, 1000).fallbackGross).toBe(0);
  });

  it('is 0 below the last place, whatever the places pay', () => {
    expect(calc([1000, 700, 600], 3, 2000).fallbackGross).toBe(0);
  });

  it('is 0 for a deposit without a rank', () => {
    const rankings = [{ name: 'Me', self: true, fp: 300 }, ...level([1000, 700, 600, 500, 400])];
    expect(calculateConstruction(input(4000, rankings, { arcBonus: 0 })).fallbackGross).toBe(0);
  });

  it('lists a place that leaves more than the fallback although it loses: 400 in, 1000 more for 1200, fallback 100', () => {
    // place 1 holds 1300, own place 2; safe cost round(2800 / 2) = 1400, 1000 more; two passes (802) put him on place 4
    const c = calc([1300, 400], 2, 1100);
    expect(c.fallbackGross).toBe(100);
    expect(c.places[0]).toMatchObject({ safeCost: 1400, safeExtra: 1000, gross: 1200, profit: -200, worthwhile: true });
  });

  it('leaves out places that do not beat the fallback, the own place as well', () => {
    // fallback 100 as above; gross - missing: place 1 1200 - 700, place 2 600 - 550, own place 300 - 200
    const c = calc([1000, 700, 600], 3, 1000);
    expect(c.places.map((p) => p.worthwhile)).toEqual([true, false, false, undefined, undefined]);
  });

  it('without an own deposit lists a place with no loss or a safe cost within the demand', () => {
    // rewards 1200: safe 1000 earns 200
    expect(calculateConstruction(input(2000, level([]), { arcBonus: 0 })).places[0]?.worthwhile).toBe(true);
    // safe 2000 loses 800, but the demand of 2280 asks more
    expect(calculateConstruction(input(4000, level([]), { arcBonus: 0 })).places[0]?.worthwhile).toBe(true);
    // safe 3000 loses 1800 and the demand is below
    expect(calculateConstruction(input(6000, level([]), { arcBonus: 0 })).places[0]?.worthwhile).toBe(false);
  });
});
