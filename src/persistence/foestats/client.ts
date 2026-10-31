import type { Call } from '../../content/core/rpc';
import type { FoestatsPersistence } from '../../content/stores/foestats';

/** Persistence through the service worker, which owns the database and the rules of asking foestats. */
export function foestatsPersistence(call: Call): FoestatsPersistence {
  return {
    claim: (world, player) => call('foestats.claim', { world, player }),
    store: (world, player, answer) => call('foestats.store', { world, player, answer }),
    history: (world, player) => call('foestats.history', { world, player }),
  };
}
