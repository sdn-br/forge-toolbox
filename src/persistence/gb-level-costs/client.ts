import type { Call } from '../../content/core/rpc';
import type { GbLevelCostPersistence } from '../../content/stores/gb-level-costs';

/** Persistence through the service worker, which owns the database. */
export function gbLevelCostPersistence(call: Call): GbLevelCostPersistence {
  return {
    all: async () => (await call('gbLevelCosts.all', {})).rows,
    put: (rows) => call('gbLevelCosts.put', { rows }),
  };
}
