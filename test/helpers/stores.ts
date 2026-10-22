import { createBus, type ToolboxBus } from '../../src/content/core/events';
import { createStores, type Stores } from '../../src/content/stores';
import type { FetchLike } from '../../src/shared/foestats-api';
import { type WorldId, worldId } from '../../src/shared/ids';
import { testDb } from './battle-db';

export interface TestStoresOptions {
  /** the clock of the stores and, through the returned `now`, of the handlers */
  now?: () => number;
  /** the requests to foestats; without it foestats is unreachable */
  fetch?: FetchLike;
  /** stores a test builds itself, for example on persistence it controls; they need the bus, so they come from here */
  overrides?: (env: { bus: ToolboxBus; world: WorldId; now: () => number }) => Partial<Stores>;
}

/** The real stores on the real persistence handlers over an in-memory IndexedDB, as `createStores` builds them. */
/** foestats as unreachable, so no test goes out to the network unless it brings its own fetch */
const offline: FetchLike = async () => ({ ok: false, status: 503, text: async () => '' });

export function testStores({ now = Date.now, fetch = offline, overrides }: TestStoresOptions = {}) {
  const db = testDb({ now });
  const world = worldId('de20');
  const bus = createBus();
  const stores: Stores = { ...createStores(world, bus, db.call, now, fetch), ...overrides?.({ bus, world, now }) };
  return { db, world, bus, now, stores };
}
