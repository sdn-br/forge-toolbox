// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltip, TIP_DELAY } from '../src/content/ui/tooltip';

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<button data-tip="Fixieren">a</button><span data-tip="Zwei\nZeilen">b</span><p>c</p>';
  installTooltip(root);
  const tip = root.querySelector('.tip') as HTMLElement;
  const el = (selector: string) => root.querySelector(selector) as HTMLElement;
  const move = (target: Element, x = 10, y = 10) =>
    target.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, composed: true }));
  return { host, root, tip, el, move };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('tooltip', () => {
  it('shows the text of the element under the pointer after a pause, next to the pointer', () => {
    const { tip, el, move } = mount();
    move(el('button'), 30, 40);
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Fixieren');
    expect(tip.style.left).toBe('44px');
    expect(tip.style.top).toBe('54px');
  });

  it('switches to the next element at once while one shows, and hides over an element without a tip', () => {
    const { tip, el, move } = mount();
    move(el('button'));
    vi.advanceTimersByTime(TIP_DELAY);
    move(el('span'));
    expect(tip.textContent).toBe('Zwei\nZeilen');
    move(el('p'));
    expect(tip.hidden).toBe(true);
  });

  it('never shows when the pointer leaves before the pause ends', () => {
    const { tip, el, move } = mount();
    move(el('button'));
    move(el('p'));
    vi.advanceTimersByTime(TIP_DELAY);
    expect(tip.hidden).toBe(true);
  });

  it('shows at once for an instant element and follows its changing text', () => {
    const { root, tip, move } = mount();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-tip-instant', '');
    canvas.dataset.tip = 'Rathaus';
    root.append(canvas);
    move(canvas, 5, 5);
    expect(tip.textContent).toBe('Rathaus');
    canvas.dataset.tip = 'Straße';
    move(canvas, 50, 5);
    expect(tip.textContent).toBe('Straße');
    expect(tip.style.left).toBe('64px');
    canvas.dataset.tip = '';
    move(canvas, 60, 5);
    expect(tip.hidden).toBe(true);
  });

  it('hides on a click, so a changed label does not linger', () => {
    const { tip, el, move } = mount();
    move(el('button'));
    vi.advanceTimersByTime(TIP_DELAY);
    el('button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(tip.hidden).toBe(true);
  });

  it('opens to the left and above the pointer near the edges of the window', () => {
    const { tip, el, move } = mount();
    tip.getBoundingClientRect = () => ({ width: 100, height: 30 }) as DOMRect;
    move(el('button'), window.innerWidth - 20, window.innerHeight - 10);
    vi.advanceTimersByTime(TIP_DELAY);
    expect(tip.style.left).toBe(`${window.innerWidth - 20 - 14 - 100}px`);
    expect(tip.style.top).toBe(`${window.innerHeight - 10 - 14 - 30}px`);
  });
});
