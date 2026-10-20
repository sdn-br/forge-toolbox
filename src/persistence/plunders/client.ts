import type { Call } from '../../content/core/rpc';
import type { PlunderPersistence } from '../../content/stores/plunders';

/** Persistence through the service worker, which owns the database. */
export function plunderPersistence(call: Call): PlunderPersistence {
  return {
    put: (rows) => call('plunders.put', { rows }),
    latest: async (world, opponent) => (await call('plunders.latest', { world, opponent })) ?? undefined,
    list: (world, query) => call('plunders.list', { world, ...query }),
    totals: (world, opponents) => call('plunders.totals', { world, opponents }),
    prune: (before) => call('plunders.prune', { before }),
  };
}
