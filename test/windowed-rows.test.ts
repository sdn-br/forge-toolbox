// @vitest-environment happy-dom
import { html, render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { clampTop, rowsIn, rowWindow, windowedRows } from '../src/content/ui/windowed-rows';

describe('row window', () => {
  it('clamps the offset into the list', () => {
    expect(clampTop(3, 10, 6)).toBe(3);
    expect(clampTop(9, 10, 6)).toBe(4);
    expect(clampTop(-2, 10, 6)).toBe(0);
    expect(clampTop(5, 4, 6)).toBe(0);
  });

  it('counts the rows hidden above and below', () => {
    expect(rowWindow(2, 10, 6)).toEqual({ top: 2, above: 2, below: 2 });
    expect(rowWindow(9, 10, 6)).toEqual({ top: 4, above: 4, below: 0 });
    expect(rowWindow(0, 3, 6)).toEqual({ top: 0, above: 0, below: 0 });
  });
});

describe('windowedRows template', () => {
  const draw = (window: ReturnType<typeof rowWindow>, scroll: (rows: number) => void) => {
    const host = document.createElement('div');
    render(windowedRows({ cls: 'mine', table: html`<table></table>`, window, scroll }), host);
    return host;
  };

  it('shows greyed buttons and no line when everything fits', () => {
    const host = draw(rowWindow(0, 3, 6), () => {});
    // the buttons keep their room, greyed
    expect([...host.querySelectorAll('.win-nav button')].map((b) => b.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
    ]);
    expect(host.querySelector('.win-hidden')).toBeNull();
    expect(host.querySelector('.win-scroll.mine .win-area table')).not.toBeNull();
  });

  it('greys the buttons at their ends, steps one row and says what is hidden', () => {
    const steps: number[] = [];
    const host = draw(rowWindow(0, 10, 6), (rows) => steps.push(rows));
    const [up, down] = [...host.querySelectorAll<HTMLElement>('.win-nav button')];
    expect(up?.getAttribute('aria-disabled')).toBe('true');
    expect(down?.getAttribute('aria-disabled')).toBe('false');
    up?.click();
    down?.click();
    expect(steps).toEqual([1]);
    expect(host.querySelector('.win-hidden')?.textContent?.trim()).toBe('noch 4 weitere unten');
  });

  it('lets the wheel pass where there is nothing to scroll', () => {
    const steps: number[] = [];
    const host = draw(rowWindow(0, 10, 6), (rows) => steps.push(rows));
    const wheel = (deltaY: number) => {
      const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
      host.querySelector('.win-scroll')?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(wheel(-100)).toBe(false);
    expect(wheel(100)).toBe(true);
    expect(steps).toEqual([1]);
  });
});

describe('rows in the window', () => {
  it('cuts the rows of the window out of the list', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(rowsIn(rows, rowWindow(2, 8, 3))).toEqual([3, 4, 5]);
    expect(rowsIn(rows, rowWindow(9, 8, 3))).toEqual([6, 7, 8]);
    expect(rowsIn(rows, rowWindow(0, 8, 20))).toEqual(rows);
  });
});

describe('measure hook', () => {
  it('hands the table area to the callback', () => {
    const seen: (Element | undefined)[] = [];
    const host = document.createElement('div');
    render(
      windowedRows({
        cls: 'x',
        table: html`<table></table>`,
        window: rowWindow(0, 1, 6),
        scroll: () => {},
        measure: (a) => seen.push(a),
      }),
      host,
    );
    expect(seen).toEqual([host.querySelector('.win-area')]);
  });
});
