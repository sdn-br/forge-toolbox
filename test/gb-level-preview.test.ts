import { describe, expect, it } from 'vitest';
import {
  estimateFirstPlaceReward,
  firstPlaceReward,
  levelCost,
  levelUpAndFirst,
  placeRewards,
  previewLevel,
} from '../src/content/domain/gb-level-preview';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toGreatBuildingEntity, toRankingRows } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { GreatBuildingDef } from '../src/content/stores/catalog';
import type { RankingRow } from '../src/content/stores/great-building-model';
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

describe('placeRewards', () => {
  it('derives places 2 to 5 from the first, each rounded to 5 with halves up', () => {
    expect(placeRewards(2605)).toEqual([2605, 1305, 435, 110, 20]);
    expect(placeRewards(505)).toEqual([505, 255, 85, 20, 5]);
  });
});

describe('firstPlaceReward', () => {
  it('reads the table of the era of the building', () => {
    expect(firstPlaceReward('FutureEra', 135)).toEqual({ fp: 2605, estimate: false });
    expect(firstPlaceReward('AllAge', 10)).toEqual(firstPlaceReward('HighMiddleAge', 10));
  });

  it('estimates an era without a table from the curve of the other eras', () => {
    // the table has no Stone Age, one era before the Bronze Age
    const stone = firstPlaceReward('StoneAge', 100);
    expect(stone?.estimate).toBe(true);
    expect(stone?.fp).toBeLessThan(firstPlaceReward('BronzeAge', 100)?.fp ?? 0);
    expect((stone?.fp ?? 0) % 5).toBe(0);
  });

  it('estimates a level past the table of its era from the other eras', () => {
    // the Stellar Age row ends at level 250, older eras reach further
    expect(firstPlaceReward('StellarAgeDiscovery', 250)?.estimate).toBe(false);
    const later = firstPlaceReward('StellarAgeDiscovery', 300);
    expect(later?.estimate).toBe(true);
    expect(later?.fp).toBeGreaterThan(firstPlaceReward('StellarAgeDiscovery', 250)?.fp ?? 0);
  });

  it('estimates a level the table of the era lacks within 5 Forge points of the known values', () => {
    // every era with its whole table, as if each value were missing
    let compared = 0;
    for (const era of ['BronzeAge', 'ColonialAge', 'FutureEra', 'SpaceAgeSpaceHub'])
      for (let level = 0; level < 400; level++) {
        const known = firstPlaceReward(era, level);
        if (known?.estimate !== false) continue;
        const estimated = estimateFirstPlaceReward(era, level);
        expect(Math.abs((estimated ?? 0) - known.fp), `${era} ${level}`).toBeLessThanOrEqual(5);
        compared++;
      }
    expect(compared).toBeGreaterThan(1000);
  });

  it('knows nothing beyond the levels of all tables or for an unknown era', () => {
    expect(firstPlaceReward('FutureEra', 2000)).toBeUndefined();
    // levels 422 on: only scattered rows of single eras, too loose for 5 Forge points
    expect(firstPlaceReward('FutureEra', 421)?.estimate).toBe(true);
    expect(firstPlaceReward('FutureEra', 422)).toBeUndefined();
    expect(firstPlaceReward('ProgressiveEra', 482)?.estimate).toBe(false);
    expect(firstPlaceReward('SomeNewEra', 10)).toBeUndefined();
  });
});

describe('the formulas against the recorded constructions', () => {
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

  it('the rewards of the current level are what the game pays per place', () => {
    for (const { entity, rewards } of recorded) {
      const era = defs.get(entity.def)?.era ?? '';
      const p1 = firstPlaceReward(era, entity.level);
      expect(p1?.estimate).toBe(false);
      expect(placeRewards(p1?.fp ?? 0), `${entity.def} ${entity.level}`).toEqual(rewards);
    }
  });
});

