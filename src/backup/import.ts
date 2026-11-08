// The import of a backup file on the page "Daten verwalten": reading the file, the choice per profile and area, and
// merging the chosen rows into the profile databases or replacing the chosen areas with them. Only the current version
// of the file is read.
import type { IndexableType } from 'dexie';
import type { ToolboxDb } from '../background/db';
import { relinkPvp } from '../persistence/pvp/worker';
import { rowsOfWorld } from '../shared/idb';
import { playerId, type WorldId } from '../shared/ids';
import type { Player } from '../shared/model';
import { type Profile, profileStorageKey, sameProfile } from '../shared/profile';
import type { ProfileCall } from '../shared/rpc';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile, type BackupProfile, type BackupTables } from './format';
import { unpackText } from './gzip';
import { type LocalRows, withoutKnown } from './legacy/known';
import { type Area, DATA_AREAS, type DataArea, mergeRows } from './merge';
import { BACKUP_TABLES, mapTables, type Row, selectTables, TABLE_NAMES, type TableName, tablesOf } from './tables';

/** why a file cannot be imported */
export type ReadError = 'notJson' | 'notBackup' | 'version';

export type ReadResult = { ok: true; backup: BackupFile } | { ok: false; error: ReadError };

function isProfileEntry(value: unknown): value is BackupProfile {
  const p = value as Partial<BackupProfile> | null;
  const tables = p?.tables as Record<string, unknown> | undefined;
  return (
    typeof p?.world === 'string' &&
    (p.player === undefined || typeof p.player === 'number') &&
    typeof tables === 'object' &&
    tables !== null &&
    TABLE_NAMES.every((name) => Array.isArray(tables[name]))
  );
}

/** Reads a backup file, gzipped or plain JSON. Only version 2 is taken; anything else says why not. */
export async function readBackupFile(file: Blob): Promise<ReadResult> {
  let value: unknown;
  try {
    value = JSON.parse(await unpackText(file));
  } catch {
    return { ok: false, error: 'notJson' };
  }
  const v = value as Partial<BackupFile> | null;
  if (v?.format !== BACKUP_FORMAT) return { ok: false, error: 'notBackup' };
  if (v.version !== BACKUP_VERSION) return { ok: false, error: 'version' };
  if (!Array.isArray(v.profiles) || !v.profiles.every(isProfileEntry)) return { ok: false, error: 'notBackup' };
  return { ok: true, backup: value as BackupFile };
}

/** the entry of a profile in a backup file */
export const profileEntry = (backup: BackupFile, profile: Profile): BackupProfile | undefined =>
  backup.profiles.find((p) => sameProfile(p, profile));

/** One row of the import choice: a profile of the file with its areas. */
export interface ImportChoice {
  profile: BackupProfile;
  /** false for a world of the database of the time before profiles: without the own player it has no target */
  importable: boolean;
  /** rows per area; settings count 1 when the file has them */
  counts: Record<Area, number>;
  /** preselected areas; an area without rows is never checked */
  checked: Record<Area, boolean>;
}

/** rows per area of a profile entry; settings count 1 when it has them */
export function areaCounts({ tables, settings }: BackupProfile): Record<Area, number> {
  const counts = { pvp: 0, notes: 0, greatBuildings: 0, settings: settings ? 1 : 0 };
  for (const name of TABLE_NAMES) {
    const { area } = BACKUP_TABLES[name];
    if (area !== 'players') counts[area] += tables[name].length;
  }
  return counts;
}

/**
 * The choice per profile of the file. Every area with rows is preselected, except the settings: they would replace the
 * local ones, so only a profile without stored settings gets them preselected. `hasSettings` tells that per profile.
 */
export function importChoices(backup: BackupFile, hasSettings: (profile: Profile) => boolean): ImportChoice[] {
  return backup.profiles.map((profile) => {
    const counts = areaCounts(profile);
    const importable = profile.player !== undefined;
    const local = profile.player !== undefined && hasSettings({ world: profile.world, player: profile.player });
    return {
      profile,
      importable,
      counts,
      checked: {
        pvp: importable && counts.pvp > 0,
        notes: importable && counts.notes > 0,
        greatBuildings: importable && counts.greatBuildings > 0,
        settings: importable && counts.settings > 0 && !local,
      },
    };
  });
}

