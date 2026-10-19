import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { Settings } from '../src/content/core/settings';

function setup(stored?: Record<string, unknown>) {
  const kv = memoryKv(stored ? { settings: stored } : {});
  const settings = new Settings(kv);
  settings.register({ key: 'a.toggle', group: 'settings.core', label: 'settings.recordTraffic', default: true });
  settings.register({
    key: 'a.choice',
    group: 'settings.core',
    label: 'settings.recordTraffic',
    default: 'forever',
    choices: [
      { value: 'forever', label: 'pvp.keepForever' },
      { value: '30', label: 'pvp.keep30' },
    ],
  });
  return { kv, settings };
}

describe('Settings', () => {
  it('keeps toggles working next to choices', async () => {
    const { settings } = setup();
    expect(settings.get('a.toggle')).toBe(true);
    await settings.set('a.toggle', false);
    expect(settings.get('a.toggle')).toBe(false);
    expect(settings.get('a.choice')).toBe(false);
  });

  it('returns the default choice until one is set, then stores it', async () => {
    const { settings, kv } = setup();
    const changed: string[] = [];
    settings.onChange((key) => changed.push(key));
    expect(settings.choice('a.choice')).toBe('forever');
    await settings.set('a.choice', '30');
    expect(settings.choice('a.choice')).toBe('30');
    expect(changed).toEqual(['a.choice']);
    expect(await kv.get('settings')).toEqual({ 'a.choice': '30' });
  });

  it('falls back to the default when the stored choice is unknown', async () => {
    const { settings } = setup({ 'a.choice': '7' });
    await settings.load();
    expect(settings.choice('a.choice')).toBe('forever');
    expect(settings.choice('a.toggle')).toBe('');
  });
});
