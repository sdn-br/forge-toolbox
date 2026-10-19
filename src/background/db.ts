import Dexie, { type EntityTable } from 'dexie';
import type { Player } from '../shared/model';
import type { StoredBuildingDef } from '../shared/rpc';

export type ToolboxDb = Dexie & {
  players: EntityTable<Player>;
  buildingDefs: EntityTable<StoredBuildingDef, 'id'>;
};

export function openDb(name = 'forge-toolbox'): ToolboxDb {
  const db = new Dexie(name) as ToolboxDb;
  db.version(1).stores({
    players: '[world+id], world, seenAt',
    buildingDefs: 'id',
  });
  return db;
}
