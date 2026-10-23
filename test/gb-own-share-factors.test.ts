import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { PlaceFactors, STANDARD_KEY, savedKey } from '../src/content/features/gb-own-share/place-factors';
import type { FactorChoice } from '../src/content/ui/factor-bar';
import { UiState } from '../src/content/ui/ui-state';

const fixed = (value: number): FactorChoice => ({ value, arc: false });
const ARC: FactorChoice = { value: 90, arc: true };

function setup(single: FactorChoice = fixed(90)) {
  const ui = new UiState(memoryKv());
  let setting = single;
  const factors = new PlaceFactors(ui, () => setting);
  const values = (def: string) => factors.state(def).choices.map((c) => (c.arc ? 'arc' : c.value));
  const buttons = (def: string) => {
    const s = factors.state(def);
    return { status: s.status, save: s.canSave, reset: s.canReset, adopt: s.canAdopt };
  };
  return { ui, factors, values, buttons, setSetting: (c: FactorChoice) => (setting = c) };
}

describe('the factors of the five places', () => {
  it('take the single setting for all five while no standard is stored', () => {
    const { values, buttons } = setup();
    expect(values('Arc')).toEqual([90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
  });

  it('keep a change per building until it is saved, also across switching buildings', () => {
    const { factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.setPlace('Arc', 2, 80);
    factors.setPlace('Zeus', 1, 70);
    expect(values('Arc')).toEqual([100, 80, 100, 100, 100]);
    expect(values('Zeus')).toEqual([70, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'changed', save: true, reset: true, adopt: true });
    // a change back to the standard is no change
    factors.setPlace('Zeus', 1, 90);
    expect(buttons('Zeus')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
  });

  it('save the five for one building, which then override the standard', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.save('Arc');
    expect(values('Arc')).toEqual([100, 100, 100, 100, 100]);
    expect(values('Zeus')).toEqual([90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'saved', save: false, reset: true, adopt: true });
    expect(JSON.parse(ui.pref(savedKey('Arc')) ?? '')).toHaveLength(5);
    factors.setPlace('Arc', 5, 80);
    expect(buttons('Arc')).toEqual({ status: 'changed', save: true, reset: true, adopt: true });
  });

  it('reset a building to the standard, its saved values and its change gone', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.save('Arc');
    factors.setPlace('Arc', 1, 80);
    factors.reset('Arc');
    expect(values('Arc')).toEqual([90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
    expect(ui.pref(savedKey('Arc'))).toBeUndefined();
  });

  it('adopt the five as the standard for every building without saved values', () => {
    const { factors, values, buttons } = setup();
    factors.setAll('Zeus', fixed(100));
    factors.save('Zeus');
    factors.setPlace('Arc', 1, 100);
    factors.setPlace('Arc', 2, 80);
    factors.adopt('Arc');
    expect(values('Arc')).toEqual([100, 80, 90, 90, 90]);
    expect(values('Babel')).toEqual([100, 80, 90, 90, 90]);
    expect(values('Zeus')).toEqual([100, 100, 100, 100, 100]);
    // the change equals the new standard now
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
    expect(buttons('Zeus').adopt).toBe(true);
  });

  it('drop the stored standard when the setting changes, so it sets all five alike again', () => {
    const { ui, factors, values, setSetting } = setup();
    factors.setPlace('Arc', 1, 100);
    factors.adopt('Arc');
    setSetting(fixed(80));
    factors.dropStandard();
    expect(ui.pref(STANDARD_KEY)).toBeUndefined();
    expect(values('Babel')).toEqual([80, 80, 80, 80, 80]);
  });

  it('store Arc as the choice, not the number, and a typed number holds it', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', ARC);
    factors.setPlace('Arc', 3, 100);
    expect(values('Arc')).toEqual(['arc', 'arc', 100, 'arc', 'arc']);
    factors.save('Arc');
    expect(JSON.parse(ui.pref(savedKey('Arc')) ?? '')[0].arc).toBe(true);
    expect(values('Arc')).toEqual(['arc', 'arc', 100, 'arc', 'arc']);
    expect(buttons('Arc').status).toBe('saved');
  });

  it('take Arc from the setting for all five', () => {
    const { values } = setup(ARC);
    expect(values('Arc')).toEqual(['arc', 'arc', 'arc', 'arc', 'arc']);
  });
});
