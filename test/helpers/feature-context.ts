import { render } from 'lit-html';
import type { FeatureContext } from '../../src/content/core/feature';
import { memoryKv } from '../../src/content/core/kv';
import { Recorder } from '../../src/content/core/recorder';
import { Settings } from '../../src/content/core/settings';
import type { Box, BoxOptions } from '../../src/content/ui/box';
import type { Menu, MenuItem } from '../../src/content/ui/menu';
import { UiState } from '../../src/content/ui/ui-state';
import { type TestStoresOptions, testStores } from './stores';

/** A box that records every update as the text it would show, instead of drawing a window. */
export function recordingBox(options: BoxOptions) {
  const container = document.createElement('div');
  const updates: string[] = [];
  let open = false;
  const box = {
    get isOpen() {
      return open;
    },
    open() {
      open = true;
      box.update();
    },
    close() {
      open = false;
    },
    toggle() {
      if (open) box.close();
      else box.open();
    },
    update() {
      if (!open) return;
      render(options.render(), container);
      updates.push(container.textContent ?? '');
    },
  };
  return {
    box: box as unknown as Box,
    updates,
    /** the drawn content, for inputs and lists */
    root: container,
    /** the title the box shows right now */
    get title() {
      return options.title();
    },
    /** the box as it looks right now */
    get text() {
      return container.textContent ?? '';
    },
    click(label: string) {
      const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
      if (!button) throw new Error(`no button "${label}"`);
      button.click();
    },
    /** clicks the link with exactly this text, for example a player name */
    follow(text: string) {
      const link = [...container.querySelectorAll('a')].find((a) => a.textContent === text);
      if (!link) throw new Error(`no link "${text}"`);
      link.click();
    },
  };
}

/** Real stores, bus and settings; persistence is the real handlers on in-memory Dexie unless a test overrides stores. */
export function featureContext(options: TestStoresOptions = {}) {
  const { world, bus, stores } = testStores(options);
  const boxes = new Map<string, ReturnType<typeof recordingBox>>();
  const menuItems = new Map<string, MenuItem>();
  const settings = new Settings(memoryKv());
  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu: { add: (item: MenuItem) => menuItems.set(item.id, item) } as unknown as Menu,
    ...stores,
    recorder: new Recorder(() => false),
    ui: new UiState(memoryKv()),
    createBox: (options) => {
      const recording = recordingBox(options);
      boxes.set(options.id, recording);
      return recording.box;
    },
  };
  return {
    ctx,
    boxes,
    /** clicks the menu entry of a feature */
    menu: (id: string) => menuItems.get(id)?.action(),
  };
}