/** One profile of the confirmation before replacing: the chosen data areas it holds, empty when the file has no rows. */
export interface ReplacedProfile {
  profile: BackupProfile;
  areas: { area: Area; empty: boolean }[];
}

/**
 * What replacing would empty, for the confirmation: per profile that exists here (`exists`), the chosen data areas. A
 * profile new here has nothing to empty, the settings are replaced in both modes and the players never.
 */
export function replaceSummary(choices: ImportChoice[], exists: (profile: Profile) => boolean): ReplacedProfile[] {
  return choices.flatMap(({ profile, importable, counts, checked }) => {
    if (!importable || profile.player === undefined) return [];
    if (!exists({ world: profile.world, player: playerId(profile.player) })) return [];
    const areas = DATA_AREAS.filter((area) => checked[area]).map((area) => ({ area, empty: counts[area] === 0 }));
    return areas.length ? [{ profile, areas }] : [];
  });
}

/** "Zusammenführen" adds to what is stored, "Ersetzen" empties each chosen data area of a profile first. */
export type ImportMode = 'merge' | 'replace';

/** What the import wrote, rows new or changed. */
export interface ImportCounts {
  profiles: number;
  pvp: number;
  notes: number;
  greatBuildings: number;
  players: number;
  settings: number;
}

export const NO_IMPORT: ImportCounts = { profiles: 0, pvp: 0, notes: 0, greatBuildings: 0, players: 0, settings: 0 };

