import type { Call } from '../../content/core/rpc';
import type { GreatBuildingPersistence } from '../../content/stores/great-buildings';

/** Persistence through the service worker, which owns the database. */
export function greatBuildingPersistence(call: Call): GreatBuildingPersistence {
  return {
    put: (rows) => call('greatBuildings.put', { rows }),
    putList: (world, rows, at) => call('greatBuildings.putList', { world, rows, at }),
    putContributions: (world, rows, at) => call('greatBuildings.putContributions', { world, rows, at }),
    contributionsAt: (world) => call('greatBuildings.contributionsAt', { world }),
    prune: (world, before) => call('greatBuildings.prune', { world, before }),
    list: (world, owner) => call('greatBuildings.list', { world, ...(owner !== undefined && { owner }) }),
  };
}
