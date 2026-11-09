import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import type { FactorChoice } from '../src/content/domain/gb-factor';
import { PlaceFactors, STANDARD_KEY, savedKey } from '../src/content/stores/place-factors';
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

describe('the factors of the seven places', () => {
  it('take the single setting for all seven while no standard is stored', () => {
    const { values, buttons } = setup();
    expect(values('Arc')).toEqual([90, 90, 90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
  });

  it('keep a change per building until it is saved, also across switching buildings', () => {
    const { factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.setPlace('Arc', 2, 80);
    factors.setPlace('Zeus', 1, 70);
    expect(values('Arc')).toEqual([100, 80, 100, 100, 100, 100, 100]);
    expect(values('Zeus')).toEqual([70, 90, 90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'changed', save: true, reset: true, adopt: true });
    // a change back to the standard is no change
    factors.setPlace('Zeus', 1, 90);
    expect(buttons('Zeus')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
  });

  it('save the seven for one building, which then override the standard', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.save('Arc');
    expect(values('Arc')).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(values('Zeus')).toEqual([90, 90, 90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'saved', save: false, reset: true, adopt: true });
    expect(JSON.parse(ui.pref(savedKey('Arc')) ?? '')).toHaveLength(7);
    factors.setPlace('Arc', 5, 80);
    expect(buttons('Arc')).toEqual({ status: 'changed', save: true, reset: true, adopt: true });
  });

  it('reset a building to the standard, its saved values and its change gone', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', fixed(100));
    factors.save('Arc');
    factors.setPlace('Arc', 1, 80);
    factors.reset('Arc');
    expect(values('Arc')).toEqual([90, 90, 90, 90, 90, 90, 90]);
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
    expect(ui.pref(savedKey('Arc'))).toBeUndefined();
  });

  it('adopt the seven as the standard for every building without saved values', () => {
    const { factors, values, buttons } = setup();
    factors.setAll('Zeus', fixed(100));
    factors.save('Zeus');
    factors.setPlace('Arc', 1, 100);
    factors.setPlace('Arc', 2, 80);
    factors.adopt('Arc');
    expect(values('Arc')).toEqual([100, 80, 90, 90, 90, 90, 90]);
    expect(values('Babel')).toEqual([100, 80, 90, 90, 90, 90, 90]);
    expect(values('Zeus')).toEqual([100, 100, 100, 100, 100, 100, 100]);
    // the change equals the new standard now
    expect(buttons('Arc')).toEqual({ status: 'standard', save: false, reset: false, adopt: false });
    expect(buttons('Zeus').adopt).toBe(true);
  });

  it('drop the stored standard when the setting changes, so it sets all seven alike again', () => {
    const { ui, factors, values, setSetting } = setup();
    factors.setPlace('Arc', 1, 100);
    factors.adopt('Arc');
    setSetting(fixed(80));
    factors.dropStandard();
    expect(ui.pref(STANDARD_KEY)).toBeUndefined();
    expect(values('Babel')).toEqual([80, 80, 80, 80, 80, 80, 80]);
  });

  it('store Arc as the choice, not the number, and a typed number holds it', () => {
    const { ui, factors, values, buttons } = setup();
    factors.setAll('Arc', ARC);
    factors.setPlace('Arc', 3, 100);
    expect(values('Arc')).toEqual(['arc', 'arc', 100, 'arc', 'arc', 'arc', 'arc']);
    factors.save('Arc');
    expect(JSON.parse(ui.pref(savedKey('Arc')) ?? '')[0].arc).toBe(true);
    expect(values('Arc')).toEqual(['arc', 'arc', 100, 'arc', 'arc', 'arc', 'arc']);
    expect(buttons('Arc').status).toBe('saved');
  });

  it('take Arc from the setting for all seven', () => {
    const { values } = setup(ARC);
    expect(values('Arc')).toEqual(['arc', 'arc', 'arc', 'arc', 'arc', 'arc', 'arc']);
  });
});

describe('the factors by tier (Nutzer, 2026-11-05)', () => {
  const gold = (c: FactorChoice[]) => c.map((x) => (x.arc ? 'arc' : x.gold));

  it('keep a fixed factor per tier: one set on gold leaves copper, the Arc choice counts for both', () => {
    const { factors, values } = setup({ value: 90, arc: false, gold: 15 });
    factors.setAll('Arc', fixed(20), 'gold');
    expect(values('Arc')).toEqual([90, 90, 90, 90, 90, 90, 90]);
    expect(gold(factors.state('Arc').choices)).toEqual([20, 20, 20, 20, 20, 20, 20]);
    factors.setPlace('Arc', 2, 12, 'gold');
    expect(gold(factors.state('Arc').choices)).toEqual([20, 12, 20, 20, 20, 20, 20]);
    factors.setAll('Arc', ARC);
    expect(values('Arc')).toEqual(['arc', 'arc', 'arc', 'arc', 'arc', 'arc', 'arc']);
    // a fixed copper factor afterwards brings back the gold ones kept
    factors.setAll('Arc', fixed(100));
    expect(gold(factors.state('Arc').choices)).toEqual([20, 12, 20, 20, 20, 20, 20]);
  });

  it('give choices stored before the tiers the gold factor of the settings', () => {
    const { ui, factors } = setup({ value: 90, arc: false, gold: 15 });
    ui.savePref(savedKey('Arc'), JSON.stringify(Array(5).fill(fixed(100))));
    expect(factors.state('Arc').choices[0]).toEqual({ value: 100, arc: false, gold: 15 });
  });

  it('extend five choices stored before seven places with copies of place 5, both tiers (Nutzer, 2026-11-05)', () => {
    const { ui, factors } = setup({ value: 90, arc: false, gold: 15 });
    const stored = [fixed(100), fixed(100), fixed(100), fixed(100), { value: 80, arc: false, gold: 12 }];
    ui.savePref(savedKey('Arc'), JSON.stringify(stored));
    ui.savePref(STANDARD_KEY, JSON.stringify(Array(5).fill(ARC)));
    const choices = factors.state('Arc').choices;
    expect(choices).toHaveLength(7);
    expect(choices.slice(4)).toEqual(Array(3).fill({ value: 80, arc: false, gold: 12 }));
    expect(factors.state('Arc').status).toBe('saved');
    expect(factors.standard().map((c) => c.arc)).toEqual(Array(7).fill(true));
    // the next save stores seven
    factors.setPlace('Arc', 7, 70);
    factors.save('Arc');
    expect(JSON.parse(ui.pref(savedKey('Arc')) ?? '')).toHaveLength(7);
    expect(factors.state('Arc').choices.map((c) => c.value)).toEqual([100, 100, 100, 100, 80, 80, 70]);
  });

  it('take lists of another length as not stored', () => {
    const { ui, values } = setup();
    ui.savePref(savedKey('Arc'), JSON.stringify(Array(6).fill(fixed(100))));
    expect(values('Arc')).toEqual(Array(7).fill(90));
  });
});
