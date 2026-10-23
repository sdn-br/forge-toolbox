import { describe, expect, it } from 'vitest';
import { calculateOwnShare } from '../src/content/domain/gb-own-share';
import { toRankingRows } from '../src/content/game/convert';
import type { RankingRow } from '../src/content/stores/great-building-model';
import fixture from './fixtures/great-buildings.json';

const me = (fp: number): RankingRow => ({ name: 'Ich', self: true, fp });
const place = (rank: number, net: number, fp?: number): RankingRow => ({
  rank,
  name: fp === undefined ? 'Noch kein Mäzen' : `P${rank}`,
  self: false,
  ...(fp !== undefined && { fp }),
  reward: { fp: net, blueprints: 0, medals: 0 },
});
const empty = (nets: number[]) => nets.map((net, i) => place(i + 1, net));

describe('own share', () => {
  it('asks the reward times the factor and pays in before each place what keeps it safe', () => {
    const calc = calculateOwnShare({ required: 1000, rankings: [me(0), ...empty([100, 50, 20, 10, 5])], factor: 90 });
    // 5 × 1.9 = 9.5 rounds up as in the calculator
    expect(calc.places.map((p) => [p.rank, p.amount, p.advance])).toEqual([
      [1, 190, 620],
      [2, 95, 0],
      [3, 38, 19],
      [4, 19, 0],
      [5, 10, 0],
    ]);
    // a tie keeps the earlier deposit: after P2 pays 95, 95 are missing and a newcomer can only tie
    expect(calc.ownShare).toBe(1000 - 352);
    expect(calc.open).toBe(648);
    // 9 are still missing after P5: the owner finishes the level
    expect(calc.rest).toBe(9);
    // place 1 needs own Forge points first, so no place can be handed out right away
    expect(calc.safeRanks).toEqual([]);
  });

  it('counts the own deposit already paid and the deposits of others', () => {
    const calc = calculateOwnShare({
      required: 1000,
      rankings: [me(400), place(1, 100, 190), place(2, 50), place(3, 20)],
      factor: 90,
    });
    expect(calc.myDeposit).toBe(400);
    expect(calc.missing).toBe(410);
    // P1 holds 190 while 410 are missing: the owner pays 220 first
    expect(calc.places[0]).toMatchObject({ rank: 1, holder: { name: 'P1', fp: 190 }, amount: 190, advance: 220 });
    expect(calc.places.slice(1).map((p) => [p.amount, p.advance])).toEqual([
      [95, 0],
      [38, 19],
    ]);
    expect(calc.ownShare).toBe(1000 - 190 - 95 - 38);
    expect(calc.open).toBe(calc.ownShare - 400);
  });

  it('counts a promised payment (Ext) like a paid one on the place its amount reaches', () => {
    const calc = calculateOwnShare({
      required: 1000,
      rankings: [me(0), ...empty([100, 50, 20])],
      factor: 90,
      exts: [0, 300],
    });
    // 300 promised take place 1: the owner pays 400 first so the 300 hold against the 300 still missing
    expect(calc.places.map((p) => [p.rank, p.holder?.ext ?? false, p.amount, p.advance])).toEqual([
      [1, true, 300, 400],
      [2, false, 95, 110],
      [3, false, 38, 19],
    ]);
    expect(calc.ownShare).toBe(1000 - 300 - 95 - 38);
  });

  it('secures the places others hold unless told not to, and trusts them not to add more when told so', () => {
    const rankings = [me(0), place(1, 100, 300), place(2, 50, 200)];
    const advances = (o: object) =>
      calculateOwnShare({ required: 1000, rankings, factor: 90, ...o }).places.map((p) => p.advance);
    // 500 missing: P1 is safe once 500 - x + 200 <= 300, then P2 holds against the 100 left
    expect(advances({})).toEqual([400, 0]);
    // trusted, only a newcomer counts: P1 against the missing 500, then P2 against the 300 left
    expect(advances({ trust: true })).toEqual([200, 100]);
    expect(advances({ secureExisting: false })).toEqual([0, 0]);
  });

  it('warns when a sniper can take a free place before the helper pays, and when a payment levels', () => {
    const calc = calculateOwnShare({ required: 300, rankings: [me(0), ...empty([100, 50, 20])], factor: 90 });
    // 300 missing: 150 make place 1 safe for a sniper, 40 less than the helper pays
    expect(calc.places.map((p) => [p.rank, p.danger, p.levels])).toEqual([
      [1, 40, false],
      [2, 40, false],
      // 15 fill the level, and 8 of a sniper would hold it as well
      [3, 7, true],
    ]);
    // none needs own Forge points first, so all three can be handed out right away
    expect(calc.safeRanks).toEqual([1, 2, 3]);
  });

  it('marks the places past a full level and caps the last payment at what is missing', () => {
    const calc = calculateOwnShare({ required: 300, rankings: [me(0), ...empty([100, 50, 20])], factor: 90 });
    expect(calc.places.map((p) => [p.amount, p.advance, p.full])).toEqual([
      [190, 0, false],
      [95, 0, false],
      [15, 0, false],
    ]);
    const full = calculateOwnShare({ required: 200, rankings: [me(0), ...empty([100, 50])], factor: 90 });
    expect(full.places.map((p) => [p.amount, p.full])).toEqual([
      [190, false],
      [10, false],
    ]);
    const done = calculateOwnShare({ required: 190, rankings: [me(0), ...empty([100, 50])], factor: 90 });
    expect(done.places[1]).toMatchObject({ amount: 0, full: true });
  });

  it('lets helpers push placeholders down: the recorded own Arc as the old toolbox shows it', () => {
    // the Arc as seen 2026-10-23: 5.830 own, 10 and 3 on P1 and P2, 21.777 needed, factor 2
    const rankings = (toRankingRows(fixture.own.responseData.rankings) as RankingRow[]).map((r) =>
      r.self ? { ...r, fp: 5830 } : r,
    );
    const calc = calculateOwnShare({ required: 21777, rankings, factor: 100 });
    // P1 asks 5.210, more than its 10: the helper takes it, the 10 count as the holder below
    expect(calc.places.map((p) => [p.rank, p.holder?.fp, p.amount, p.advance])).toEqual([
      [1, undefined, 5210, 5524],
      [2, undefined, 2610, 0],
      [3, undefined, 870, 860],
      [4, undefined, 220, 430],
      [5, undefined, 40, 140],
    ]);
    expect(calc.rest).toBe(30);
    expect(calc.pushed).toEqual({ from: 6, to: 7, fp: 13 });
    expect(calc.ownShare).toBe(12814);
    expect(calc.open).toBe(12814 - 5830);
    // a placeholder is no holder to secure, so Absichern changes nothing here
    expect(calculateOwnShare({ required: 21777, rankings, factor: 100, secureExisting: false }).ownShare).toBe(12814);
  });

  it('keeps a deposit on its place when it is at least the payment of a helper', () => {
    // 300 on P1 against an ask of 190 stays; 40 on P2 against 95 is pushed down to P3's level
    const calc = calculateOwnShare({
      required: 1000,
      rankings: [me(0), place(1, 100, 300), place(2, 50, 40), place(3, 20)],
      factor: 90,
    });
    expect(calc.places.map((p) => [p.rank, p.holder?.fp, p.amount])).toEqual([
      [1, 300, 300],
      [2, undefined, 95],
      [3, 40, 40],
    ]);
    expect(calc.pushed).toBeUndefined();
  });
});

