import { describe, expect, it } from 'vitest';
import { levelCosts } from '../src/content/domain/gb-level-cost';

const listed = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

describe('levelCosts', () => {
  it('takes the levels the definition lists, then those of the shipped file', () => {
    const cost = levelCosts(listed, { 0: 11, 9: 101, 10: 105, 11: 110 });
    // the definition comes from the game, so it wins over the file
    expect(cost(0)).toBe(10);
    expect(cost(9)).toBe(100);
    expect(cost(10)).toBe(105);
    expect(cost(11)).toBe(110);
  });

  it('knows nothing beyond the file and computes nothing', () => {
    const cost = levelCosts(listed, { 10: 105, 11: 110 });
    expect(cost(12)).toBeUndefined();
    expect(cost(500)).toBeUndefined();
    expect(levelCosts(listed)(10)).toBeUndefined();
  });

  it('has no cost for a level that is no whole number from 0', () => {
    const cost = levelCosts(listed, { 10: 105 });
    expect(cost(-1)).toBeUndefined();
    expect(cost(9.5)).toBeUndefined();
    expect(cost(Number.NaN)).toBeUndefined();
  });
});
