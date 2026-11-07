import { describe, expect, it } from 'vitest';
import shipped from '../src/content/data/gb-level-costs.json';
import { learnSteps, levelCosts, seedEntries, seedJson, withShipped } from '../src/content/domain/gb-level-cost';

/** the levels 0 to 9 after the prestige update: linear from the base */
const listed = (base: number) => Array.from({ length: 10 }, (_, i) => base * (i + 1));
const file: Record<string, Record<string, number>> = shipped;
const levelsOf = (type: string) => new Map(Object.entries(file[type] ?? {}).map(([level, fp]) => [Number(level), fp]));

describe('the shipped level costs', () => {
  it('are whole positive costs of every level from 0, written as seedJson writes them', () => {
    for (const [type, levels] of Object.entries(file)) {
      const keys = Object.keys(levels).map(Number);
      expect(keys, type).toEqual(Array.from({ length: keys.length }, (_, level) => level));
      for (const fp of Object.values(levels)) expect(Number.isInteger(fp) && fp > 0, type).toBe(true);
    }
    const seen = new Map(Object.keys(file).map((type) => [type, levelsOf(type)]));
    expect(seedEntries(file).length).toBe([...seen.values()].reduce((sum, levels) => sum + levels.size, 0));
    expect(JSON.parse(seedJson(seen))).toEqual(file);
  });

  it('compute the levels checked in the game (2026-11-05 and 2026-11-06)', () => {
    // estimated from the shipped levels, the checked level itself left out
    const at = (type: string, base: number, level: number) => {
      const levels = levelsOf(type);
      levels.delete(level);
      return levelCosts(listed(base), levels)(level)?.fp;
    };
    expect(at('X_FutureEra_Landmark1', 84, 137)).toBe(62495);
    expect(at('X_BronzeAge_Landmark2', 44, 88)).toBe(3667);
    expect(at('X_EarlyMiddleAge_Landmark3', 47, 64)).toBe(2385);
    expect(at('X_OceanicFuture_Landmark3', 100, 190)).toBe(139070);
  });

  it('give the Horizontriss-Siphon exact costs of every level, though its segment from 100 fits no single step', () => {
    const levels = levelsOf('X_StellarAgeDiscovery_Landmark1');
    const base = levels.get(0) as number;
    expect(learnSteps(listed(base), levels).find((s) => s.first === 100)?.disabled).toBe(true);
    const cost = levelCosts(listed(base), withShipped(listed(base), new Map(), levels));
    expect(levels.size).toBeGreaterThan(100);
    for (const [level, fp] of levels) expect(cost(level), `level ${level}`).toEqual({ fp, estimate: false });
  });
});
