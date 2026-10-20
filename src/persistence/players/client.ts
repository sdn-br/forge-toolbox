import type { Call } from '../../content/core/rpc';
import type { PlayerPersistence } from '../../content/stores/players';

/** Persistence through the service worker, which owns the database. */
export function playerPersistence(call: Call): PlayerPersistence {
  return {
    load: (world) => call('players.load', { world }),
    put: (rows) => call('players.put', { rows }),
  };
}
