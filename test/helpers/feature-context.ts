import { render } from 'lit-html';
import type { FeatureContext } from '../../src/content/core/feature';
import { memoryKv } from '../../src/content/core/kv';
import { type MarkerLink, Markers } from '../../src/content/core/markers';
import { memoryProfileStorage, profileCopy } from '../../src/content/core/profile-copy';
import { Recorder } from '../../src/content/core/recorder';
import { OwnSelection } from '../../src/content/core/selection';
import { Settings } from '../../src/content/core/settings';
import { createGbOwnState } from '../../src/content/stores/gb-own-state';
import type { Box, BoxOptions } from '../../src/content/ui/box';
import type { Menu, MenuItem } from '../../src/content/ui/menu';
import { UiState } from '../../src/content/ui/ui-state';
import { playerId } from '../../src/shared/ids';
import type { MarkerCommand } from '../../src/shared/marker-protocol';
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
      options.onClose?.();
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
    /** what the feature asked the box for */
    options,
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
      const button = [...container.querySelectorAll('button')].find(
        (b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label,
      );
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

/** A marker module that records what the content script posts and plays back what the page reports. */
export function fakeMarkerLink() {
  const posted: MarkerCommand[] = [];
  let listener: ((seq: number, ids: number[]) => void) | undefined;
  const link: MarkerLink = {
    post: (command) => posted.push(command),
    onRemoved: (l) => {
      listener = l;
    },
  };
  return {
    link,
    posted,
    /** the last command, or undefined before any */
    get last(): MarkerCommand | undefined {
      return posted.at(-1);
    },
    /** the building ids the page shows arrows on now, as far as the commands tell */
    get shown(): number[] {
      const last = posted.at(-1);
      return last?.type === 'show' ? last.spots.map((s) => s.id) : [];
    },
    /** the viewer dismissed these arrows in the game; without `seq` of the marking shown last */
    dismiss(ids: number[], seq?: number) {
      const last = [...posted].reverse().find((c) => c.type === 'show');
      listener?.(seq ?? (last?.type === 'show' ? last.seq : 0), ids);
    },
  };
}

/** Real stores, bus and settings; persistence is the real handlers on in-memory Dexie unless a test overrides stores. */
export function featureContext(options: TestStoresOptions & { storage?: Record<string, unknown> } = {}) {
  const { world, bus, stores } = testStores(options);
  const boxes = new Map<string, ReturnType<typeof recordingBox>>();
  const menuItems = new Map<string, MenuItem>();
  const settings = new Settings(memoryKv());
  const ui = new UiState(memoryKv());
  const marker = fakeMarkerLink();
  /** chrome.storage.local of all profiles, the own one is de20:1 */
  const storage = memoryProfileStorage(options.storage);
  let reloads = 0;
  const markers = new Markers(bus, stores.cities, marker.link);
  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu: { add: (item: MenuItem) => menuItems.set(item.id, item), setIconSize: () => {} } as unknown as Menu,
    ...stores,
    recorder: new Recorder(() => false),
    markers,
    selection: new OwnSelection(bus, stores.cities, stores.catalog, markers),
    ui,
    gbOwn: createGbOwnState(bus, ui, settings),
    createBox: (options) => {
      const recording = recordingBox(options);
      boxes.set(options.id, recording);
      return recording.box;
    },
    profileCopy: profileCopy(storage, { world, player: playerId(1) }, () => reloads++),
  };
  return {
    ctx,
    boxes,
    /** what went to the marker module in the page, and a way to report back from it */
    marker,
    storage,
    /** how often the game page was reloaded */
    get reloads() {
      return reloads;
    },
    /** clicks the menu entry of a feature */
    menu: (id: string) => menuItems.get(id)?.action(),
  };
}