describe('places without a Forge point reward', () => {
  const rankings = [me(0), ...empty([100, 50, 20, 0, 0])];

  it('are not offered without the setting: no own Forge points before them, the rest comes at the end', () => {
    const calc = calculateOwnShare({ required: 1000, rankings, factor: 90 });
    expect(calc.places.map((p) => [p.rank, p.amount, p.advance, p.unoffered ?? false])).toEqual([
      [1, 190, 620, false],
      [2, 95, 0, false],
      [3, 38, 19, false],
      [4, 0, 0, true],
      [5, 0, 0, true],
    ]);
    expect(calc.rest).toBe(38);
    expect(calc.ownShare).toBe(677);
  });

  it('count as one paid Forge point with the setting, which lowers the own share by one each', () => {
    const calc = calculateOwnShare({ required: 1000, rankings, factor: 90, oneFpForNoReward: true });
    // 38 missing before P4: the owner leaves 2, so 1 on P4 holds against the 1 left, which P5 pays
    expect(calc.places.slice(3).map((p) => [p.rank, p.amount, p.advance, p.levels])).toEqual([
      [4, 1, 36, false],
      [5, 1, 0, true],
    ]);
    expect(calc.rest).toBe(0);
    expect(calc.ownShare).toBe(675);
  });
});
