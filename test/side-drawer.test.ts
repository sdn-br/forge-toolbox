// @vitest-environment happy-dom
import { html, render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { sideDrawer } from '../src/content/ui/side-drawer';

/** a box at `left` pixels from the screen edge with a first and a second drawer */
function draw(left: number, open: { first: boolean; second: boolean }) {
  const box = document.createElement('div');
  box.className = 'box';
  box.getBoundingClientRect = () => ({ left }) as DOMRect;
  const drawer = (cls: string, isOpen: boolean, secondary: boolean) =>
    sideDrawer({
      cls,
      open: isOpen,
      label: cls,
      tip: cls,
      toggle: () => {},
      panel: html`<p>${cls}</p>`,
      width: 300,
      ...(secondary && { secondary }),
    });
  const view = () => html`${drawer('first', open.first, false)}${drawer('second', open.second, true)}`;
  // the sides are set once the drawers sit in the box, as the box renders again on every update
  render(view(), box);
  render(view(), box);
  const el = (cls: string) => box.querySelector(`.side-drawer.${cls}`) as HTMLElement;
  return { first: el('first'), second: el('second') };
}

describe('two side drawers of a box', () => {
  it('puts the first one left and the second one right, as usual away from the left edge', () => {
    const { first, second } = draw(800, { first: false, second: false });
    expect(first.dataset.side).toBe('left');
    expect(second.dataset.side).toBe('right');
  });

  it('swaps the sides of both at the left edge of the screen', () => {
    const { first, second } = draw(10, { first: false, second: false });
    expect(first.dataset.side).toBe('right');
    expect(second.dataset.side).toBe('left');
  });

  it('opens each one on its own', () => {
    const { first, second } = draw(800, { first: true, second: false });
    expect(first.querySelector('.side-panel')).not.toBeNull();
    expect(second.querySelector('.side-panel')).toBeNull();
    const both = draw(800, { first: true, second: true });
    expect(both.first.classList.contains('open') && both.second.classList.contains('open')).toBe(true);
    expect(both.second.classList.contains('secondary')).toBe(true);
    expect(both.first.classList.contains('secondary')).toBe(false);
  });
});
