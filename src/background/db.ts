import Dexie from 'dexie';
import type { BattlesTables } from '../persistence/battles/worker';
import type { FoestatsTables } from '../persistence/foestats/worker';
import type { GreatBuildingsTables } from '../persistence/great-buildings/worker';
import type { IncomingTables } from '../persistence/incoming/worker';
import type { NotesTables } from '../persistence/notes/worker';
import type { PlayersTables } from '../persistence/players/worker';
import type { PlundersTables } from '../persistence/plunders/worker';
import type { ShieldsTables } from '../persistence/shields/worker';

export type ToolboxDb = Dexie &
  PlayersTables &
  BattlesTables &
  PlundersTables &
  IncomingTables &
  NotesTables &
  ShieldsTables &
  GreatBuildingsTables &
  FoestatsTables;

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
  // notes per world; the content script keeps them all in memory, so the world is the only index
  db.version(7).stores({
    noteGroups: '[world+id], world',
    notePages: '[world+id], world',
  });
  // city shields of other players, one per player; a new one replaces it, ended ones are pruned by their end
  db.version(8).stores({
    cityShields: '[world+player], expiresAt',
  });
  // last known state of other players' great buildings for the snipe helper, one row per building
  db.version(9).stores({
    greatBuildings: '[world+owner+entityId], [world+owner], world, seenAt',
  });
  // days of players at foestats, one row per player and day, appended at most once a day; and when each was asked
  db.version(10).stores({
    foestatsDays: '[world+player+date], [world+player]',
    foestatsFetches: '[world+player]',
  });
  // great buildings keep the rankings, the level they belong to and the own contribution; they are not indexed, so
  // the schema stays and old rows stay valid, they only lack the new fields
  db.version(11).stores({
    greatBuildings: '[world+owner+entityId], [world+owner], world, seenAt',
  });
  return db;
}
