import { describe, expect, it } from 'vitest';
import { MARKER_TAG, MAX_MARKERS, parseMarkerCommand, parseMarkerEvent } from '../src/shared/marker-protocol';

const spot = { id: 7, x: 3, y: 4, width: 2, length: 5 };
const show = (spots: unknown, change: Record<string, unknown> = {}) => ({
  tag: MARKER_TAG,
  from: 'content',
  type: 'show',
  seq: 1,
  clearLabel: 'Markierungen entfernen',
  spots,
  ...change,
});
const removed = (ids: unknown, change: Record<string, unknown> = {}) => ({
  tag: MARKER_TAG,
  from: 'marker',
  type: 'removed',
  seq: 1,
  ids,
  ...change,
});

describe('parseMarkerCommand (content to page)', () => {
  it('takes show with valid spots and hide', () => {
    expect(parseMarkerCommand(show([spot]))).toEqual(show([spot]));
    expect(parseMarkerCommand(show([], { seq: 0 }))).toEqual(show([], { seq: 0 }));
    expect(parseMarkerCommand({ tag: MARKER_TAG, from: 'content', type: 'hide' })).toEqual({
      tag: MARKER_TAG,
      from: 'content',
      type: 'hide',
    });
  });

  it('keeps only the known fields of a spot and of the command', () => {
    const parsed = parseMarkerCommand(show([{ ...spot, extra: '<img>' }], { html: '<img>' }));
    expect(parsed).toEqual(show([spot]));
  });

  it('drops foreign, forged and malformed commands', () => {
    expect(parseMarkerCommand(null)).toBeNull();
    expect(parseMarkerCommand('show')).toBeNull();
    expect(parseMarkerCommand(show([], { tag: 'forge-toolbox' }))).toBeNull();
    expect(parseMarkerCommand(show([], { from: 'marker' }))).toBeNull();
    expect(parseMarkerCommand(show([], { type: 'eval' }))).toBeNull();
    expect(parseMarkerCommand(show('nope'))).toBeNull();
    expect(parseMarkerCommand(show([], { seq: -1 }))).toBeNull();
    expect(parseMarkerCommand(show([], { seq: 1.5 }))).toBeNull();
    expect(parseMarkerCommand(show([], { clearLabel: 3 }))).toBeNull();
    expect(parseMarkerCommand(show([], { clearLabel: 'x'.repeat(101) }))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, id: '7' }]))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, x: '1' }]))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, width: 0 }]))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, length: 51 }]))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, y: Number.NaN }]))).toBeNull();
    expect(parseMarkerCommand(show([{ ...spot, x: 1e9 }]))).toBeNull();
    expect(parseMarkerCommand(show([spot, null]))).toBeNull();
    expect(parseMarkerCommand(show(Array.from({ length: MAX_MARKERS + 1 }, () => spot)))).toBeNull();
  });
});

describe('parseMarkerEvent (page to content)', () => {
  it('takes the ids the page removed, as a copy', () => {
    const ids = [7, 8];
    const parsed = parseMarkerEvent(removed(ids));
    expect(parsed).toEqual(removed([7, 8]));
    ids.push(9);
    expect(parsed?.ids).toEqual([7, 8]);
  });

  it('drops foreign, forged and malformed events', () => {
    expect(parseMarkerEvent(undefined)).toBeNull();
    expect(parseMarkerEvent(removed([1], { from: 'content' }))).toBeNull();
    expect(parseMarkerEvent(removed([1], { tag: 'forge-toolbox' }))).toBeNull();
    expect(parseMarkerEvent(removed([1], { type: 'show' }))).toBeNull();
    expect(parseMarkerEvent(removed([1], { seq: 'x' }))).toBeNull();
    expect(parseMarkerEvent(removed('1'))).toBeNull();
    expect(parseMarkerEvent(removed([1, -2]))).toBeNull();
    expect(parseMarkerEvent(removed([1.5]))).toBeNull();
    expect(parseMarkerEvent(removed(Array.from({ length: MAX_MARKERS + 1 }, (_, i) => i)))).toBeNull();
  });
});
