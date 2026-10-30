import { html } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { toggleDef } from '../src/content/core/settings';
import { type SettingsControl, SettingsControls } from '../src/content/core/settings-controls';

const control = (patch: Partial<SettingsControl> = {}): SettingsControl => ({
  group: 'settings.core',
  render: () => html`<p>x</p>`,
  ...patch,
});

describe('settings controls', () => {
  it('lists the controls of a place in the order they registered, other places apart', () => {
    const controls = new SettingsControls();
    const a = controls.add(control());
    const b = controls.add(control({ section: 'settings.data' }));
    const c = controls.add(control());
    const d = controls.add(control({ section: 'settings.data' }));
    const other = controls.add(control({ group: 'gbOwn.title' }));
    expect(controls.at('settings.core')).toEqual([a, c]);
    expect(controls.at('settings.core', 'settings.data')).toEqual([b, d]);
    expect(controls.at('gbOwn.title')).toEqual([other]);
  });

  it('names the sections of a group in the order of their first control', () => {
    const controls = new SettingsControls();
    controls.add(control());
    controls.add(control({ section: 'settings.data' }));
    controls.add(control({ group: 'gbOwn.title', section: 'gbOwn.copySettings' }));
    expect(controls.sections('settings.core')).toEqual(['settings.data']);
  });

  it('knows the defs a control draws itself', () => {
    const mine = toggleDef({ key: 'mine', group: 'settings.core', label: 'settings.menuSize', default: true });
    const free = toggleDef({ key: 'free', group: 'settings.core', label: 'settings.menuSize', default: true });
    const controls = new SettingsControls();
    controls.add(control({ claims: [mine] }));
    expect(controls.claimed(mine)).toBe(true);
    expect(controls.claimed(free)).toBe(false);
  });

  it('resets every control that has something to reset', () => {
    const controls = new SettingsControls();
    const reset = vi.fn();
    controls.add(control({ reset }));
    controls.add(control());
    controls.reset();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('tells the listeners of a redraw request', () => {
    const controls = new SettingsControls();
    const listener = vi.fn();
    controls.onUpdate(listener);
    controls.update();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
