// Takes over the store of the time before profiles: one database `forge-toolbox` for all worlds and global settings.
// The first profile that opens on a world gets the rows of that world, a second profile on it starts empty.
import Dexie from 'dexie';
import { LEGACY_DB, type Profile, profileDbName, profileStorageKey } from '../shared/profile';
import { openDb, type ToolboxDb } from './db';

/** the part of chrome.storage.local the takeover uses */
export interface LocalStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** settings and box state, global before profiles */
export const GLOBAL_KEYS = ['settings', 'ui.boxes', 'ui.prefs'];
/** the databases of the profiles that ran the takeover; opening a database creates it, so its existence tells nothing */
export const SEEN_KEY = 'profiles.seen';

/** Once per profile, before its first call: moves the rows of its world out of the old database. */
export async function adoptLegacy(profile: Profile, target: ToolboxDb, storage: LocalStorage): Promise<void> {
  const name = profileDbName(profile);
  const seen = ((await storage.get([SEEN_KEY]))[SEEN_KEY] as string[] | undefined) ?? [];
  if (seen.includes(name)) return;
  if (await Dexie.exists(LEGACY_DB)) {
    const legacy = openDb(LEGACY_DB);
    try {
      if (await moveWorld(legacy, target, profile.world)) await copyGlobalKeys(profile, storage);
      if (await isEmpty(legacy)) {
        legacy.close();
        await Dexie.delete(LEGACY_DB);
        await storage.remove(GLOBAL_KEYS);
      }
    } finally {
      legacy.close();
    }
  } else {
    // the database went first, so a takeover that stopped in between leaves only the keys
    await storage.remove(GLOBAL_KEYS);
  }
  await storage.set({ [SEEN_KEY]: [...seen, name] });
}

const ofWorld = (world: string) => (row: { world?: unknown }) => row.world === world;

/** every table has the field `world`; returns how many rows moved */
async function moveWorld(from: ToolboxDb, to: ToolboxDb, world: string): Promise<number> {
  const rows = new Map<string, unknown[]>();
  for (const table of from.tables) {
    const list = await table.filter(ofWorld(world)).toArray();
    if (list.length) rows.set(table.name, list);
  }
  if (rows.size === 0) return 0;
  const names = [...rows.keys()];
  // copy first and delete only after the copy committed: a stop in between leaves the rows in both databases, and the
  // next run puts them again under the same keys
  await to.transaction('rw', names, async () => {
    for (const [name, list] of rows) await to.table(name).bulkPut(list);
  });
  await from.transaction('rw', names, async () => {
    for (const name of names) await from.table(name).filter(ofWorld(world)).delete();
  });
  return [...rows.values()].reduce((sum, list) => sum + list.length, 0);
}

/** the old settings and boxes go with the rows, unless the profile has its own already */
async function copyGlobalKeys(profile: Profile, storage: LocalStorage): Promise<void> {
  const own = GLOBAL_KEYS.map((key) => profileStorageKey(key, profile));
  const [old, current] = await Promise.all([storage.get(GLOBAL_KEYS), storage.get(own)]);
  const copy: Record<string, unknown> = {};
  GLOBAL_KEYS.forEach((key, i) => {
    const target = own[i] as string;
    if (old[key] !== undefined && current[target] === undefined) copy[target] = old[key];
  });
  if (Object.keys(copy).length) await storage.set(copy);
}

async function isEmpty(db: ToolboxDb): Promise<boolean> {
  const counts = await Promise.all(db.tables.map((table) => table.count()));
  return counts.every((count) => count === 0);
}
