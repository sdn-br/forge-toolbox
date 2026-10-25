// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { html } from 'lit-html';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { t } from '../src/content/core/texts';
import { Box, type BoxOptions, largeDefaultSize } from '../src/content/ui/box';
import { UiState } from '../src/content/ui/ui-state';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** a second window standing in for the picture-in-picture window; closing it fires pagehide as a browser does */
function popupWindow() {
  const win = new Window() as unknown as globalThis.Window;
  win.close = () => queueMicrotask(() => win.dispatchEvent(new Event('pagehide')));
  return win;
}

const button = (host: Element | null, label: string) =>
  [...(host?.shadowRoot?.querySelectorAll('header button') ?? [])].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  ) as HTMLElement;

/** an open box in the game, popped out into `popup` */
async function poppedBox(popup: globalThis.Window, options: Partial<BoxOptions> = {}) {
  (window as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow: async () => popup };
  const box = new Box(
    { id: 'test', title: () => 'Test', render: () => html`<p>content</p>`, ...options },
    new UiState(memoryKv()),
  );
  box.open();
  await tick();
  button(document.querySelector('[data-forge-toolbox=test]'), t('box.popout')).click();
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
    button(popup.document.querySelector('[data-forge-toolbox=test]'), t('box.close')).click();
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
  options: Partial<BoxOptions> = {},
) {
  const box = new Box(
    { id, title: () => 'Sized', width: 320, resizable: true, render: () => html`<p>content</p>`, ...options },
    ui,
  );
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

  it('keeps a configured width above the width cap of the fixed boxes', async () => {
    const { frame } = await shownBox();
    // the cap sits on the class of the fixed boxes
    expect(frame().classList.contains('capped')).toBe(false);
    expect(frame().style.maxWidth).toBe('');
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

  it('keeps the minimum height of its option when dragged smaller and when a smaller one was saved', async () => {
    const { resize, ui } = await shownBox(undefined, 'sized', undefined, { minHeight: 240 });
    await resize(-1000, -1000);
    expect(ui.box('sized')).toMatchObject({ width: 260, height: 240 });
    for (const el of document.querySelectorAll('[data-forge-toolbox]')) el.remove();
    const saved = new UiState(memoryKv());
    saved.saveBox('sized', { width: 400, height: 160 });
    const again = await shownBox(saved, 'sized', undefined, { minHeight: 240 });
    expect(again.frame().style.height).toBe('240px');
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

describe('box without the resize handle', () => {
  const frame = (id: string) =>
    document.querySelector(`[data-forge-toolbox=${id}]`)?.shadowRoot?.querySelector('.box') as HTMLElement;
  const open = async (options: Partial<BoxOptions>, ui = new UiState(memoryKv())) => {
    new Box(
      { id: 'fixed', title: () => 'Fixed', width: 400, render: () => html`<p>content</p>`, ...options },
      ui,
    ).open();
    await tick();
    return frame('fixed');
  };

  it('has no handle, a fixed width and a height from its content, capped at 70 % of the window', async () => {
    const box = await open({});
    expect(box.querySelector('.resize-handle')).toBeNull();
    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('');
    expect(box.style.maxHeight).toBe(`${Math.round(window.innerHeight * 0.7)}px`);
    expect(box.classList.contains('capped')).toBe(true);
  });

  it('takes another max height from its option', async () => {
    const box = await open({ maxHeight: 0.8 });
    expect(box.style.maxHeight).toBe(`${Math.round(window.innerHeight * 0.8)}px`);
  });

  it('ignores a remembered size but keeps the remembered position', async () => {
    const ui = new UiState(memoryKv());
    ui.saveBox('fixed', { x: 30, y: 40, width: 600, height: 500 });
    const box = await open({}, ui);
    expect(box.style.width).toBe('400px');
    expect(box.style.height).toBe('');
    expect(box.style.left).toBe('30px');
    expect(box.style.top).toBe('40px');
    expect(box.classList.contains('sized')).toBe(false);
  });
});

describe('box default size', () => {
  const open = async (ui = new UiState(memoryKv())) => {
    new Box(
      {
        id: 'big',
        title: () => 'Big',
        resizable: true,
        fill: true,
        defaultSize: largeDefaultSize,
        render: () => html`<p>x</p>`,
      },
      ui,
    ).open();
    await tick();
    return document.querySelector('[data-forge-toolbox=big]')?.shadowRoot?.querySelector('.box') as HTMLElement;
  };
  const resizeWindow = (width: number, height: number) => {
    window.innerWidth = width;
    window.innerHeight = height;
  };

  it('is 70 % of the window without a remembered size', async () => {
    resizeWindow(1000, 700);
    const box = await open();
    expect(box.style.width).toBe('700px');
    expect(box.style.height).toBe('490px');
    expect(box.classList.contains('tall')).toBe(true);
    expect(box.querySelector('.resize-handle')).not.toBeNull();
  });

  it('is at most 1100 x 850 pixels', async () => {
    resizeWindow(3000, 2000);
    const box = await open();
    expect(box.style.width).toBe('1100px');
    expect(box.style.height).toBe('850px');
  });

  it('gives way to a remembered size', async () => {
    resizeWindow(1000, 700);
    const ui = new UiState(memoryKv());
    ui.saveBox('big', { width: 500, height: 300 });
    const box = await open(ui);
    expect(box.style.width).toBe('500px');
    expect(box.style.height).toBe('300px');
  });
});

describe('box content that fills', () => {
  const mapLike = html`<div class="city-map"><div class="map-frame"></div></div>`;
  const frameStyle = (host: Element | null) =>
    getComputedStyle(host?.shadowRoot?.querySelector('.map-frame') as HTMLElement);

  it('lets a map keep its default height in a box without a saved height', async () => {
    new Box(
      { id: 'map', title: () => 'Map', resizable: true, fill: true, render: () => mapLike },
      new UiState(memoryKv()),
    ).open();
    await tick();
    const host = document.querySelector('[data-forge-toolbox=map]');
    expect(host?.shadowRoot?.querySelector('.box.tall')).toBeNull();
    expect(Number.parseFloat(frameStyle(host).height)).toBeCloseTo(window.innerHeight * 0.55);
  });

  it('lets a map fill a box with a saved height', async () => {
    const ui = new UiState(memoryKv());
    ui.saveBox('map', { width: 600, height: 500 });
    new Box({ id: 'map', title: () => 'Map', resizable: true, fill: true, render: () => mapLike }, ui).open();
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

describe('box settings button', () => {
  const open = async (options: Partial<BoxOptions>, openSettings?: (group: string) => void) => {
    const box = new Box(
      { id: 'test', title: () => 'Test', render: () => html`<p>content</p>`, ...options },
      new UiState(memoryKv()),
      openSettings,
    );
    box.open();
    await tick();
    return box;
  };
  const host = () => document.querySelector('[data-forge-toolbox=test]');

  it('opens the settings at the group of the feature', async () => {
    const asked: string[] = [];
    await open({ settings: 'gbCalc.title' }, (group) => asked.push(group));
    button(host(), 'Einstellungen').click();
    expect(asked).toEqual(['gbCalc.title']);
    expect(button(host(), 'Einstellungen').querySelector('svg')).not.toBeNull();
  });

  it('shows no settings button for a box without settings', async () => {
    await open({}, () => {});
    expect(button(host(), 'Einstellungen')).toBeUndefined();
  });
});
