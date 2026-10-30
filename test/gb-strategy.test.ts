import { describe, expect, it } from 'vitest';
import { type ConstructionInput, calculateConstruction } from '../src/content/domain/gb-calculator';
import { levelUpAndFirst } from '../src/content/domain/gb-strategy';
import { toBuildingDef } from '../src/content/game/building-defs';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import type { RankingRow } from '../src/content/model/great-building';
import definitions from './fixtures/gb-definitions.json';

const def = (id: string): GreatBuildingDef => {
  const file = definitions.files.find((f) => f.json.id === id);
  const gb = file && toBuildingDef(file.json)?.greatBuilding;
  if (!gb) throw new Error(`no definition ${id}`);
  return gb;
};

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
  const levelUp = (i: ConstructionInput, greatBuilding: GreatBuildingDef | undefined) =>
    levelUpAndFirst(i, calculateConstruction(i), greatBuilding);

  it('nothing paid in: fills the level, lands below the deposits that stay safe and takes place 1 of the next', () => {
    // 2390 in, every place safe: 10 missing lands on 6 without a reward, -10, with the next +80 still +70 over 0
    const rows = [row(1, 1300), row(2, 900), row(3, 100), row(4, 50), row(5, 40)];
    expect(levelUp(input(rows), gb)).toEqual({
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
    expect(levelUp(input(rows), gb)).toMatchObject({ fill: 20, rank: 4, fillGain: -20, total: 60 });
  });

  it('is left out when a place of the current level pays more without levelling', () => {
    // 2200 in, 200 missing: levelling lands on 3, round(110 × 1.955) = 215 for 200: +15, with the next +95. Taking 3
    // safely costs round(200 / 2) = 100 for the same 215: +115, more than both together
    const rows = [row(1, 1300), row(2, 900), row(3), row(4), row(5)];
    expect(levelUp(input(rows), gb)).toBeUndefined();
  });

  it('own deposit: the total of own deposit and the rest decides the place and the cost', () => {
    // 1500 needed: owner 100, 600 on 1, mine 500 on 2, 100 on 3, 200 missing: 700 passes place 1, 1281 - 700 = +581,
    // with the next +661. Without levelling the best is taking place 1 safely: round((600 + 700) / 2) = 650, +631
    const rows = [owner(100), row(1, 600), row(2, 500, true), row(3, 100), row(4), row(5)];
    expect(levelUp(input(rows, { required: 1500 }), gb)).toMatchObject({
      fill: 200,
      rank: 1,
      fillGain: 581,
      total: 661,
    });
  });

  it('is left out when the own place already pays more than levelling and place 1 of the next together', () => {
    // mine 500 on 2 is safe: 645 - 500 = +145 as it stands; levelling with 100 more and P1 of the next brings +125
    const rows = [owner(100), row(1, 1600), row(2, 500, true), row(3, 100), row(4), row(5)];
    expect(levelUp(input(rows), gb)).toBeUndefined();
  });

  it('on a tie the earlier deposit stays ahead', () => {
    // 1500 and 600 of others, mine 550 on 3: 2700 needed, 50 missing, 600 ties place 2 and stays on 3; as it stands
    // place 3 brings 1173 - 550 = +623, less than levelling and the next together
    const rows = [row(1, 1500, false, 655), row(2, 600, false, 1000), row(3, 550, true, 600), row(4), row(5)];
    // round(600 × 1.955) = 1173 - 600 = 573, not the 1955 - 600 of place 2
    expect(levelUp(input(rows, { required: 2700 }), gb)).toMatchObject({ rank: 3, fillGain: 573, total: 653 });
  });

  it('is left out when it does not pay: the recorded own second place', () => {
    // 2434 as recorded: mine 575 on 2, 211 missing, 786 on 2 for 645: -141, with the next +80 still -61
    const rows = [row(1, 1150), row(2, 575, true), row(3, 363), owner(100), row(4, 1), row(5)];
    expect(levelUp(input(rows), gb)).toBeUndefined();
  });

  it('is left out when the next level is not unlocked, its reward is unknown or the building is blocked', () => {
    const rows = [row(1, 1300), row(2, 900), row(3, 100), row(4, 50), row(5, 40)];
    // unlocked up to 53: the construction from 53 is not open after the level up
    expect(levelUp(input(rows, { maxLevel: 53 }), gb)).toBeUndefined();
    expect(levelUp(input(rows, { maxLevel: 54 }), gb)).toBeDefined();
    expect(levelUp(input(rows, { level: 1999, maxLevel: 3000 }), gb)).toBeUndefined();
    expect(levelUp(input(rows, { connected: false }), gb)).toBeUndefined();
    expect(levelUp(input(rows), undefined)).toBeUndefined();
  });
});
