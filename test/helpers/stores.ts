import { createBus, type ToolboxBus } from '../../src/content/core/events';
import { createStores, type Stores } from '../../src/content/stores';
import type { FetchLike } from '../../src/persistence/foestats/api';
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
export function testStores({ now = Date.now, fetch, overrides }: TestStoresOptions = {}) {
  const db = testDb({ now, ...(fetch && { fetch }) });
  const world = worldId('de20');
  const bus = createBus();
  const stores: Stores = { ...createStores(world, bus, db.call, now), ...overrides?.({ bus, world, now }) };
  return { db, world, bus, now, stores };
}
