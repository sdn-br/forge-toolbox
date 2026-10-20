import Dexie from 'dexie';
import type { BattlesTables } from '../persistence/battles/worker';
import type { IncomingTables } from '../persistence/incoming/worker';
import type { PlayersTables } from '../persistence/players/worker';
import type { PlundersTables } from '../persistence/plunders/worker';

export type ToolboxDb = Dexie & PlayersTables & BattlesTables & PlundersTables & IncomingTables;

/** The whole version history lives here; the domains in src/persistence only bring their tables. */
export function openDb(name = 'forge-toolbox'): ToolboxDb {
  const db = new Dexie(name) as ToolboxDb;
  db.version(1).stores({
    players: '[world+id], world, seenAt',
  });
  db.version(2).stores({
    battles: '[world+battleId], [world+at], [world+opponent+at], at',
  });
  db.version(3).stores({
    plunders: '[world+opponent+entityId+at], [world+at], [world+opponent+at], at',
  });
  // version 3 keyed plunders by their building, which a repelled plunder lacks. Dexie cannot change a primary key, so
  // version 4 drops the table (it was never released, nothing is lost) and version 5 builds it anew.
  db.version(4).stores({ plunders: null });
  // the game sends no id with a plunder and allows one per neighbour and day, so opponent and time make it one
  db.version(5).stores({
    plunders: '[world+opponent+at], [world+at], at',
  });
  // attacks on the own city: a battle is keyed by its battle id, a plunder by its event id
  db.version(6).stores({
    incoming: '[world+kind+key], [world+at], [world+attacker+at], at',
  });
  return db;
}
