import Dexie, { type EntityTable } from 'dexie';
import type { Player } from '../shared/model';

export type ToolboxDb = Dexie & {
  players: EntityTable<Player>;
};

export function openDb(name = 'forge-toolbox'): ToolboxDb {
  const db = new Dexie(name) as ToolboxDb;
  db.version(1).stores({
    players: '[world+id], world, seenAt',
  });
  return db;
}
