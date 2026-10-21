// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { html } from 'lit-html';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { Box } from '../src/content/ui/box';
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
async function poppedBox(popup: globalThis.Window, ui = new UiState(memoryKv())) {
  (window as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow: async () => popup };
  const box = new Box({ id: 'test', title: () => 'Test', render: () => html`<p>content</p>` }, ui);
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
    (window as { documentPictureInPicture?: unknown }).documentPictureInPicture = {
      requestWindow: async () => popup,
    };
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
