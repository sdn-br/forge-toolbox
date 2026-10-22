import { openDb } from '../../src/background/db';
import { createHandlers } from '../../src/background/handlers';
import type { Call } from '../../src/content/core/rpc';
import { battlePersistence } from '../../src/persistence/battles/client';
import type { FetchLike } from '../../src/persistence/foestats/api';
import { foestatsPersistence } from '../../src/persistence/foestats/client';
import type { FoestatsDeps } from '../../src/persistence/foestats/worker';
import { greatBuildingPersistence } from '../../src/persistence/great-buildings/client';
import { incomingPersistence } from '../../src/persistence/incoming/client';
import { notePersistence } from '../../src/persistence/notes/client';
import { playerPersistence } from '../../src/persistence/players/client';
import { plunderPersistence } from '../../src/persistence/plunders/client';
import { shieldPersistence } from '../../src/persistence/shields/client';

let dbCount = 0;

/** foestats as unreachable, so no test goes out to the network unless it brings its own fetch */
const offline: FetchLike = async () => ({ ok: false, status: 503, text: async () => '' });

/**
 * The real service worker handlers on an in-memory IndexedDB, called directly instead of through chrome messaging.
 * `deps` are the requests to foestats and the clock of the handlers.
 */
export function testDb(deps: Partial<FoestatsDeps> = {}) {
  const db = openDb(`test-${++dbCount}`);
  const handlers = createHandlers(db, { fetch: offline, now: Date.now, ...deps }) as Record<
    string,
    (arg: unknown) => Promise<unknown>
  >;
  const call: Call = (rpc, arg) => handlers[rpc]?.(arg) as never;
  return {
    db,
    call,
    persistence: battlePersistence(call),
    players: playerPersistence(call),
    plunders: plunderPersistence(call),
    incoming: incomingPersistence(call),
    notes: notePersistence(call),
    shields: shieldPersistence(call),
    greatBuildings: greatBuildingPersistence(call),
    foestats: foestatsPersistence(call),
  };
}
