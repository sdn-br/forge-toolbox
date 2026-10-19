import Dexie, { type EntityTable } from 'dexie';
import type { Battle, Player } from '../shared/model';

export type ToolboxDb = Dexie & {
  players: EntityTable<Player>;
  battles: EntityTable<Battle>;
};

export function openDb(name = 'forge-toolbox'): ToolboxDb {
  const db = new Dexie(name) as ToolboxDb;
  db.version(1).stores({
    players: '[world+id], world, seenAt',
  });
  db.version(2).stores({
    battles: '[world+battleId], [world+at], [world+opponent+at], at',
  });
  return db;
}
