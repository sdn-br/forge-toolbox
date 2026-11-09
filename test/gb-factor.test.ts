import { describe, expect, it } from 'vitest';
import { alikeOn, sameChoice } from '../src/content/domain/gb-factor';

describe('factor choices', () => {
  it('are alike on a copper level by places 1 to 5, on a gold level by all seven', () => {
    const c = { value: 90, arc: false, gold: 15 };
    const other = { value: 80, arc: false, gold: 12 };
    const choices = [c, c, c, c, c, other, other];
    expect(alikeOn(choices, 'copper')).toEqual(c);
    expect(alikeOn(choices, 'gold')).toBeUndefined();
  });

  it('are alike on a tier when the fixed factor of that tier is', () => {
    const a = { value: 90, arc: false, gold: 15 };
    expect(alikeOn([a, { ...a, value: 80 }], 'gold')).toEqual(a);
    expect(alikeOn([a, { ...a, value: 80 }], 'copper')).toBeUndefined();
    expect(sameChoice(a, { ...a, gold: 20 })).toBe(false);
  });
});
