import { describe, expect, it } from 'vitest';
import { doubleHarvest, hasDoubleHarvest } from '../src/content/domain/gb-double-harvest';
import { toBuildingDef } from '../src/content/game/building-defs';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import definitions from './fixtures/gb-definitions.json';

const def = (id: string): GreatBuildingDef => {
  const file = definitions.files.find((f) => f.json.id === id);
  const gb = file && toBuildingDef(file.json)?.greatBuilding;
  if (!gb) throw new Error(`no definition ${id}`);
  return gb;
};

// recorded 2026-10-23: the production in Forge points per level 0 to 10
const ROMAN = 'X_EarlyMiddleAge_Landmark1';
const VALUES = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6];

describe('great building definitions with a Forge point production', () => {
  it('keeps the values per level of a strategy_points production bonus', () => {
    expect(def(ROMAN).fpProduction).toEqual(VALUES);
  });

  it('keeps nothing for other production bonuses or none at all', () => {
    expect(def('X_LateMiddleAge_Landmark1').fpProduction).toBeUndefined();
    expect(def('X_BronzeAge_Landmark2').fpProduction).toBeUndefined();
  });
});

describe('doubleHarvest', () => {
  it('reads the production of level X + 1 from the definition up to level 10, exact', () => {
    const gb = def(ROMAN);
    expect(doubleHarvest(ROMAN, gb, 0)).toEqual({ fp: 1, estimate: false });
    expect(doubleHarvest(ROMAN, gb, 3)).toEqual({ fp: 2, estimate: false });
    expect(doubleHarvest(ROMAN, gb, 9)).toEqual({ fp: 6, estimate: false });
  });

  it('takes the next production of the open construction for the level being built, exact, also above level 10', () => {
    const gb = def(ROMAN);
    const next = { level: 40, type: 'strategy_points', value: 31 };
    expect(doubleHarvest(ROMAN, gb, 40, next)).toEqual({ fp: 31, estimate: false });
    // another level is not the one the construction told about
    expect(doubleHarvest(ROMAN, gb, 41, next)).toEqual({ fp: 25, estimate: true });
  });

  it('estimates above level 10 as the production of level 10 times (X + 1) / 10, rounded', () => {
    const gb = def(ROMAN);
    // 6 × 40 / 10 = 24
    expect(doubleHarvest(ROMAN, gb, 39)).toEqual({ fp: 24, estimate: true });
    // 6 × 12 / 10 = 7.2
    expect(doubleHarvest(ROMAN, gb, 11)).toEqual({ fp: 7, estimate: true });
    // level 10 itself is the first one past the list: 6 × 11 / 10 = 6.6
    expect(doubleHarvest(ROMAN, gb, 10)).toEqual({ fp: 7, estimate: true });
  });

  it('ignores a next production of another type', () => {
    const gb = def(ROMAN);
    expect(doubleHarvest(ROMAN, gb, 40, { level: 40, type: 'money', value: 99 })).toEqual({
      fp: 25,
      estimate: true,
    });
  });

  it('has nothing for buildings without a Forge point production, the Ark and the Temple of Relics', () => {
    expect(hasDoubleHarvest('X_LateMiddleAge_Landmark1', def('X_LateMiddleAge_Landmark1'))).toBe(false);
    expect(doubleHarvest('X_LateMiddleAge_Landmark1', def('X_LateMiddleAge_Landmark1'), 5)).toBeUndefined();
    const withFp: GreatBuildingDef = { era: 'FutureEra', levelCosts: [], fpProduction: VALUES };
    expect(hasDoubleHarvest('X_FutureEra_Landmark1', withFp)).toBe(false);
    expect(hasDoubleHarvest('X_AllAge_Expedition', withFp)).toBe(false);
    expect(hasDoubleHarvest('X_Other', withFp)).toBe(true);
  });

  it('has no value where the definition does not list the level', () => {
    const short: GreatBuildingDef = { era: 'FutureEra', levelCosts: [], fpProduction: [0, 1] };
    expect(doubleHarvest('X_Other', short, 5)).toBeUndefined();
    expect(doubleHarvest('X_Other', short, 20)).toBeUndefined();
  });
});
