// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { html } from 'lit-html';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { Box, type BoxOptions } from '../src/content/ui/box';
import { UiState } from '../src/content/ui/ui-state';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** a second window standing in for the picture-in-picture window; closing it fires pagehide as a browser does */
function popupWindow() {
  const win = new Window() as unknown as globalThis.Window;
  win.close = () => queueMicrotask(() => win.dispatchEvent(new Event('pagehide')));
  return win;
}

const button = (host: Element | null, label: string) =>
  [...(host?.shadowRoot?.querySelectorAll('header button') ?? [])].find((b) => b.textContent === label) as HTMLElement;

/** an open box in the game, popped out into `popup` */
async function poppedBox(popup: globalThis.Window, options: Partial<BoxOptions> = {}) {
  (window as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow: async () => popup };
  const box = new Box(
    { id: 'test', title: () => 'Test', render: () => html`<p>content</p>`, ...options },
    new UiState(memoryKv()),
  );
  box.open();
  await tick();
  button(document.querySelector('[data-forge-toolbox=test]'), '⧉').click();
  await tick();
  return box;
}

afterEach(() => {
  for (const el of document.querySelectorAll('[data-forge-toolbox]')) el.remove();
  delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

describe('box pop-out', () => {
  it('moves the box out of the game into the pop-out window', async () => {
    const popup = popupWindow();
    const box = await poppedBox(popup);
    expect(document.querySelector('[data-forge-toolbox=test]')).toBeNull();
    expect(popup.document.querySelector('[data-forge-toolbox=test]')).not.toBeNull();
    box.update();
    await tick();
    expect(document.querySelector('[data-forge-toolbox=test]')).toBeNull();
  });

  it('docks the box again when the pop-out window closes', async () => {
    const popup = popupWindow();
    const box = await poppedBox(popup);
    popup.close();
    await tick();
    expect(document.querySelector('[data-forge-toolbox=test]')).not.toBeNull();
    expect(box.isOpen).toBe(true);
    await tick();
    expect(document.querySelector('[data-forge-toolbox=test]')?.shadowRoot?.querySelector('.box.popped')).toBeNull();
  });

  it('stays closed when closed inside the pop-out, although the window reports pagehide afterwards', async () => {
    const popup = popupWindow();
    const box = await poppedBox(popup);
    button(popup.document.querySelector('[data-forge-toolbox=test]'), '✕').click();
    await tick();
    await tick();
    expect(box.isOpen).toBe(false);
    expect(document.querySelector('[data-forge-toolbox=test]')).toBeNull();
  });
});

/** an open box at the given place and size; happy-dom lays nothing out, so the frame reports it */
async function shownBox(
  ui = new UiState(memoryKv()),
  id = 'sized',
  at = { left: 100, top: 50, width: 320, height: 200 },
) {
  const box = new Box({ id, title: () => 'Sized', width: 320, render: () => html`<p>content</p>` }, ui);
  box.open();
  await tick();
  const host = document.querySelector(`[data-forge-toolbox=${id}]`) as HTMLElement;
  const frame = () => host.shadowRoot?.querySelector('.box') as HTMLElement;
  frame().getBoundingClientRect = () => ({ ...at, right: at.left + at.width, bottom: at.top + at.height }) as DOMRect;
  const handle = () => host.shadowRoot?.querySelector('.resize-handle') as HTMLElement | null;
  const pointer = (type: string, x: number, y: number) =>
    handle()?.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
  /** drags the handle from the bottom right corner by dx, dy */
  const resize = async (dx: number, dy: number) => {
    const x = at.left + at.width;
    const y = at.top + at.height;
    pointer('pointerdown', x, y);
    pointer('pointermove', x + dx, y + dy);
    pointer('pointerup', x + dx, y + dy);
    await tick();
  };
  return { box, host, frame, handle, resize, ui };
}

describe('box resize', () => {
  it('opens at the configured width with a height from its content when never resized', async () => {
    const { frame, handle } = await shownBox();
    expect(frame().style.width).toBe('320px');
    expect(frame().style.height).toBe('');
    expect(frame().classList.contains('sized')).toBe(false);
    expect(handle()).not.toBeNull();
  });

  it('resizes from the handle, saves the size and restores it on the next open', async () => {
    const { resize, frame, ui } = await shownBox();
    await resize(180, 100);
    expect(ui.box('sized')).toMatchObject({ width: 500, height: 300 });
    expect(frame().style.width).toBe('500px');
    expect(frame().style.height).toBe('300px');
    expect(frame().classList.contains('sized')).toBe(true);

    for (const el of document.querySelectorAll('[data-forge-toolbox]')) el.remove();
    const again = await shownBox(ui);
    expect(again.frame().style.width).toBe('500px');
    expect(again.frame().style.height).toBe('300px');
    expect(again.frame().classList.contains('sized')).toBe(true);
  });

  it('keeps a minimum size', async () => {
    const { resize, ui } = await shownBox();
    await resize(-1000, -1000);
    expect(ui.box('sized')).toMatchObject({ width: 260, height: 150 });
  });

  it('keeps the box inside the viewport', async () => {
    const { resize, ui } = await shownBox();
    await resize(5000, 5000);
    expect(ui.box('sized')).toMatchObject({ width: window.innerWidth - 100, height: window.innerHeight - 50 });
  });

  it('goes back to the default size on a double click of the handle', async () => {
    const { resize, handle, frame, ui } = await shownBox();
    await resize(180, 100);
    handle()?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    expect(ui.box('sized').width).toBeUndefined();
    expect(ui.box('sized').height).toBeUndefined();
    expect(frame().style.width).toBe('320px');
    expect(frame().style.height).toBe('');
  });

  it('offers no handle and no saved height while minimized', async () => {
    const ui = new UiState(memoryKv());
    ui.saveBox('sized', { width: 400, height: 300, minimized: true });
    const { frame, handle } = await shownBox(ui);
    expect(handle()).toBeNull();
    expect(frame().style.width).toBe('400px');
    expect(frame().style.height).toBe('');
  });

  it('offers no handle when popped out', async () => {
    const popup = popupWindow();
    await poppedBox(popup);
    const host = popup.document.querySelector('[data-forge-toolbox=test]');
    expect(host?.shadowRoot?.querySelector('.box.popped')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('.resize-handle')).toBeNull();
  });
});

describe('box content that fills', () => {
  const mapLike = html`<div class="city-map"><div class="map-frame"></div></div>`;
  const frameStyle = (host: Element | null) =>
    getComputedStyle(host?.shadowRoot?.querySelector('.map-frame') as HTMLElement);

  it('lets a map keep its default height in a box without a saved height', async () => {
    new Box({ id: 'map', title: () => 'Map', fill: true, render: () => mapLike }, new UiState(memoryKv())).open();
    await tick();
    const host = document.querySelector('[data-forge-toolbox=map]');
    expect(host?.shadowRoot?.querySelector('.box.tall')).toBeNull();
    expect(Number.parseFloat(frameStyle(host).height)).toBeCloseTo(window.innerHeight * 0.55);
  });

  it('lets a map fill a box with a saved height', async () => {
    const ui = new UiState(memoryKv());
    ui.saveBox('map', { width: 600, height: 500 });
    new Box({ id: 'map', title: () => 'Map', fill: true, render: () => mapLike }, ui).open();
    await tick();
    const host = document.querySelector('[data-forge-toolbox=map]');
    expect(host?.shadowRoot?.querySelector('.box.tall .body.fill')).not.toBeNull();
    expect(frameStyle(host).flexGrow).toBe('1');
    expect(frameStyle(host).height).toBe('auto');
  });

  it('lets a map fill the pop-out window', async () => {
    const popup = popupWindow();
    await poppedBox(popup, { fill: true, render: () => mapLike });
    const host = popup.document.querySelector('[data-forge-toolbox=test]');
    expect(host?.shadowRoot?.querySelector('.box.popped .body.fill')).not.toBeNull();
    const style = popup.getComputedStyle(host?.shadowRoot?.querySelector('.map-frame') as HTMLElement);
    expect(style.flexGrow).toBe('1');
    expect(style.height).toBe('auto');
  });
});
