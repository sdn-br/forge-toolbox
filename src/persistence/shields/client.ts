import type { Call } from '../../content/core/rpc';
import type { ShieldPersistence } from '../../content/stores/shields';

/** Persistence through the service worker, which owns the database. */
export function shieldPersistence(call: Call): ShieldPersistence {
  return {
    put: (rows) => call('shields.put', { rows }),
    get: async (world, player) => (await call('shields.get', { world, player })) ?? undefined,
    prune: (before) => call('shields.prune', { before }),
  };
}
