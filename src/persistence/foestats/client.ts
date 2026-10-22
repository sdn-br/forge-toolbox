import type { Call } from '../../content/core/rpc';
import type { FoestatsPersistence } from '../../content/stores/foestats';

/** Persistence through the service worker, which owns the database and asks foestats. */
export function foestatsPersistence(call: Call): FoestatsPersistence {
  return {
    update: async (world, player) => (await call('foestats.update', { world, player })).status,
    history: (world, player) => call('foestats.history', { world, player }),
  };
}
