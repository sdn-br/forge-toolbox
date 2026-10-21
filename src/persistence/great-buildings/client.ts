import type { Call } from '../../content/core/rpc';
import type { GreatBuildingPersistence } from '../../content/stores/great-buildings';

/** Persistence through the service worker, which owns the database. */
export function greatBuildingPersistence(call: Call): GreatBuildingPersistence {
  return {
    put: (rows) => call('greatBuildings.put', { rows }),
    list: (world, owner) => call('greatBuildings.list', { world, ...(owner !== undefined && { owner }) }),
  };
}
