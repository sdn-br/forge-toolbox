// The import of a backup file on the page "Daten verwalten": reading the file, the choice per profile and area, and
// merging the chosen rows into the profile databases or replacing the chosen areas with them. Only the current version
// of the file is read.
import type { ToolboxDb } from '../background/db';
import { playerId, type WorldId } from '../shared/ids';
import { type Profile, profileDbName, profileStorageKey } from '../shared/profile';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile, type BackupProfile, type BackupTables } from './format';
import { unpackText } from './gzip';
import {
  type Area,
  addMissing,
  DATA_AREAS,
  longerShield,
  type MergeRule,
  mergeMarked,
  mergeRows,
  newerPage,
  selectTables,
} from './merge';

/** why a file cannot be imported */
export type ReadError = 'notJson' | 'notBackup' | 'version';

export type ReadResult = { ok: true; backup: BackupFile } | { ok: false; error: ReadError };

const TABLES: (keyof BackupTables)[] = [
  'battles',
  'plunders',
  'incoming',
  'noteGroups',
  'notePages',
  'cityShields',
  'greatBuildings',
  'players',
];

function isProfileEntry(value: unknown): value is BackupProfile {
  const p = value as Partial<BackupProfile> | null;
  const tables = p?.tables as Record<string, unknown> | undefined;
  return (
    typeof p?.world === 'string' &&
    (p.player === undefined || typeof p.player === 'number') &&
    typeof tables === 'object' &&
    tables !== null &&
    TABLES.every((name) => Array.isArray(tables[name]))
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

const countsOf = ({ tables, settings }: BackupProfile): Record<Area, number> => ({
  pvp: tables.battles.length + tables.plunders.length + tables.incoming.length + tables.cityShields.length,
  notes: tables.noteGroups.length + tables.notePages.length,
  greatBuildings: tables.greatBuildings.length,
  settings: settings ? 1 : 0,
});

/**
 * The choice per profile of the file. Every area with rows is preselected, except the settings: they would replace the
 * local ones, so only a profile without stored settings gets them preselected. `hasSettings` tells that per profile.
 */
export function importChoices(backup: BackupFile, hasSettings: (profile: Profile) => boolean): ImportChoice[] {
  return backup.profiles.map((profile) => {
    const counts = countsOf(profile);
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

/** what the import needs from outside: the databases and chrome.storage.local */
export interface ImportEnv {
  open: (name: string) => ToolboxDb;
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** One profile of the file and the areas chosen for it. */
export interface ImportItem {
  profile: BackupProfile;
  areas: ReadonlySet<Area>;
}

/**
 * Merges the chosen areas of each profile into its database, created under the usual name when the profile is new
 * here (another computer). In the mode "replace" the chosen data areas are emptied first, in the same transaction, so
 * a failure leaves the old rows; the players are merged in both modes. Chosen settings replace the stored ones; the
 * profile name is stored when it is missing.
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
      const db = env.open(profileDbName(profile));
      try {
        const empty = mode === 'replace' ? DATA_AREAS.filter((area) => areas.has(area)) : [];
        const counts = await mergeTables(
          db,
          ofWorld(selectTables(entry.tables, areas), entry.world),
          entry.world,
          empty,
        );
        for (const key of ['pvp', 'notes', 'greatBuildings', 'players'] as const) total[key] += counts[key];
      } finally {
        db.close();
      }
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

/** a profile's database holds only its own world, rows of another world in the file stay out */
function ofWorld(tables: BackupTables, world: WorldId): BackupTables {
  const own = <T extends { world: string }>(rows: T[]) => rows.filter((r) => r.world === world);
  return {
    battles: own(tables.battles),
    plunders: own(tables.plunders),
    incoming: own(tables.incoming),
    noteGroups: own(tables.noteGroups),
    notePages: own(tables.notePages),
    cityShields: own(tables.cityShields),
    greatBuildings: own(tables.greatBuildings),
    players: own(tables.players),
  };
}

type Counted = Pick<ImportCounts, 'pvp' | 'notes' | 'greatBuildings' | 'players'>;

/** the tables of a data area, emptied before replacing it */
const AREA_TABLES = {
  pvp: ['battles', 'plunders', 'incoming', 'cityShields'],
  notes: ['noteGroups', 'notePages'],
  greatBuildings: ['greatBuildings'],
} as const satisfies Record<(typeof DATA_AREAS)[number], (keyof BackupTables)[]>;

/** Empties the tables of the areas in `empty` for `world`, then merges `t`; all in one transaction. */
async function mergeTables(
  db: ToolboxDb,
  t: BackupTables,
  world: WorldId,
  empty: readonly (typeof DATA_AREAS)[number][],
): Promise<Counted> {
  /** reads the local rows with the keys of `rows`, applies the rule and writes what changed; returns how many */
  const merge = async <T>(
    table: { bulkGet(keys: unknown[]): Promise<(T | undefined)[]>; bulkPut(rows: T[]): Promise<unknown> },
    rows: T[],
    key: (row: T) => unknown[],
    rule: MergeRule<T>,
  ) => {
    if (rows.length === 0) return 0;
    const changed = mergeRows(rows, await table.bulkGet(rows.map(key)), rule);
    await table.bulkPut(changed);
    return changed.length;
  };
  return db.transaction('rw', TABLES, async () => {
    for (const area of empty) {
      for (const name of AREA_TABLES[area]) {
        await db
          .table<{ world: string }>(name)
          .filter((row) => row.world === world)
          .delete();
      }
    }
    const pvp = await Promise.all([
      merge(db.battles, t.battles, (r) => [r.world, r.battleId], addMissing),
      merge(db.plunders, t.plunders, (r) => [r.world, r.opponent, r.at], addMissing),
      merge(db.incoming, t.incoming, (r) => [r.world, r.kind, r.key], addMissing),
      merge(db.cityShields, t.cityShields, (r) => [r.world, r.player], longerShield),
    ]);
    const notes = await Promise.all([
      merge(db.noteGroups, t.noteGroups, (r) => [r.world, r.id], addMissing),
      merge(db.notePages, t.notePages, (r) => [r.world, r.id], newerPage),
    ]);
    const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
    return {
      pvp: sum(pvp),
      notes: sum(notes),
      greatBuildings: await merge(
        db.greatBuildings,
        t.greatBuildings,
        (r) => [r.world, r.owner, r.entityId],
        mergeMarked,
      ),
      players: await merge(db.players, t.players, (r) => [r.world, r.id], mergeMarked),
    };
  });
}