describe('previewLevel', () => {
  const arche = def('X_FutureEra_Landmark1');

  it('shows a later level as open and empty: cost of that level, rewards with the Arc bonus', () => {
    const p = previewLevel({ greatBuilding: arche, level: 135, arcBonus: 95.5, factor: 90 });
    expect(p.required).toBe(21777);
    expect(p.reward).toEqual({ fp: 2605, estimate: false });
    const places = p.calc?.places ?? [];
    expect(places.map((x) => x.net)).toEqual([2605, 1305, 435, 110, 20]);
    expect(places.map((x) => x.gross)).toEqual([5093, 2551, 850, 215, 39]);
    // empty: every place is safe at half of the cost, only the first can be had
    expect(places.map((x) => x.safeCost)).toEqual([10889, 10889, 10889, 10889, 10889]);
    expect(places.map((x) => x.available)).toEqual([true, false, false, false, false]);
    expect(places[0]?.demandCost).toBe(4950);
    expect(places[0]?.rate).toBe(418);
  });

  it('has a cost but no places when the reward of the level is unknown', () => {
    const p = previewLevel({ greatBuilding: arche, level: 2000, arcBonus: 0, factor: 90 });
    expect(p.required).toBeGreaterThan(0);
    expect(p.reward).toBeUndefined();
    expect(p.calc).toBeUndefined();
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

describe('levelUpAndFirst', () => {
  // the recorded construction 2434 (ProgressiveEra, St. 52 of 60): 2400 needed; the next level 53 costs 2460, its
  // place 1 pays 670, round(670 × 1.955) = 1310 for the safe round(2460 / 2) = 1230: +80
  const gb = def('X_ProgressiveEra_Landmark1');
  const NET = [655, 330, 110, 30, 5];
  const row = (rank: number, fp?: number, self = false, net = NET[rank - 1] as number): RankingRow => ({
    rank,
    name: `P${rank}`,
    self,
    ...(fp !== undefined && { fp }),
    reward: { fp: net, blueprints: 0, medals: 0 },
  });
  const owner = (fp: number): RankingRow => ({ name: 'Owner', self: false, fp });
  const input = (rankings: RankingRow[], change = {}) => ({
    level: 52,
    maxLevel: 60,
    connected: true,
    required: 2400,
    rankings,
    arcBonus: 95.5,
    factor: 90,
    ...change,
  });

  it('nothing paid in: fills the level, lands below the deposits that stay safe and takes place 1 of the next', () => {
    // 2390 in, every place safe: 10 missing lands on 6 without a reward, -10, with the next +80 still +70 over 0
    const rows = [row(1, 1300), row(2, 900), row(3, 100), row(4, 50), row(5, 40)];
    expect(levelUpAndFirst(input(rows), gb)).toEqual({
      nextLevel: 53,
      fill: 10,
      rank: 6,
      fillGain: -10,
      firstCost: 1230,
      firstGain: 80,
      total: 70,
    });
  });

  it('counts a place of an early level that pays no Forge points as 0, levelling onto it and taking it alike', () => {
    // P4 and P5 pay 0 FP, as in the first levels: 2380 in, 20 missing lands on 4 for 0 FP: -20, with the next +60.
    // Taking 4 or 5 safely costs Forge points for 0, so the current level brings 0
    const rows = [row(1, 1300), row(2, 900), row(3, 180), row(4, undefined, false, 0), row(5, undefined, false, 0)];
    expect(levelUpAndFirst(input(rows), gb)).toMatchObject({ fill: 20, rank: 4, fillGain: -20, total: 60 });
  });

  it('is left out when a place of the current level pays more without levelling', () => {
    // 2200 in, 200 missing: levelling lands on 3, round(110 × 1.955) = 215 for 200: +15, with the next +95. Taking 3
    // safely costs round(200 / 2) = 100 for the same 215: +115, more than both together
    const rows = [row(1, 1300), row(2, 900), row(3), row(4), row(5)];
    expect(levelUpAndFirst(input(rows), gb)).toBeUndefined();
  });

  it('own deposit: the total of own deposit and the rest decides the place and the cost', () => {
    // owner 100, 1600 on 1, mine 500 on 2, 100 on 3: 100 missing, 600 stays on 2: round(330 × 1.955) = 645 - 600
    const rows = [owner(100), row(1, 1600), row(2, 500, true), row(3, 100), row(4), row(5)];
    expect(levelUpAndFirst(input(rows), gb)).toMatchObject({ fill: 100, rank: 2, fillGain: 45, total: 125 });
  });

  it('on a tie the earlier deposit stays ahead', () => {
    // 1500 and 600 of others, mine 500 on 3: 2700 needed, 100 missing, 600 ties place 2 and stays on 3
    const rows = [row(1, 1500, false, 655), row(2, 600, false, 1000), row(3, 500, true, 600), row(4), row(5)];
    // round(600 × 1.955) = 1173 - 600 = 573, not the 1955 - 600 of place 2
    expect(levelUpAndFirst(input(rows, { required: 2700 }), gb)).toMatchObject({ rank: 3, fillGain: 573, total: 653 });
  });

  it('is left out when it does not pay: the recorded own second place', () => {
    // 2434 as recorded: mine 575 on 2, 211 missing, 786 on 2 for 645: -141, with the next +80 still -61
    const rows = [row(1, 1150), row(2, 575, true), row(3, 363), owner(100), row(4, 1), row(5)];
    expect(levelUpAndFirst(input(rows), gb)).toBeUndefined();
  });

  it('is left out when the next level is not unlocked, its reward is unknown or the building is blocked', () => {
    const rows = [row(1, 1300), row(2, 900), row(3, 100), row(4, 50), row(5, 40)];
    // unlocked up to 53: the construction from 53 is not open after the level up
    expect(levelUpAndFirst(input(rows, { maxLevel: 53 }), gb)).toBeUndefined();
    expect(levelUpAndFirst(input(rows, { maxLevel: 54 }), gb)).toBeDefined();
    expect(levelUpAndFirst(input(rows, { level: 1999, maxLevel: 3000 }), gb)).toBeUndefined();
    expect(levelUpAndFirst(input(rows, { connected: false }), gb)).toBeUndefined();
    expect(levelUpAndFirst(input(rows), undefined)).toBeUndefined();
  });
});
