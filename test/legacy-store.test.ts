import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { pageLegacyStore } from '../src/content/core/legacy-store';
import { playerId } from '../src/shared/ids';
import v1 from './fixtures/legacy-toolbox1.json';
import v2 from './fixtures/legacy-toolbox2.json';

const ME = playerId(1001);

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** a database as the old toolbox left it: its version, stores and rows */
async function create(
  factory: IDBFactory,
  name: string,
  version: number,
  stores: Record<string, { keyPath: string; rows: unknown[] }>,
) {
  const request = factory.open(name, version);
  request.onupgradeneeded = () => {
    for (const [store, { keyPath }] of Object.entries(stores))
      request.result.createObjectStore(store, { keyPath, autoIncrement: keyPath === 'id' });
  };
  const db = await done(request);
  for (const [store, { rows }] of Object.entries(stores)) {
    const tx = db.transaction(store, 'readwrite');
    for (const row of rows) tx.objectStore(store).put(row);
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  }
  db.close();
}

const databases = async (factory: IDBFactory) =>
  (await factory.databases()).map((d) => `${d.name} v${d.version}`).sort();

async function withToolbox2(factory: IDBFactory, id = 1001) {
  await create(factory, `FoEToolbox2DB_${id}`, 30, {
    neighborhoodAttacks: { keyPath: 'id', rows: v2.neighborhoodAttacks },
    players: { keyPath: 'id', rows: v2.players },
    pvpActions: { keyPath: 'id', rows: [] },
  });
  await create(factory, `FoEToolbox2DB_Events_${id}`, 20, { Events: { keyPath: 'eventid', rows: v2.Events } });
  await create(factory, `FoEToolbox2DB_Notice_${id}`, 10, {
    groups: { keyPath: 'id', rows: v2.groups },
    items: { keyPath: 'id', rows: v2.items },
  });
}

async function withToolbox1(factory: IDBFactory) {
  await create(factory, 'FoEToolboxDB_1001', 20, {
    neighborhoodAttacks: { keyPath: 'id', rows: v1.neighborhoodAttacks },
    players: { keyPath: 'id', rows: v1.players },
  });
  await create(factory, 'FoeToolboxDB_Events_1001', 20, { Events: { keyPath: 'eventid', rows: v1.Events } });
}

describe('pageLegacyStore', () => {
  it('reads the 2.x databases of the own player and hides 1.x', async () => {
    const factory = new IDBFactory();
    await withToolbox2(factory);
    await withToolbox1(factory);
    await withToolbox2(factory, 1002);
    const found = await pageLegacyStore(factory).read(ME);
    expect(found?.version).toBe('2.x');
    expect(found?.dump.attacks).toHaveLength(v2.neighborhoodAttacks.length);
    expect(found?.dump.players).toHaveLength(v2.players.length);
    expect(found?.dump.events).toHaveLength(v2.Events.length);
    expect(found?.dump.groups).toHaveLength(v2.groups.length);
    expect(found?.dump.items).toHaveLength(v2.items.length);
  });

  it('reads 1.x when there is no 2.x', async () => {
    const factory = new IDBFactory();
    await withToolbox1(factory);
    const found = await pageLegacyStore(factory).read(ME);
    expect(found?.version).toBe('1.x');
    expect(found?.dump.attacks).toHaveLength(v1.neighborhoodAttacks.length);
    expect(found?.dump.events).toHaveLength(v1.Events.length);
    expect(found?.dump.groups).toBeUndefined();
  });

  it('finds nothing without databases of the own player', async () => {
    const factory = new IDBFactory();
    await withToolbox2(factory, 1002);
    expect(await pageLegacyStore(factory).read(ME)).toBeUndefined();
  });

  it('changes nothing: no upgrade, no database created, nothing deleted', async () => {
    const factory = new IDBFactory();
    // the main database alone, without events and notes
    await create(factory, 'FoEToolbox2DB_1001', 30, {
      neighborhoodAttacks: { keyPath: 'id', rows: v2.neighborhoodAttacks },
    });
    const before = await databases(factory);
    const found = await pageLegacyStore(factory).read(ME);
    expect(found?.dump).toMatchObject({ players: [], events: [], groups: [], items: [] });
    expect(found?.dump.attacks).toHaveLength(v2.neighborhoodAttacks.length);
    expect(await databases(factory)).toEqual(before);
  });
});
