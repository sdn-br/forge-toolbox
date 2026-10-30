import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { memoryKv } from '../src/content/core/kv';
import { Settings } from '../src/content/core/settings';
import { createGbOwnState, FACTOR, FACTOR_ARC, viewFlag } from '../src/content/stores/gb-own-state';
import { UiState } from '../src/content/ui/ui-state';

function setup() {
  const bus = createBus();
  const ui = new UiState(memoryKv());
  const settings = new Settings(memoryKv());
  settings.register(FACTOR);
  settings.register(FACTOR_ARC);
  const state = createGbOwnState(bus, ui, settings);
  const factorEvents: unknown[] = [];
  const extEvents: unknown[] = [];
  bus.on('gbOwn.factorsChanged', (e) => factorEvents.push(e));
  bus.on('gbOwn.extChanged', (e) => extEvents.push(e));
  return { ui, state, factorEvents, extEvents };
}

describe('the shared own-share state', () => {
  it('announces every change of the factors with the building', () => {
    const { state, factorEvents } = setup();
    state.setAll('Arc', { value: 100, arc: false });
    state.setPlace('Arc', 2, 80);
    state.save('Arc');
    state.adopt('Arc');
    state.reset('Arc');
    expect(factorEvents).toEqual(Array(5).fill({ def: 'Arc' }));
    // the single factor of the settings drives the standard until it is dropped
    expect(state.state('Arc').choices.map((c) => c.value)).toEqual([100, 80, 100, 100, 100]);
  });

  it('announces a dropped standard for every building', () => {
    const { state, factorEvents, ui } = setup();
    state.setAll('Arc', { value: 100, arc: false });
    state.adopt('Arc');
    expect(ui.pref('gbOwn.factorDefault')).toBeDefined();
    state.dropStandard();
    expect(ui.pref('gbOwn.factorDefault')).toBeUndefined();
    expect(factorEvents.at(-1)).toEqual({});
  });

  it('keeps Ext per building and level and announces them', () => {
    const { state, extEvents } = setup();
    state.setExt('Arc', 135, 2, 500);
    state.setExt('Arc', 135, 1, 100);
    expect(state.ext('Arc', 135)).toEqual([100, 500]);
    expect(state.ext('Arc', 136)).toEqual([]);
    expect(state.ext('Zeus', 135)).toEqual([]);
    expect(state.ext('Arc', undefined)).toEqual([]);
    expect(extEvents).toEqual([
      { def: 'Arc', level: 135 },
      { def: 'Arc', level: 135 },
    ]);
  });

  it('reads the view switches with a fallback', () => {
    const { ui } = setup();
    expect(viewFlag(ui, 'gbOwn.secure', true)).toBe(true);
    ui.savePref('gbOwn.secure', 'false');
    expect(viewFlag(ui, 'gbOwn.secure', true)).toBe(false);
  });
});
