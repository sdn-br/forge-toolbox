import { describe, expect, it } from 'vitest';
import { prefRecord } from '../src/content/ui/ui-state';

const DEFAULTS = { text: '', on: true, toggles: { a: true, b: false } };

describe('prefRecord', () => {
  it('takes each saved field that has the type of its default', () => {
    const saved = JSON.stringify({ text: 'Zeus', on: false, toggles: { a: false, b: true } });
    expect(prefRecord(DEFAULTS, saved)).toEqual({ text: 'Zeus', on: false, toggles: { a: false, b: true } });
  });

  it('keeps the default for a field that is missing or of another type, also inside a record', () => {
    const saved = JSON.stringify({ text: 3, toggles: { a: 'yes' }, extra: 1 });
    expect(prefRecord(DEFAULTS, saved)).toEqual(DEFAULTS);
  });

  it('gives the defaults for nothing saved, broken JSON or no record', () => {
    expect(prefRecord(DEFAULTS, undefined)).toEqual(DEFAULTS);
    expect(prefRecord(DEFAULTS, '{broken')).toEqual(DEFAULTS);
    expect(prefRecord(DEFAULTS, '[1]')).toEqual(DEFAULTS);
    expect(prefRecord(DEFAULTS, '"text"')).toEqual(DEFAULTS);
  });

  it('migrates an older shape before the fields are checked', () => {
    const saved = JSON.stringify({ legacy: false });
    const migrate = (f: Record<string, unknown>) => (f.legacy === false ? { ...f, on: false } : f);
    expect(prefRecord(DEFAULTS, saved, migrate)).toEqual({ ...DEFAULTS, on: false });
    expect(prefRecord(DEFAULTS, '{}', migrate)).toEqual(DEFAULTS);
  });
});
