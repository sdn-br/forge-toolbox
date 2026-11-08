import Dexie from 'dexie';
import type { AssetsTables } from '../persistence/assets/worker';
import type { BuildingDefsTables } from '../persistence/building-defs/worker';
import type { FoestatsTables } from '../persistence/foestats/worker';
import type { GreatBuildingsTables } from '../persistence/great-buildings/worker';
import type { IncomingTables } from '../persistence/incoming/worker';
import type { NotesTables } from '../persistence/notes/worker';
import type { PlayersTables } from '../persistence/players/worker';
import type { PvpTables } from '../persistence/pvp/worker';
import type { ShieldsTables } from '../persistence/shields/worker';
import { defineVersions } from './migrations';

export type ToolboxDb = Dexie &
  PlayersTables &
  PvpTables &
  IncomingTables &
  NotesTables &
  ShieldsTables &
  GreatBuildingsTables &
  FoestatsTables &
  AssetsTables &
  BuildingDefsTables;

/** The database of one profile, with the versions of `defineVersions`. */
export function openDb(name = 'forge-toolbox'): ToolboxDb {
  const db = new Dexie(name) as ToolboxDb;
  defineVersions(db);
  return db;
}
