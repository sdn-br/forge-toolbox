import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { GreatBuildingsApi } from './contract';

export type GreatBuildingsTables = { greatBuildings: Table<KnownGreatBuilding, [WorldId, PlayerId, number]> };

export function greatBuildingsHandlers(db: GreatBuildingsTables): Handlers<GreatBuildingsApi> {
  return {
    'greatBuildings.put': async ({ rows }) => {
      await db.greatBuildings.bulkPut(rows);
    },
    'greatBuildings.list': ({ world, owner }) =>
      owner === undefined
        ? db.greatBuildings.where('world').equals(world).toArray()
        : db.greatBuildings.where('[world+owner]').equals([world, owner]).toArray(),
  };
}