/** what the import needs from outside: the calls into the profile databases and chrome.storage.local */
export interface ImportEnv {
  /**
   * the calls into the service worker: the rows go through its connection, whose hooks count the change for the
   * backups (`watchBackupTables`); a database opened elsewhere would write past them
   */
  call: ProfileCall;
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** One profile of the file and the areas chosen for it. */
export interface ImportItem {
  profile: BackupProfile;
  areas: ReadonlySet<Area>;
}

/**
 * Merges the chosen areas of each profile into its database through the service worker (`backup.merge`), created
 * under the usual name when the profile is new here (another computer). In the mode "replace" the chosen data areas
 * are emptied first, in the same transaction, so a failure leaves the old rows; the players are merged in both modes.
 * Chosen settings replace the stored ones; the profile name is stored when it is missing.
 */
export async function importBackup(
  items: ImportItem[],
  createdAt: number,
  env: ImportEnv,
  mode: ImportMode = 'merge',
): Promise<ImportCounts> {
  const total = { ...NO_IMPORT };
  for (const { profile: entry, areas } of items) {
    if (entry.player === undefined || areas.size === 0) continue;
    const profile: Profile = { world: entry.world, player: playerId(entry.player) };
    total.profiles++;
    if (DATA_AREAS.some((area) => areas.has(area))) {
      const counts = await env.call(profile, 'backup.merge', { entry, areas: [...areas], mode });
      for (const key of ['pvp', 'notes', 'greatBuildings', 'players'] as const) total[key] += counts[key];
    }
    const settingsKey = profileStorageKey('settings', profile);
    const nameKey = profileStorageKey('profile', profile);
    const writes: Record<string, unknown> = {};
    if (areas.has('settings') && entry.settings) {
      writes[settingsKey] = entry.settings;
      total.settings++;
    }
    if (entry.name && (await env.get([nameKey]))[nameKey] === undefined)
      writes[nameKey] = { name: entry.name, seenAt: createdAt };
    if (Object.keys(writes).length) await env.set(writes);
  }
  return total;
}

/**
 * Merges the chosen data areas of one profile entry into the profile's database `db`, or in the mode "replace" empties
 * them first, in one transaction. Settings are not rows: the caller stores them. Returns how many rows it wrote.
 */
export function importTables(
  db: ToolboxDb,
  entry: BackupProfile,
  areas: ReadonlySet<Area>,
  mode: ImportMode,
): Promise<ImportedRows> {
  const empty = mode === 'replace' ? DATA_AREAS.filter((area) => areas.has(area)) : [];
  return mergeTables(db, ofWorld(selectTables(entry.tables, areas), entry.world), entry.world, empty);
}

/**
 * The rows of the chosen areas of old toolbox data (see src/backup/legacy) that the profile does not hold yet: the
 * old rows have no ids of the game, so known ones are found by player, outcome and time.
 */
export async function newLegacyTables(
  db: ToolboxDb,
  entry: BackupProfile,
  areas: ReadonlySet<Area>,
): Promise<BackupTables> {
  const picked = ofWorld(selectTables(entry.tables, areas), entry.world);
  return withoutKnown(picked, await localRows(db, entry.world, picked));
}

/** Merges the chosen areas of old toolbox data, leaving out what the profile holds already; in one transaction. */
export function importLegacy(db: ToolboxDb, entry: BackupProfile, areas: ReadonlySet<Area>): Promise<ImportedRows> {
  return db.transaction('rw', TABLE_NAMES, async () =>
    mergeTables(db, await newLegacyTables(db, entry, areas), entry.world, []),
  );
}

/** what the profile holds of `world` that old rows may repeat, and its rows of the players they name */
async function localRows(db: ToolboxDb, world: WorldId, source: BackupTables): Promise<LocalRows> {
  const ofWorld = <T extends { world: string }>(table: {
    filter(fn: (row: T) => boolean): { toArray(): Promise<T[]> };
  }) => table.filter((row) => row.world === world).toArray();
  const [battles, plunders, incoming, noteGroups, notePages, players] = await Promise.all([
    source.battles.length ? ofWorld(db.battles) : [],
    source.plunders.length ? ofWorld(db.plunders) : [],
    source.incoming.length ? ofWorld(db.incoming) : [],
    source.noteGroups.length ? ofWorld(db.noteGroups) : [],
    source.notePages.length ? ofWorld(db.notePages) : [],
    db.table<Player>('players').bulkGet(source.players.map((p) => [world, p.id])),
  ]);
  return { battles, plunders, incoming, noteGroups, notePages, players: players.filter((p) => p !== undefined) };
}

/** a profile's database holds only its own world, rows of another world in the file stay out */
function ofWorld(tables: BackupTables, world: WorldId): BackupTables {
  return mapTables((name) => tables[name].filter((r) => r.world === world));
}

/** the rows one profile's import wrote */
export type ImportedRows = Pick<ImportCounts, 'pvp' | 'notes' | 'greatBuildings' | 'players'>;

/**
 * Empties the tables of the areas in `empty` for `world`, then merges `t` and links the battles and plunders of every
 * opponent `t` names; all in one transaction.
 */
async function mergeTables(
  db: ToolboxDb,
  t: BackupTables,
  world: WorldId,
  empty: readonly DataArea[],
): Promise<ImportedRows> {
  /** reads the stored rows with the keys of the table's rows, applies its rule, writes what changed; returns how many */
  const merge = async <K extends TableName>(name: K) => {
    const rows: Row<K>[] = t[name];
    if (rows.length === 0) return 0;
    const { key, merge: rule } = BACKUP_TABLES[name];
    const table = db.table<Row<K>, IndexableType>(name);
    const changed = mergeRows(rows, await table.bulkGet(rows.map(key)), rule);
    await table.bulkPut(changed);
    return changed.length;
  };
  return db.transaction('rw', TABLE_NAMES, async () => {
    for (const area of empty) {
      for (const name of tablesOf(area)) {
        await rowsOfWorld(db.table<{ world: string }>(name), world).delete();
      }
    }
    const written: ImportedRows = { pvp: 0, notes: 0, greatBuildings: 0, players: 0 };
    for (const name of TABLE_NAMES) written[BACKUP_TABLES[name].area] += await merge(name);
    // the file may link differently or bring inferred battles a fought one of this profile replaces
    await relinkPvp(db, [...t.battles, ...t.plunders]);
    return written;
  });
}
