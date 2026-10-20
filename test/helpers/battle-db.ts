import { openDb } from '../../src/background/db';
import { createHandlers } from '../../src/background/handlers';
import type { Call } from '../../src/content/core/rpc';
import { battlePersistence } from '../../src/persistence/battles/client';
import { plunderPersistence } from '../../src/persistence/plunders/client';

let dbCount = 0;

/** The real service worker handlers on an in-memory IndexedDB, called directly instead of through chrome messaging. */
export function testDb() {
  const db = openDb(`test-${++dbCount}`);
  const handlers = createHandlers(db) as Record<string, (arg: unknown) => Promise<unknown>>;
  const call: Call = (rpc, arg) => handlers[rpc]?.(arg) as never;
  return { db, call, persistence: battlePersistence(call), plunders: plunderPersistence(call) };
}
