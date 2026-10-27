// The databases of the old toolbox live in the IndexedDB of the game page, which the content script shares. They are
// only read: opened without a version, so no upgrade runs, and only when they exist, so none is created. Nothing is
// written or deleted.
import type { LegacyDump, LegacyFound, LegacyVersion } from '../../backup/legacy/types';
import type { PlayerId } from '../../shared/ids';

export interface LegacyStore {
  /** the old toolbox data of the own player: 2.x when it exists, else 1.x, else nothing */
  read(player: PlayerId): Promise<LegacyFound | undefined>;
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

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export function pageLegacyStore(factory: IDBFactory = indexedDB): LegacyStore {
  /** the rows of each named store; a store or a database that is not there has none */
  const readAll = async (names: ReadonlySet<string>, name: string, stores: string[]): Promise<unknown[][]> => {
    if (!names.has(name)) return stores.map(() => []);
    const request = factory.open(name);
    // only for a database deleted since the listing: aborting keeps it from being created
    request.onupgradeneeded = () => request.transaction?.abort();
    const db = await done(request);
    try {
      return await Promise.all(
        stores.map((store) =>
          db.objectStoreNames.contains(store)
            ? done(db.transaction(store, 'readonly').objectStore(store).getAll())
            : Promise.resolve([]),
        ),
      );
    } finally {
      db.close();
    }
  };

  return {
    async read(player) {
      const names = new Set((await factory.databases()).map((d) => d.name ?? ''));
      const version = (['2.x', '1.x'] as const).find((v) => names.has(NAMES[v](player).main));
      if (!version) return undefined;
      const { main, events, notes } = NAMES[version](player);
      const [[attacks = [], players = []], [eventRows = []], noteRows] = await Promise.all([
        readAll(names, main, ['neighborhoodAttacks', 'players']),
        readAll(names, events, ['Events']),
        notes ? readAll(names, notes, ['groups', 'items']) : Promise.resolve(undefined),
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
  };
}
