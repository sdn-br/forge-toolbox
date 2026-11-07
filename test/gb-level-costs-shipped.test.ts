import { describe, expect, it } from 'vitest';
import shipped from '../src/content/data/gb-level-costs.json';

const file: Record<string, Record<string, number>> = shipped;

describe('the shipped level costs', () => {
  it('are whole positive costs of every level from 0, without a gap', () => {
    expect(Object.keys(file).length).toBeGreaterThan(0);
    for (const [type, levels] of Object.entries(file)) {
      expect(type).toMatch(/^X_\w+$/);
      const keys = Object.keys(levels).map(Number);
      expect(keys, type).toEqual(Array.from({ length: keys.length }, (_, level) => level));
      for (const fp of Object.values(levels)) expect(Number.isInteger(fp) && fp > 0, type).toBe(true);
    }
  });

  it('hold the levels checked in the game (2026-11-05 and 2026-11-06)', () => {
    expect(file.X_FutureEra_Landmark1?.['137']).toBe(62495); // Arche
    expect(file.X_BronzeAge_Landmark2?.['88']).toBe(3667); // Zeusstatue
    expect(file.X_EarlyMiddleAge_Landmark3?.['64']).toBe(2385); // Galataturm
    expect(file.X_OceanicFuture_Landmark3?.['190']).toBe(139070); // Die blaue Galaxie
  });
});
