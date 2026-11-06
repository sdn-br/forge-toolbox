import { describe, expect, it } from 'vitest';
import { emptyLevel, placeRewards, poolShare, previewLevel } from '../src/content/domain/gb-level-preview';
import { calculateOwnShare } from '../src/content/domain/gb-own-share';
import { toBuildingDef } from '../src/content/game/building-defs';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import definitions from './fixtures/gb-definitions.json';

const def = (id: string): GreatBuildingDef => {
  const file = definitions.files.find((f) => f.json.id === id);
  const gb = file && toBuildingDef(file.json)?.greatBuilding;
  if (!gb) throw new Error(`no definition ${id}`);
  return gb;
};

describe('poolShare', () => {
  it('gives the share of the cost all places get by the level the construction goes to', () => {
    expect([1, 9, 10, 39, 40, 69, 70, 100, 101, 200, 201, 300, 301, 400, 401, 1000].map(poolShare)).toEqual([
      25, 25, 30, 30, 40, 40, 25, 25, 15, 15, 10, 10, 7, 7, 5, 5,
    ]);
  });
});

describe('placeRewards', () => {
  // recorded 2026-11-05, after the prestige update
  it('pays seven places on a gold level: Arche 137 to 138, cost 62495, 15 %', () => {
    expect(placeRewards(62495, 138, 7)).toEqual([5456, 2728, 909, 227, 45, 8, 2]);
  });

  it('pays five places on a copper level: Zeus 88 to 89, cost 3667, 25 %', () => {
    expect(placeRewards(3667, 89, 5)).toEqual([534, 267, 89, 22, 4]);
  });

  it('pays the same on the cost range of Blaue Galaxie 190 to 191, 139070 to 139075, 15 %', () => {
    const recorded = [12141, 6070, 2023, 506, 101, 17, 2];
    for (let cost = 139070; cost <= 139075; cost++) expect(placeRewards(cost, 191, 7), String(cost)).toEqual(recorded);
  });

  it('rounds each place from the pool, halves up, and pays 2 for a 1 and 4 for a 3', () => {
    // pool 127.5: 74.27, 37.14, 12.38, 3.09, 0.62
    expect(placeRewards(510, 6, 5)).toEqual([74, 37, 12, 4, 2]);
  });
});

/** a cost computed from the costs seen */
const estimated = (fp: number) => ({ fp, estimate: true });

describe('previewLevel', () => {
  const arche = def('X_FutureEra_Landmark1');

  it('shows a later level as open and empty: cost of that level, rewards with the Arc bonus', () => {
    const p = previewLevel({ greatBuilding: arche, level: 135, cost: estimated(21777), arcBonus: 95.5, factor: 90 });
    expect(p.required).toBe(21777);
    // an estimated cost makes estimated rewards
    expect(p.estimate).toBe(true);
    const places = p.calc?.places ?? [];
    expect(places.map((x) => x.net)).toEqual([1903, 951, 317, 79, 16]);
    expect(places.map((x) => x.gross)).toEqual([3720, 1859, 620, 154, 31]);
    // empty: every place is safe at half of the cost, only the first can be had
    expect(places.map((x) => x.safeCost)).toEqual([10889, 10889, 10889, 10889, 10889]);
    expect(places.map((x) => x.available)).toEqual([true, false, false, false, false]);
    expect(places[0]?.demandCost).toBe(3616);
  });

  it('has seven places on a gold level', () => {
    const gold: GreatBuildingDef = { ...arche, maxTier: 'gold' };
    const p = previewLevel({ greatBuilding: gold, level: 135, cost: estimated(21777), arcBonus: 95.5, factor: 90 });
    expect(p.calc?.places.map((x) => x.net)).toEqual([1901, 951, 317, 79, 16, 4, 0]);
    // level 99 to 100 is copper
    const copper = previewLevel({ greatBuilding: gold, level: 99, cost: estimated(8670), arcBonus: 0, factor: 90 });
    expect(copper.calc?.places).toHaveLength(5);
  });

  it('is no estimate with an exact cost', () => {
    const cost = { fp: 970, estimate: false };
    expect(previewLevel({ greatBuilding: arche, level: 9, cost, arcBonus: 0, factor: 90 }).estimate).toBe(false);
  });

  it('has no places without a cost', () => {
    const p = previewLevel({ greatBuilding: arche, level: 20, cost: undefined, arcBonus: 0, factor: 90 });
    expect(p.required).toBeUndefined();
    expect(p.calc).toBeUndefined();
  });
});

describe('emptyLevel', () => {
  const arche = def('X_FutureEra_Landmark1');

  it('gives the places of a level with nobody on them, for the own share as well', () => {
    const e = emptyLevel(arche, 135, estimated(21777));
    expect(e.required).toBe(21777);
    expect(e.rankings?.map((r) => [r.rank, r.reward?.fp, r.fp])).toEqual([
      [1, 1903, undefined],
      [2, 951, undefined],
      [3, 317, undefined],
      [4, 79, undefined],
      [5, 16, undefined],
    ]);
    // the own share of the empty level: the cost less what helpers pay at 1,9
    const calc = calculateOwnShare({ required: 21777, rankings: e.rankings ?? [], factor: 90 });
    expect(calc.places.map((p) => p.amount)).toEqual([3616, 1807, 602, 150, 30]);
    expect(calc.places[0]?.advance).toBe(14545);
    expect(calc.ownShare).toBe(21777 - 6205);
    expect(calc.myDeposit).toBe(0);
  });

  it('takes an exact cost as the real one: no estimate', () => {
    const e = emptyLevel({ ...arche, maxTier: 'gold' }, 137, { fp: 62495, estimate: false });
    expect(e).toMatchObject({ required: 62495, estimate: false });
    expect(e.rankings?.map((r) => r.reward?.fp)).toEqual([5456, 2728, 909, 227, 45, 8, 2]);
  });

  it('has no places without a cost', () => {
    const e = emptyLevel(arche, 20, undefined);
    expect(e.required).toBeUndefined();
    expect(e.rankings).toBeUndefined();
  });
});

describe('great building definitions', () => {
  it('read the era of the building and its level costs', () => {
    expect(def('X_FutureEra_Landmark1')).toEqual({
      era: 'FutureEra',
      levelCosts: [70, 110, 200, 290, 400, 510, 620, 740, 860, 970],
    });
  });

  it('take NoAge as the era of buildings of every era', () => {
    expect(def('X_AllAge_Oracle').era).toBe('AllAge');
  });

  it('fall back to the era in the id without min_era', () => {
    const gb = toBuildingDef({
      id: 'X_TomorrowEra_Landmark1',
      type: 'greatbuilding',
      strategy_points_for_upgrade: [1],
    });
    expect(gb?.greatBuilding?.era).toBe('TomorrowEra');
  });

  it('leave other buildings without', () => {
    expect(toBuildingDef({ id: 'R_MultiAge_Residential1', type: 'residential' })?.greatBuilding).toBeUndefined();
  });
});
