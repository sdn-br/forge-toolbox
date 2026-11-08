// The registry of the backed up tables: per table its key, its area of the import, which writes change the backup and
// how the import merges a row of the file. A new backed up table gets its row type in `BackupRows` (format.ts) and its
// entry here; collecting, the choice by area, the counts, the import and the signal for changed data read it from here.
// What does not fit one loop over the tables stays in the code that needs it: the cursor filters and the players in
// collect.ts, the players of `selectTables` and the link of battles and plunders after the import.
import type { IndexableType } from 'dexie';
import { gbKey } from '../shared/great-buildings';
import type { PlayerId } from '../shared/ids';
import type { Player } from '../shared/model';
import { type BackupRows, type BackupTables, isMarkedPlayer, playerKey } from './format';
import {
  type Area,
  addMissing,
  DATA_AREAS,
  type DataArea,
  longerShield,
  type MergeRule,
  mergeMarked,
  mergePlayer,
  newerPage,
} from './merge';

export type TableName = keyof BackupRows;
export type Row<K extends TableName> = BackupRows[K];

/** What the backup does with one table of rows `R`. */
export interface TableSpec<R> {
  /** the primary key of the row in the profile database, to find the stored row a row of the file meets */
  key: (row: R) => IndexableType;
  /**
   * the area of the import the table belongs to; `players` go along with every data area and are merged, never
   * emptied, in both modes
   */
  area: DataArea | 'players';
  /**
   * which writes change the backup, for the service worker's signal that persisted data changed: `every` write, or
   * only a change of the fields named. The other fields of players and great buildings are game data that comes again
   * with each sighting; the export carries them along, but they alone are no reason for a new copy.
   */
  changes: 'every' | readonly (keyof R & string)[];
  /** what a row of the file does to the stored row with the same key ("Zusammenführen") */
  merge: MergeRule<R>;
  /** the player the row refers to; the backup keeps that player with the row */
  player?: (row: R) => PlayerId | undefined;
}

/** The backed up tables, in the order the file and the import name them. */
export const BACKUP_TABLES: { [K in TableName]: TableSpec<Row<K>> } = {
  battles: {
    key: (r) => [r.world, r.battleId],
    area: 'pvp',
    changes: 'every',
    merge: addMissing,
    player: (r) => r.opponent,
  },
  plunders: {
    key: (r) => [r.world, r.opponent, r.at],
    area: 'pvp',
    changes: 'every',
    merge: addMissing,
    player: (r) => r.opponent,
  },
  incoming: {
    key: (r) => [r.world, r.kind, r.key],
    area: 'pvp',
    changes: 'every',
    merge: addMissing,
    player: (r) => r.attacker,
  },
  noteGroups: { key: (r) => [r.world, r.id], area: 'notes', changes: 'every', merge: addMissing },
  notePages: {
    key: (r) => [r.world, r.id],
    area: 'notes',
    changes: 'every',
    merge: newerPage,
    player: (r) => r.player,
  },
  cityShields: {
    key: (r) => [r.world, r.player],
    area: 'pvp',
    changes: 'every',
    merge: longerShield,
    player: (r) => r.player,
  },
  greatBuildings: {
    key: gbKey,
    area: 'greatBuildings',
    changes: ['marksAt', 'ownContribution', 'contribution'],
    merge: mergeMarked,
    player: (r) => r.owner,
  },
  players: { key: (r) => [r.world, r.id], area: 'players', changes: ['marksAt', 'pvpMarksAt'], merge: mergePlayer },
};

export const TABLE_NAMES = Object.keys(BACKUP_TABLES) as TableName[];

/** the tables of an area, in the order of the registry */
export const tablesOf = (area: TableSpec<unknown>['area']): TableName[] =>
  TABLE_NAMES.filter((name) => BACKUP_TABLES[name].area === area);

/** a full set of tables, each with the rows `rows` gives for it */
export function mapTables(rows: <K extends TableName>(name: K) => Row<K>[]): BackupTables {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, rows(name)])) as BackupTables;
}

/** as `mapTables`, with rows that come later; all tables are read at once */
export async function mapTablesAsync(rows: <K extends TableName>(name: K) => Promise<Row<K>[]>): Promise<BackupTables> {
  const all = await Promise.all(TABLE_NAMES.map(async (name) => [name, await rows(name)] as const));
  return Object.fromEntries(all) as BackupTables;
}

/** every table without rows */
export const emptyTables = (): BackupTables => mapTables(() => []);

/** The players the rows refer to, as `world|id`; a table left out refers to none. */
export function referencedPlayers(tables: Partial<BackupTables>): Set<string> {
  const keys = new Set<string>();
  const add = <K extends TableName>(name: K) => {
    const player = BACKUP_TABLES[name].player;
    if (!player) return;
    for (const row of tables[name] ?? []) {
      const id = player(row);
      if (id !== undefined) keys.add(playerKey(row.world, id));
    }
  };
  for (const name of TABLE_NAMES) add(name);
  return keys;
}

/** Of `players`, the ones `referenced` names and the ones the session player marked, ignored or marked for PvP. */
export const playersToKeep = (players: Player[], referenced: Set<string>): Player[] =>
  players.filter((p) => isMarkedPlayer(p) || referenced.has(playerKey(p.world, p.id)));

/**
 * The rows of the chosen areas, and the players that go with them: the ones those rows refer to and the marked or
 * ignored ones. Without any area with rows there are no players either.
 */
export function selectTables(tables: BackupTables, areas: ReadonlySet<Area>): BackupTables {
  const picked = mapTables((name) => {
    const { area } = BACKUP_TABLES[name];
    return area !== 'players' && areas.has(area) ? tables[name] : [];
  });
  const players = DATA_AREAS.some((area) => areas.has(area))
    ? playersToKeep(tables.players, referencedPlayers(picked))
    : [];
  return { ...picked, players };
}
