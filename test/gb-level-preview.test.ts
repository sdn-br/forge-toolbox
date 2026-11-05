import { describe, expect, it } from 'vitest';
import { emptyLevel, levelCost, placeRewards, poolShare, previewLevel } from '../src/content/domain/gb-level-preview';
import { calculateOwnShare } from '../src/content/domain/gb-own-share';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toGreatBuildingEntity, toRankingRows } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import contribution from './fixtures/gb-contribution.json';
import belowOwn from './fixtures/gb-contribution-below-own.json';
import definitions from './fixtures/gb-definitions.json';
import greatBuildings from './fixtures/great-buildings.json';

const def = (id: string): GreatBuildingDef => {
  const file = definitions.files.find((f) => f.json.id === id);
  const gb = file && toBuildingDef(file.json)?.greatBuilding;
  if (!gb) throw new Error(`no definition ${id}`);
  return gb;
};

interface Entry {
  requestMethod: string;
  requestData?: unknown;
  responseData?: unknown;
}

/** every recorded opening of a foreign great building: the building and the game's rewards per place */
function recordedConstructions() {
  const entries: Entry[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (typeof (o as Entry).requestMethod === 'string') entries.push(o as Entry);
      Object.values(o).forEach(walk);
    }
  };
  walk([greatBuildings, contribution, belowOwn]);
  const buildings = new Map<number, GameCityEntity>();
  for (const e of entries)
    if (e.requestMethod === 'getOtherPlayerCityMapEntity') {
      const b = e.responseData as GameCityEntity;
      buildings.set(b.id as number, b);
    }
  return entries
    .filter((e) => e.requestMethod === 'getConstruction' && buildings.has((e.requestData as number[])[0] as number))
    .map((e) => {
      const entity = toGreatBuildingEntity(buildings.get((e.requestData as number[])[0] as number) as GameCityEntity);
      const rankings = toRankingRows((e.responseData as { rankings: unknown }).rankings);
      if (!entity || !rankings) throw new Error('fixture does not parse');
      const rewards = rankings
        .filter((r) => r.rank !== undefined && r.reward)
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .map((r) => r.reward?.fp);
      return { entity, rewards };
    });
}

describe('levelCost', () => {
  const costs = [70, 110, 200, 290, 400, 510, 620, 740, 860, 970];

  it('takes the first ten levels from the definition, index = the level the construction starts from', () => {
    expect(levelCost(costs, 0)).toBe(70);
    expect(levelCost(costs, 9)).toBe(970);
  });

  it('grows by 2.5 % per level from level 10 on, rounded up', () => {
    expect(levelCost(costs, 10)).toBe(995);
    expect(levelCost(costs, 135)).toBe(21777);
  });

  it('knows nothing without the costs or for a negative level', () => {
    expect(levelCost([], 12)).toBeUndefined();
    expect(levelCost(costs, -1)).toBeUndefined();
  });
});

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

// the recorded rewards are of before the prestige update, the costs still hold
describe('the cost formula against the recorded constructions', () => {
  const recorded = recordedConstructions();
  const defs = new Map(definitions.files.map((f) => [f.json.id, def(f.json.id)]));

  it('covers every recorded foreign construction', () => {
    expect(recorded.length).toBeGreaterThanOrEqual(8);
  });

  it('the cost of the current level is what the construction needs', () => {
    for (const { entity } of recorded) {
      const gb = defs.get(entity.def);
      expect(gb, entity.def).toBeDefined();
      expect(levelCost(gb?.levelCosts ?? [], entity.level), `${entity.def} ${entity.level}`).toBe(entity.required);
    }
  });
});

describe('previewLevel', () => {
  const arche = def('X_FutureEra_Landmark1');

  it('shows a later level as open and empty: cost of that level, rewards with the Arc bonus', () => {
    const p = previewLevel({ greatBuilding: arche, level: 135, arcBonus: 95.5, factor: 90 });
    expect(p.required).toBe(21777);
    // the cost past level 10 comes from the growth, and the rewards from the cost
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
    const p = previewLevel({ greatBuilding: gold, level: 135, arcBonus: 95.5, factor: 90 });
    expect(p.calc?.places.map((x) => x.net)).toEqual([1901, 951, 317, 79, 16, 4, 0]);
    // level 99 to 100 is copper
    expect(previewLevel({ greatBuilding: gold, level: 99, arcBonus: 0, factor: 90 }).calc?.places).toHaveLength(5);
  });

  it('is no estimate on the levels the definition lists', () => {
    expect(previewLevel({ greatBuilding: arche, level: 9, arcBonus: 0, factor: 90 }).estimate).toBe(false);
    expect(previewLevel({ greatBuilding: arche, level: 10, arcBonus: 0, factor: 90 }).estimate).toBe(true);
  });

  it('has no places without the costs of the definition', () => {
    const p = previewLevel({ greatBuilding: { ...arche, levelCosts: [] }, level: 20, arcBonus: 0, factor: 90 });
    expect(p.required).toBeUndefined();
    expect(p.calc).toBeUndefined();
  });
});

describe('emptyLevel', () => {
  const arche = def('X_FutureEra_Landmark1');

  it('gives the places of a level with nobody on them, for the own share as well', () => {
    const e = emptyLevel(arche, 135);
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

  it('takes a known cost as the real one: no estimate', () => {
    const e = emptyLevel({ ...arche, maxTier: 'gold' }, 137, undefined, 62495);
    expect(e).toMatchObject({ required: 62495, estimate: false });
    expect(e.rankings?.map((r) => r.reward?.fp)).toEqual([5456, 2728, 909, 227, 45, 8, 2]);
  });

  it('has no places without a cost', () => {
    const e = emptyLevel({ ...arche, levelCosts: [] }, 20);
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
