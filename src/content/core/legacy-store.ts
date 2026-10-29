// The databases of the old toolbox live in the IndexedDB of the game page, which the content script shares. They are
// only read: opened without a version, so no upgrade runs, and only when they exist, so none is created. Nothing is
// written or deleted.
import type { LegacyDump, LegacyFound, LegacyVersion } from '../../backup/legacy/types';
import { done } from '../../shared/idb';
import type { PlayerId } from '../../shared/ids';

export interface LegacyStore {
  /** the old toolbox data of the own player: 2.x when it exists, else 1.x, else nothing */
  read(player: PlayerId): Promise<LegacyFound | undefined>;
  /**
   * the version and the row count of each store read, cheap next to `read`; it changes when the old toolbox, still
   * running beside, records more. Undefined without old data.
   */
  fingerprint(player: PlayerId): Promise<string | undefined>;
}

/** the database names of a version, by what they hold */
const NAMES: Record<LegacyVersion, (id: PlayerId) => { main: string; events: string; notes?: string }> = {
  '2.x': (id) => ({
    main: `FoEToolbox2DB_${id}`,
    events: `FoEToolbox2DB_Events_${id}`,
    notes: `FoEToolbox2DB_Notice_${id}`,
  }),
  // 1.x spelled its events database with a small "oe"
  '1.x': (id) => ({ main: `FoEToolboxDB_${id}`, events: `FoeToolboxDB_Events_${id}` }),
};

/** the stores read of each database */
const STORES = { main: ['neighborhoodAttacks', 'players'], events: ['Events'], notes: ['groups', 'items'] } as const;

export function pageLegacyStore(factory: IDBFactory = indexedDB): LegacyStore {
  /** `query` on each named store; a store or a database that is not there gives `none` */
  const each = async <T>(
    names: ReadonlySet<string>,
    name: string,
    stores: readonly string[],
    query: (store: IDBObjectStore) => IDBRequest<T>,
    none: T,
  ): Promise<T[]> => {
    if (!names.has(name)) return stores.map(() => none);
    const request = factory.open(name);
    // only for a database deleted since the listing: aborting keeps it from being created
    request.onupgradeneeded = () => request.transaction?.abort();
    const db = await done(request);
    try {
      return await Promise.all(
        stores.map((store) =>
          db.objectStoreNames.contains(store)
            ? done(query(db.transaction(store, 'readonly').objectStore(store)))
            : Promise.resolve(none),
        ),
      );
    } finally {
      db.close();
    }
  };
  const readAll = (names: ReadonlySet<string>, name: string, stores: readonly string[]) =>
    each<unknown[]>(names, name, stores, (store) => store.getAll(), []);

  /** the names of the databases there and the version of the player's old data, if any */
  const locate = async (player: PlayerId) => {
    const names = new Set((await factory.databases()).map((d) => d.name ?? ''));
    const version = (['2.x', '1.x'] as const).find((v) => names.has(NAMES[v](player).main));
    return { names, version };
  };

  return {
    async fingerprint(player) {
      const { names, version } = await locate(player);
      if (!version) return undefined;
      const { main, events, notes } = NAMES[version](player);
      const counts = await Promise.all([
        each(names, main, STORES.main, (store) => store.count(), 0),
        each(names, events, STORES.events, (store) => store.count(), 0),
        notes ? each(names, notes, STORES.notes, (store) => store.count(), 0) : Promise.resolve([]),
      ]);
      return `${version}:${counts.flat().join(',')}`;
    },
    async read(player) {
      const { names, version } = await locate(player);
      if (!version) return undefined;
      const { main, events, notes } = NAMES[version](player);
      const [[attacks = [], players = []], [eventRows = []], noteRows] = await Promise.all([
        readAll(names, main, STORES.main),
        readAll(names, events, STORES.events),
        notes ? readAll(names, notes, STORES.notes) : Promise.resolve(undefined),
      ]);
      const dump: LegacyDump = { attacks, players, events: eventRows };
      if (noteRows) {
        dump.groups = noteRows[0] ?? [];
        dump.items = noteRows[1] ?? [];
      }
      return { version, dump };
    },
  };
}

/** the store in memory, for tests */
export function memoryLegacyStore(found?: LegacyFound): LegacyStore & { found: LegacyFound | undefined } {
  return {
    found,
    async read() {
      return this.found;
    },
    async fingerprint() {
      const d = this.found?.dump;
      return (
        d &&
        `${this.found?.version}:${[d.attacks, d.players, d.events, d.groups ?? [], d.items ?? []].map((r) => r.length).join(',')}`
      );
    },
  };
}
