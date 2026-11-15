import { describe, expect, it } from 'vitest';
import { factorButtons, factorText } from '../src/content/ui/factor-bar';

describe('the factor buttons by tier', () => {
  it('read as a factor, on gold levels with two decimals', () => {
    expect(factorText(90)).toBe('1,9');
    expect(factorText(95.5)).toBe('1,955');
    expect(factorText(19, 'gold')).toBe('1,19');
    expect(factorText(10, 'gold')).toBe('1,10');
  });

  it('mark the preset the fixed factor of the tier holds, the Arc bonus sorted in', () => {
    const choice = { value: 90, arc: false, gold: 15 };
    const gold = factorButtons([10, 15, 20], 12, choice, { copper: 93, gold: 12 }, 'gold');
    expect(gold.map((b) => [b.label, b.active])).toEqual([
      ['1,10', false],
      ['1,12', false],
      ['1,15', true],
      ['1,20', false],
    ]);
    const copper = factorButtons([80, 90, 100], 93, choice);
    expect(copper.filter((b) => b.active).map((b) => b.label)).toEqual(['1,9']);
  });

  it('show a preset of the same value as the Arc bonus once, as the Arc button', () => {
    const fixed = factorButtons([80, 90, 100], 90, { value: 90, arc: false, gold: 15 });
    expect(fixed.map((b) => [b.label, b.arc, b.active])).toEqual([
      ['1,8', false, false],
      ['1,9', true, true],
      ['2', false, false],
    ]);
    const arc = factorButtons([80, 90, 100], 90, { value: 80, arc: true, gold: 15 });
    expect(arc.filter((b) => b.active).map((b) => [b.label, b.arc])).toEqual([['1,9', true]]);
  });
});
