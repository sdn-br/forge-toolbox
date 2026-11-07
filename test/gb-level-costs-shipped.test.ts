import { describe, expect, it } from 'vitest';
import shipped from '../src/content/data/gb-level-costs.json';
import { levelCosts } from '../src/content/domain/gb-level-cost';

/** the levels 0 to 9 after the prestige update: linear from the base */
const listed = (base: number) => Array.from({ length: 10 }, (_, i) => base * (i + 1));
const rowsOf = (type: string) => new Map(shipped.filter((r) => r.type === type).map((r) => [r.level, r.fp]));

describe('the shipped level costs', () => {
  it('are whole positive costs of levels, one row per type and level', () => {
    const keys = new Set<string>();
    for (const r of shipped) {
      expect(Object.keys(r).sort()).toEqual(['fp', 'level', 'type']);
      expect(Number.isInteger(r.level) && r.level >= 0).toBe(true);
      expect(Number.isInteger(r.fp) && r.fp > 0).toBe(true);
      keys.add(`${r.type}:${r.level}`);
    }
    expect(keys.size).toBe(shipped.length);
  });

  it('compute the levels checked in the game (2026-11-05 and 2026-11-06)', () => {
    // estimated from the shipped rows, the checked level itself left out
    const at = (type: string, base: number, level: number) => {
      const rows = rowsOf(type);
      rows.delete(level);
      return levelCosts(listed(base), rows)(level)?.fp;
    };
    expect(at('X_FutureEra_Landmark1', 84, 137)).toBe(62495);
    expect(at('X_BronzeAge_Landmark2', 44, 88)).toBe(3667);
    expect(at('X_EarlyMiddleAge_Landmark3', 47, 64)).toBe(2385);
    expect(at('X_OceanicFuture_Landmark3', 100, 190)).toBe(139070);
  });
});
