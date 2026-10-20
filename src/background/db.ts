import Dexie from 'dexie';
import type { BattlesTables } from '../persistence/battles/worker';
import type { PlayersTables } from '../persistence/players/worker';

export type ToolboxDb = Dexie & PlayersTables & BattlesTables;

/** The whole version history lives here; the domains in src/persistence only bring their tables. */
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
