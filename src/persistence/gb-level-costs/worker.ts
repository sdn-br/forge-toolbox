import type { Table } from 'dexie';
import type { BuildingDefId } from '../../shared/ids';
import type { Handlers } from '../../shared/rpc';
import type { GbLevelCostsApi, LevelCostRow } from './contract';

/** one row per great building type and start level; no world, the costs are the same in all of them */
export type GbLevelCostsTables = { gbLevelCosts: Table<LevelCostRow, [BuildingDefId, number]> };

export function gbLevelCostsHandlers(db: GbLevelCostsTables): Handlers<GbLevelCostsApi> {
  return {
    'gbLevelCosts.all': async () => ({ rows: await db.gbLevelCosts.toArray() }),
    'gbLevelCosts.put': async ({ rows }) => {
      await db.gbLevelCosts.bulkPut(rows);
    },
  };
}
