import type { Call } from '../../content/core/rpc';
import type { FoestatsPersistence } from '../../content/stores/foestats';

/** Persistence through the service worker, which owns the database and the rules of asking foestats or ScoreDB. */
export function foestatsPersistence(call: Call): FoestatsPersistence {
  return {
    claim: (world, player, source) => call('foestats.claim', { world, player, ...(source && { source }) }),
    store: (world, player, outcome, source) =>
      call('foestats.store', { world, player, outcome, ...(source && { source }) }),
    history: (world, player) => call('foestats.history', { world, player }),
  };
}
