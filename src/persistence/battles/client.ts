import type { Call } from '../../content/core/rpc';
import type { BattlePersistence } from '../../content/stores/battles';

/** Persistence through the service worker, which owns the database. */
export function battlePersistence(call: Call): BattlePersistence {
  return {
    put: (rows) => call('battles.put', { rows }),
    latest: async (world, opponent) => (await call('battles.latest', { world, opponent })) ?? undefined,
    list: (world, query) => call('battles.list', { world, ...query }),
    count: (world, opponents) => call('battles.count', { world, opponents }),
    prune: (before) => call('battles.prune', { before }),
  };
}
