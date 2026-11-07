// Takes over the store of the time before profiles: one database `forge-toolbox` for all worlds and global settings.
// The first profile that opens on a world gets the rows of that world, a second profile on it starts empty.
import Dexie from 'dexie';
import { rowsOfWorld } from '../shared/idb';
import { LEGACY_DB, PROFILE_KEYS, type Profile, profileDbName, profileStorageKey } from '../shared/profile';
import { openDb, type ToolboxDb } from './db';

/** the part of chrome.storage.local the takeover uses */
export interface LocalStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** the databases of the profiles that ran the takeover; opening a database creates it, so its existence tells nothing */
export const SEEN_KEY = 'profiles.seen';

/** Once per profile, before its first call: moves the rows of its world out of the old database. */
export async function adoptLegacy(profile: Profile, target: ToolboxDb, storage: LocalStorage): Promise<void> {
  const name = profileDbName(profile);
  const seen = ((await storage.get([SEEN_KEY]))[SEEN_KEY] as string[] | undefined) ?? [];
  if (seen.includes(name)) return;
  if (await Dexie.exists(LEGACY_DB)) {
    const legacy = openDb(LEGACY_DB);
    let drained = false;
    try {
      if (await moveWorld(legacy, target, profile.world)) await copyGlobalKeys(profile, storage);
      drained = await isEmpty(legacy);
    } finally {
      legacy.close();
    }
    if (drained) {
      await Dexie.delete(LEGACY_DB);
      await storage.remove(PROFILE_KEYS);
    }
  } else {
    // the database went first, so a takeover that stopped in between leaves only the keys
    await storage.remove(PROFILE_KEYS);
  }
  await storage.set({ [SEEN_KEY]: [...seen, name] });
}

/** every table has the field `world`; returns whether rows moved */
async function moveWorld(from: ToolboxDb, to: ToolboxDb, world: string): Promise<boolean> {
  const rows = new Map<string, unknown[]>();
  for (const table of from.tables) {
    const list = await rowsOfWorld(table, world).toArray();
    if (list.length) rows.set(table.name, list);
  }
  if (rows.size === 0) return false;
  const names = [...rows.keys()];
  // copy first and delete only after the copy committed: a stop in between leaves the rows in both databases, and the
  // next run puts them again under the same keys
  await to.transaction('rw', names, async () => {
    for (const [name, list] of rows) await to.table(name).bulkPut(list);
  });
  await from.transaction('rw', names, async () => {
    for (const name of names) await rowsOfWorld(from.table(name), world).delete();
  });
  return true;
}

/** the old settings and boxes go with the rows, unless the profile has its own already */
async function copyGlobalKeys(profile: Profile, storage: LocalStorage): Promise<void> {
  const own = PROFILE_KEYS.map((key) => profileStorageKey(key, profile));
  const [old, current] = await Promise.all([storage.get(PROFILE_KEYS), storage.get(own)]);
  const copy: Record<string, unknown> = {};
  PROFILE_KEYS.forEach((key, i) => {
    const target = own[i] as string;
    if (old[key] !== undefined && current[target] === undefined) copy[target] = old[key];
  });
  if (Object.keys(copy).length) await storage.set(copy);
}

async function isEmpty(db: ToolboxDb): Promise<boolean> {
  const counts = await Promise.all(db.tables.map((table) => table.count()));
  return counts.every((count) => count === 0);
}
