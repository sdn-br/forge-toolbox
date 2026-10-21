import { render } from 'lit-html';
import { createBus } from '../../src/content/core/events';
import type { FeatureContext } from '../../src/content/core/feature';
import { memoryKv } from '../../src/content/core/kv';
import { Recorder } from '../../src/content/core/recorder';
import { Settings } from '../../src/content/core/settings';
import { type BattlePersistence, BattleStore } from '../../src/content/stores/battles';
import { CatalogStore } from '../../src/content/stores/catalog';
import { CityStore } from '../../src/content/stores/cities';
import { type IncomingPersistence, IncomingStore } from '../../src/content/stores/incoming';
import { NoteStore } from '../../src/content/stores/notes';
import { PlayerStore } from '../../src/content/stores/players';
import { type PlunderPersistence, PlunderStore } from '../../src/content/stores/plunders';
import { ResourceStore } from '../../src/content/stores/resources';
import { SessionStore } from '../../src/content/stores/session';
import { ShieldStore } from '../../src/content/stores/shields';
import type { Box, BoxOptions } from '../../src/content/ui/box';
import type { Menu, MenuItem } from '../../src/content/ui/menu';
import { UiState } from '../../src/content/ui/ui-state';
import { worldId } from '../../src/shared/ids';
import { testDb } from './battle-db';

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

/** Real stores, bus and settings; persistence is the real handlers on in-memory Dexie unless a test passes its own. */
export function featureContext(
  persistence?: BattlePersistence,
  plunders?: PlunderPersistence,
  incoming?: IncomingPersistence,
) {
  const db = testDb();
  const world = worldId('de20');
  const bus = createBus();
  const boxes = new Map<string, ReturnType<typeof recordingBox>>();
  const menuItems = new Map<string, MenuItem>();
  const settings = new Settings(memoryKv());
  const ctx: FeatureContext = {
    world,
    bus,
    settings,
    menu: { add: (item: MenuItem) => menuItems.set(item.id, item) } as unknown as Menu,
    session: new SessionStore(bus),
    players: new PlayerStore(bus, { load: async () => [], put: async () => {} }),
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    resources: new ResourceStore(bus),
    battles: new BattleStore(bus, world, persistence ?? db.persistence),
    plunders: new PlunderStore(bus, world, plunders ?? db.plunders),
    incoming: new IncomingStore(bus, world, incoming ?? db.incoming),
    shields: new ShieldStore(bus, world, db.shields),
    notes: new NoteStore(bus, world, db.notes),
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
