import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { formatNumberList, parseNumberList, Settings, toStep } from '../src/content/core/settings';

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

describe('number settings', () => {
  it('returns the default, keeps stored values within bounds and ignores other types', async () => {
    const { settings } = setup();
    settings.register({
      key: 'a.number',
      group: 'settings.core',
      label: 'settings.recordTraffic',
      default: 90,
      min: -100,
      max: 200,
    });
    expect(settings.number('a.number')).toBe(90);
    await settings.set('a.number', 85.4);
    expect(settings.number('a.number')).toBe(85);
    await settings.set('a.number', 500);
    expect(settings.number('a.number')).toBe(200);
    await settings.set('a.number', 'x');
    expect(settings.number('a.number')).toBe(90);
    expect(settings.get('a.number')).toBe(false);
    expect(settings.number('a.toggle')).toBe(0);
  });
});

describe('list settings', () => {
  it('returns the default, keeps whole numbers within bounds once each, and falls back when nothing is left', async () => {
    const { settings } = setup();
    settings.register({
      key: 'a.list',
      group: 'settings.core',
      label: 'settings.recordTraffic',
      default: [80, 90, 100],
      min: -100,
      max: 200,
    });
    expect(settings.numbers('a.list')).toEqual([80, 90, 100]);
    await settings.set('a.list', [95.4, 90, 500, 90, -20]);
    expect(settings.numbers('a.list')).toEqual([95, 90, -20]);
    await settings.set('a.list', [500]);
    expect(settings.numbers('a.list')).toEqual([80, 90, 100]);
    await settings.set('a.list', 'x');
    expect(settings.numbers('a.list')).toEqual([80, 90, 100]);
    expect(settings.number('a.list')).toBe(0);
    expect(settings.get('a.list')).toBe(false);
  });
});

describe('decimal settings', () => {
  it('rounds numbers and lists to their step without a float tail', async () => {
    const { settings } = setup();
    const bounds = { group: 'settings.core', label: 'settings.recordTraffic', min: -100, max: 200, step: 0.1 } as const;
    settings.register({ key: 'a.number', default: 90, ...bounds });
    settings.register({ key: 'a.list', default: [80, 90, 100], ...bounds });
    await settings.set('a.number', 95.54);
    expect(settings.number('a.number')).toBe(95.5);
    await settings.set('a.list', [95.5, 90.04, 90]);
    expect(settings.numbers('a.list')).toEqual([95.5, 90]);
    expect(toStep(955 * 0.1, 0.1)).toBe(95.5);
  });

  it('reads a typed list parted by semicolons or spaces, with decimal commas or points', () => {
    expect(parseNumberList(' 80; 90 95,5;;100.5 x ')).toEqual([80, 90, 95.5, 100.5]);
    expect(parseNumberList('')).toEqual([]);
    expect(formatNumberList([80, 95.5])).toBe('80; 95,5');
  });
});

describe('text settings', () => {
  it('returns the default until set, trims the value and ignores other types', async () => {
    const { settings } = setup();
    settings.register({
      key: 'a.text',
      group: 'settings.core',
      label: 'settings.recordTraffic',
      default: '',
      text: true,
    });
    expect(settings.text('a.text')).toBe('');
    await settings.set('a.text', '  Michi ');
    expect(settings.text('a.text')).toBe('Michi');
    await settings.set('a.text', 5);
    expect(settings.text('a.text')).toBe('');
    expect(settings.get('a.text')).toBe(false);
  });
});
