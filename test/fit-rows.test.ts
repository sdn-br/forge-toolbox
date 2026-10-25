// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FALLBACK_ROWS, rowFit, rowsFitting } from '../src/content/ui/fit-rows';
import { fakeLayout } from './helpers/layout';

describe('rows fitting', () => {
  it('divides the space below the head by the row height, rounding down', () => {
    expect(rowsFitting(200, 24, 20)).toBe(8);
    expect(rowsFitting(203, 24, 20)).toBe(8);
    expect(rowsFitting(203, 24, 18)).toBe(9);
  });

  it('shows at least one row however small the area', () => {
    expect(rowsFitting(30, 24, 20)).toBe(1);
  });

  it('measures nothing without a laid out area or row', () => {
    expect(rowsFitting(0, 24, 20)).toBeUndefined();
    expect(rowsFitting(200, 24, 0)).toBeUndefined();
  });
});

describe('row fit', () => {
  let layout: ReturnType<typeof fakeLayout>;
  beforeEach(() => {
    layout = fakeLayout();
  });
  afterEach(() => layout.restore());

  const area = () => {
    const el = document.createElement('div');
    el.className = 'win-area';
    el.innerHTML =
      '<table><thead><tr><th></th></tr></thead><tbody><tr><td></td></tr><tr><td></td></tr></tbody></table>';
    document.body.append(el);
    return el;
  };

  it('falls back while nothing can be measured', () => {
    const changes: number[] = [];
    const fit = rowFit(() => changes.push(fit.rows()));
    fit.measure(area());
    expect(fit.rows()).toBe(FALLBACK_ROWS);
    expect(changes).toEqual([]);
  });

  it('measures on attach and again when the area is resized, telling only about a change', () => {
    const changes: number[] = [];
    const fit = rowFit(() => changes.push(fit.rows()));
    layout.height(24 + 20 * 5);
    fit.measure(area());
    expect(fit.rows()).toBe(5);
    layout.height(24 + 20 * 7);
    layout.resize();
    layout.resize();
    expect(fit.rows()).toBe(7);
    expect(changes).toEqual([5, 7]);
  });

  it('observes an area once however often it is handed over, and a new area when it replaces the old one', () => {
    const fit = rowFit(() => {});
    layout.rows(5);
    const first = area();
    fit.measure(first);
    fit.measure(first);
    expect(layout.observations()).toBe(1);
    layout.rows(3);
    fit.measure(area());
    expect(layout.observations()).toBe(2);
    expect(fit.rows()).toBe(3);
  });

  it('keeps the last count while the area is gone or has no height', () => {
    const fit = rowFit(() => {});
    layout.height(24 + 20 * 5);
    fit.measure(area());
    fit.measure(undefined);
    expect(fit.rows()).toBe(5);
    layout.height(0);
    layout.resize();
    expect(fit.rows()).toBe(5);
  });
});
