import { openDb } from '../../src/background/db';
import { createHandlers, type HandlerDeps } from '../../src/background/handlers';
import type { Call } from '../../src/content/core/rpc';
import { battlePersistence } from '../../src/persistence/battles/client';
import { foestatsPersistence } from '../../src/persistence/foestats/client';
import { greatBuildingPersistence } from '../../src/persistence/great-buildings/client';
import { incomingPersistence } from '../../src/persistence/incoming/client';
import { notePersistence } from '../../src/persistence/notes/client';
import { playerPersistence } from '../../src/persistence/players/client';
import { plunderPersistence } from '../../src/persistence/plunders/client';
import { shieldPersistence } from '../../src/persistence/shields/client';

let dbCount = 0;

/** the Inno CDN as unreachable, so no test goes out to the network unless it brings its own */
const offline = async (url: string): Promise<string> => {
  throw new Error(`offline: ${url}`);
};

/**
 * The real service worker handlers on an in-memory IndexedDB, called directly instead of through chrome messaging.
 * `deps` hold the clock of the handlers and the requests to the Inno CDN.
 */
export function testDb(deps: Partial<HandlerDeps> = {}) {
  const db = openDb(`test-${++dbCount}`);
  const handlers = createHandlers(db, { now: Date.now, fetchText: offline, ...deps }) as Record<
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
