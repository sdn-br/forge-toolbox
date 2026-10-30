import { describe, expect, expectTypeOf, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import {
  choiceDef,
  formatNumberList,
  listDef,
  numberDef,
  parseNumberList,
  type Setting,
  Settings,
  textDef,
  toggleDef,
  toStep,
} from '../src/content/core/settings';

const base = { group: 'settings.core', label: 'settings.recordTraffic' } as const;
const TOGGLE = toggleDef({ key: 'a.toggle', ...base, default: true });
const CHOICE = choiceDef({
  key: 'a.choice',
  ...base,
  default: 'forever',
  choices: [
    { value: 'forever', label: 'pvp.keepForever' },
    { value: '30', label: 'pvp.keep30' },
  ],
});
const NUMBER = numberDef({ key: 'a.number', ...base, default: 90, min: -100, max: 200 });
const LIST = listDef({ key: 'a.list', ...base, default: [80, 90, 100], min: -100, max: 200 });
const TEXT = textDef({ key: 'a.text', ...base, default: '' });

function setup(stored?: Record<string, unknown>) {
  const kv = memoryKv(stored ? { settings: stored } : {});
  const settings = new Settings(kv);
  return { kv, settings };
}

describe('Settings', () => {
  it('hands the same handle out from register and of', () => {
    const { settings } = setup();
    const handle = settings.register(TOGGLE);
    expect(handle.def).toBe(TOGGLE);
    expect(settings.of(TOGGLE)).toBe(handle);
    expect(settings.defs).toEqual([TOGGLE]);
  });

  it('throws for a def that was never registered', () => {
    const { settings } = setup();
    settings.register(TOGGLE);
    expect(() => settings.of(CHOICE)).toThrow('a.choice');
  });

  it('reads and writes a toggle through its handle', async () => {
    const { settings } = setup();
    const toggle = settings.register(TOGGLE);
    expect(toggle.get()).toBe(true);
    await toggle.set(false);
    expect(toggle.get()).toBe(false);
  });

  it('gives the default for a stored value of another type', async () => {
    const { settings } = setup({ 'a.toggle': 'yes' });
    const toggle = settings.register(TOGGLE);
    await settings.load();
    expect(toggle.get()).toBe(true);
  });

  it('returns the default choice until one is set, then stores it', async () => {
    const { settings, kv } = setup();
    const choice = settings.register(CHOICE);
    const changed: string[] = [];
    settings.onChange((key) => changed.push(key));
    expect(choice.get()).toBe('forever');
    await choice.set('30');
    expect(choice.get()).toBe('30');
    expect(changed).toEqual(['a.choice']);
    expect(await kv.get('settings')).toEqual({ 'a.choice': '30' });
  });

  it('falls back to the default when the stored choice is unknown', async () => {
    const { settings } = setup({ 'a.choice': '7' });
    const choice = settings.register(CHOICE);
    await settings.load();
    expect(choice.get()).toBe('forever');
  });

  it('gives a choice handle the literal union of its values', () => {
    const { settings } = setup();
    const choice = settings.register(CHOICE);
    expectTypeOf(choice).toEqualTypeOf<Setting<'forever' | '30'>>();
    expectTypeOf(settings.register(TOGGLE)).toEqualTypeOf<Setting<boolean>>();
    expectTypeOf(settings.register(LIST)).toEqualTypeOf<Setting<number[]>>();
  });

  it('tells a handle listener only of its own key, and the global one of all', async () => {
    const { settings } = setup();
    const toggle = settings.register(TOGGLE);
    const choice = settings.register(CHOICE);
    const own: string[] = [];
    const all: string[] = [];
    const off = toggle.onChange(() => own.push('toggle'));
    settings.onChange((key) => all.push(key));
    await choice.set('30');
    await toggle.set(false);
    expect(own).toEqual(['toggle']);
    expect(all).toEqual(['a.choice', 'a.toggle']);
    off();
    await toggle.set(true);
    expect(own).toEqual(['toggle']);
  });
});

describe('number settings', () => {
  it('returns the default, keeps stored values within bounds and ignores other types', async () => {
    const { settings } = setup();
    const number = settings.register(NUMBER);
    expect(number.get()).toBe(90);
    await number.set(85.4);
    expect(number.get()).toBe(85);
    await number.set(500);
    expect(number.get()).toBe(200);
    await settings.replace({ 'a.number': 'x' });
    expect(number.get()).toBe(90);
  });
});

describe('list settings', () => {
  it('returns the default, keeps whole numbers within bounds once each, and falls back when nothing is left', async () => {
    const { settings } = setup();
    const list = settings.register(LIST);
    expect(list.get()).toEqual([80, 90, 100]);
    await list.set([95.4, 90, 500, 90, -20]);
    expect(list.get()).toEqual([95, 90, -20]);
    await list.set([500]);
    expect(list.get()).toEqual([80, 90, 100]);
    await settings.replace({ 'a.list': 'x' });
    expect(list.get()).toEqual([80, 90, 100]);
  });
});

describe('decimal settings', () => {
  it('rounds numbers and lists to their step without a float tail', async () => {
    const { settings } = setup();
    const bounds = { ...base, min: -100, max: 200, step: 0.1 };
    const number = settings.register(numberDef({ key: 'b.number', default: 90, ...bounds }));
    const list = settings.register(listDef({ key: 'b.list', default: [80, 90, 100], ...bounds }));
    await number.set(95.54);
    expect(number.get()).toBe(95.5);
    await list.set([95.5, 90.04, 90]);
    expect(list.get()).toEqual([95.5, 90]);
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
    const text = settings.register(TEXT);
    expect(text.get()).toBe('');
    await text.set('  Michi ');
    expect(text.get()).toBe('Michi');
    await settings.replace({ 'a.text': 5 });
    expect(text.get()).toBe('');
  });
});
