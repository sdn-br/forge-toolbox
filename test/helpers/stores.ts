import { createBus, type ToolboxBus } from '../../src/content/core/events';
import { memoryKv } from '../../src/content/core/kv';
import { Settings } from '../../src/content/core/settings';
import type { LevelCostFile } from '../../src/content/domain/gb-level-cost';
import { singleFactor } from '../../src/content/features/shared/settings';
import { buildingDefLoader } from '../../src/content/game/building-def-loader';
import { createStores, type Stores } from '../../src/content/stores';
import type { FetchLike } from '../../src/content/stores/foestats-api';
import { UiState } from '../../src/content/ui/ui-state';
import { type WorldId, worldId } from '../../src/shared/ids';
import { testDb } from './battle-db';

export interface TestStoresOptions {
  /** the clock of the stores and, through the returned `now`, of the handlers */
  now?: () => number;
  /** the requests to foestats; without it foestats is unreachable */
  fetch?: FetchLike;
  /** stores a test builds itself, for example on persistence it controls; they need the bus, so they come from here */
  /** what the own-share state reads; without them empty ones */
  settings?: Settings;
  ui?: UiState;
  /** the shipped level costs the stores see; without them none, so a test sees only the costs it brings */
  levelCosts?: LevelCostFile;
  overrides?: (env: { bus: ToolboxBus; world: WorldId; now: () => number }) => Partial<Stores>;
}

/** The real stores on the real persistence handlers over an in-memory IndexedDB, as `createStores` builds them. */
/** foestats as unreachable, so no test goes out to the network unless it brings its own fetch */
const offline: FetchLike = async () => ({ ok: false, status: 503, text: async () => '' });

export function testStores({
  now = Date.now,
  fetch = offline,
  settings = new Settings(memoryKv()),
  ui = new UiState(memoryKv()),
  levelCosts = {},
  overrides,
}: TestStoresOptions = {}) {
  const db = testDb({ now });
  const world = worldId('de20');
  const bus = createBus();
  const stores: Stores = {
    ...createStores(
      world,
      bus,
      db.call,
      buildingDefLoader(db.call),
      { prefs: ui, singleFactor: singleFactor(settings) },
      now,
      fetch,
      levelCosts,
    ),
    ...overrides?.({ bus, world, now }),
  };
  return { db, world, bus, now, stores };
}
