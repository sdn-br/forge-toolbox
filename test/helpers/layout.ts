import { vi } from 'vitest';

/** happy-dom lays nothing out: this gives the table area a height and every head and row a fixed one, and lets a test
 * resize the area the way the browser's ResizeObserver would report it */
export function fakeLayout({ head = 24, row = 20 } = {}) {
  let area = 0;
  const observers = new Set<() => void>();
  let observed = 0;
  class FakeResizeObserver {
    constructor(private callback: () => void) {}
    observe(target: unknown) {
      // as the browser: observing nothing is an error
      if (!(target instanceof Element)) throw new TypeError('not an element');
      observed++;
      observers.add(this.callback);
    }
    unobserve() {
      observers.delete(this.callback);
    }
    disconnect() {
      observers.delete(this.callback);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  const heights = (el: HTMLElement) => (el.tagName === 'THEAD' ? head : el.tagName === 'TR' ? row : 0);
  const original = {
    client: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    offset: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('win-area') ? area : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return heights(this);
    },
  });
  return {
    /** the height of the table area; rows fitting are what remains below the head */
    height(pixels: number) {
      area = pixels;
    },
    /** the area holds the head and this many rows */
    rows(count: number) {
      area = head + row * count;
    },
    /** how many times an area was handed to an observer */
    observations: () => observed,
    /** the browser reports a new size of the area */
    resize() {
      for (const callback of [...observers]) callback();
    },
    restore() {
      vi.unstubAllGlobals();
      for (const [key, d] of [
        ['clientHeight', original.client],
        ['offsetHeight', original.offset],
      ] as const) {
        if (d) Object.defineProperty(HTMLElement.prototype, key, d);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
    },
  };
}
