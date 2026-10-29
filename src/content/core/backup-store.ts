// The backup copy lives in the IndexedDB of the game page: the content script shares the page origin's storage. If the
// extension loses its data (reinstalled, its storage cleared), the copy is still there and can be taken back.
import type { Area } from '../../backup/merge';
import { done } from '../../shared/idb';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { Profile } from '../../shared/profile';

/** the database on the game page; the game and other extensions see it under this name */
export const BACKUP_DB = 'ForgeToolboxBackup';
const COPIES = 'copies';

/** One profile's copy: the gzipped backup file as the export of just this profile writes it. */
export interface CopyEntry {
  world: WorldId;
  player: PlayerId;
  /** when the copy was written */
  createdAt: number;
  /** rows per area, settings 1 when there are any */
  counts: Record<Area, number>;
  /** the file, `.json.gz` */
  file: ArrayBuffer;
}

export interface CopyStore {
  get(profile: Profile): Promise<CopyEntry | undefined>;
  /** replaces the copy of the entry's profile */
  put(entry: CopyEntry): Promise<void>;
  delete(profile: Profile): Promise<void>;
}

/**
 * The copies in the page's IndexedDB. Each call opens the database and closes it after, so a page script deleting it
 * meanwhile blocks nothing; a write happens at most every half minute.
 */
export function pageCopyStore(factory: IDBFactory = indexedDB): CopyStore {
  const open = () => {
    const request = factory.open(BACKUP_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(COPIES, { keyPath: ['world', 'player'] });
    return done(request);
  };
  const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    try {
      const tx = db.transaction(COPIES, mode);
      const committed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      const result = await done(fn(tx.objectStore(COPIES)));
      await committed;
      return result;
    } finally {
      db.close();
    }
  };
  return {
    get: (p) => run('readonly', (s) => s.get([p.world, p.player]) as IDBRequest<CopyEntry | undefined>),
    put: async (entry) => {
      await run('readwrite', (s) => s.put(entry));
    },
    delete: async (p) => {
      await run('readwrite', (s) => s.delete([p.world, p.player]));
    },
  };
}

/** the store in memory, for tests */
export function memoryCopyStore(): CopyStore & { data: Map<string, CopyEntry> } {
  const data = new Map<string, CopyEntry>();
  const key = (p: Profile) => `${p.world}:${p.player}`;
  return {
    data,
    get: async (p) => data.get(key(p)),
    put: async (entry) => {
      data.set(key(entry), entry);
    },
    delete: async (p) => {
      data.delete(key(p));
    },
  };
}
