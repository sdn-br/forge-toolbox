import { openDb, type ToolboxDb } from '../background/db';
import { hasOwnContribution, isFlagged } from '../persistence/great-buildings/merge';
import type { PlayerId, WorldId } from '../shared/ids';
import { LEGACY_DB, profileOfDbName, profileStorageKey } from '../shared/profile';
import type { BackupFile, BackupProfile, BackupTables } from './format';
import { BACKUP_FORMAT, BACKUP_VERSION, playersToKeep, referencedPlayers } from './format';

/** Where the rows of one entry come from: a profile's database, or one world of the old database. */
export interface BackupSource {
  world: WorldId;
  player?: PlayerId;
  /** the own player name of the profile, when it is stored */
  name?: string;
  db: ToolboxDb;
  settings?: Record<string, unknown>;
}

/** `de20:12345`, `de20:` for a world of the old database; tells the sources apart in a selection */
export const sourceKey = ({ world, player }: { world: WorldId; player?: PlayerId }): string =>
  `${world}:${player ?? ''}`;

/** the sources whose key is in `keys`, for an export of the chosen profiles only */
export const selectSources = (sources: BackupSource[], keys: ReadonlySet<string>): BackupSource[] =>
  sources.filter((s) => keys.has(sourceKey(s)));

/** Reads what the backup holds from the databases, one entry per source. */
export async function collectBackup(sources: BackupSource[], now: number): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    profiles: await Promise.all(sources.map((source) => collectProfile(source, now))),
  };
}

async function collectProfile(
  { world, player, name, db, settings }: BackupSource,
  now: number,
): Promise<BackupProfile> {
  return {
    world,
    ...(player !== undefined && { player }),
    ...(name && { name }),
    ...(settings && { settings }),
    tables: await collectTables(db, world, now),
  };
}

/** the rows of `world`; a profile's database holds no other, the old one holds all */
export async function collectTables(db: ToolboxDb, world: WorldId, now: number): Promise<BackupTables> {
  const ofWorld = <T extends { world: string }>(table: {
    filter(fn: (row: T) => boolean): { toArray(): Promise<T[]> };
  }) => table.filter((row) => row.world === world).toArray();
  const [battles, plunders, incoming, noteGroups, notePages, shields, buildings, allPlayers] = await Promise.all([
    ofWorld(db.battles),
    ofWorld(db.plunders),
    ofWorld(db.incoming),
    ofWorld(db.noteGroups),
    ofWorld(db.notePages),
    ofWorld(db.cityShields),
    ofWorld(db.greatBuildings),
    ofWorld(db.players),
  ]);
  const cityShields = shields.filter((s) => s.expiresAt > now);
  const greatBuildings = buildings.filter((b) => isFlagged(b) || hasOwnContribution(b));

  const referenced = referencedPlayers({ battles, plunders, incoming, notePages, cityShields, greatBuildings });
  const players = playersToKeep(allPlayers, referenced);

  return { battles, plunders, incoming, noteGroups, notePages, cityShields, greatBuildings, players };
}

/**
 * Opens every profile's database, and the old one while it still exists, one source per world in it. `getStorage` reads
 * chrome.storage.local. The caller closes the databases when done.
 */
export async function openBackupSources(
  getStorage: (keys: string[]) => Promise<Record<string, unknown>>,
): Promise<BackupSource[]> {
  const names = (await indexedDB.databases()).map((d) => d.name ?? '').sort();
  const sources: BackupSource[] = [];
  for (const name of names) {
    const profile = profileOfDbName(name);
    if (!profile) continue;
    const key = profileStorageKey('settings', profile);
    const nameKey = profileStorageKey('profile', profile);
    const stored = await getStorage([key, nameKey]);
    const settings = stored[key] as Record<string, unknown> | undefined;
    const own = (stored[nameKey] as { name?: unknown } | undefined)?.name;
    sources.push({
      ...profile,
      ...(typeof own === 'string' && own && { name: own }),
      db: openDb(name),
      ...(settings && { settings }),
    });
  }
  // checked by name: opening the old database would create it again after the takeover deleted it
  if (names.includes(LEGACY_DB)) {
    const db = openDb(LEGACY_DB);
    const settings = (await getStorage(['settings'])).settings as Record<string, unknown> | undefined;
    const worlds = await worldsOf(db);
    for (const world of worlds) sources.push({ world, db, ...(settings && { settings }) });
    if (worlds.length === 0) db.close();
  }
  return sources;
}

/** the worlds with rows in `db`; every primary key starts with the world */
async function worldsOf(db: ToolboxDb): Promise<WorldId[]> {
  const worlds = new Set<WorldId>();
  for (const table of db.tables) {
    for (const key of await table.toCollection().primaryKeys()) {
      worlds.add((Array.isArray(key) ? key[0] : key) as WorldId);
    }
  }
  return [...worlds].sort();
}

/** closes each database once, the old one serves several sources */
export function closeBackupSources(sources: BackupSource[]): void {
  for (const db of new Set(sources.map((s) => s.db))) db.close();
}
