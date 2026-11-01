import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type ToolboxDb } from '../src/background/db';
import { adoptLegacy, type LocalStorage, SEEN_KEY } from '../src/background/legacy';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { FoughtBattle, Player } from '../src/shared/model';
import { type Profile, profileDbName } from '../src/shared/profile';

const de20 = worldId('de20');
const de10 = worldId('de10');
const first: Profile = { world: de20, player: playerId(1) };
const second: Profile = { world: de20, player: playerId(2) };
const onDe10: Profile = { world: de10, player: playerId(3) };

const battle = (world: typeof de20, battleId: number): FoughtBattle => ({
  world,
  battleId,
  at: 1,
  opponent: playerId(11),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});
const player = (world: typeof de20, id: number): Player => ({
  world,
  id: playerId(id),
  name: `p${id}`,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  relations: { neighbor: true, guildMember: false, friend: false },
  firstSeenAt: 1,
  seenAt: 1,
  source: 'socialList',
});

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const storage: LocalStorage = {
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])),
    set: async (items) => {
      Object.assign(data, structuredClone(items));
    },
    remove: async (keys) => {
      for (const k of keys) delete data[k];
    },
  };
  return { data, storage };
}

const OLD_KEYS = { settings: { a: true }, 'ui.boxes': { pvp: { x: 1 } }, 'ui.prefs': { map: 'grid' } };

async function legacyWith(fill: (db: ToolboxDb) => Promise<unknown>) {
  const db = openDb('forge-toolbox');
  await fill(db);
  db.close();
}

async function adopt(profile: Profile, storage: LocalStorage) {
  const db = openDb(profileDbName(profile));
  await adoptLegacy(profile, db, storage);
  return db;
}

describe('takeover of the old store', () => {
  beforeEach(async () => {
    for (const { name } of await indexedDB.databases()) if (name) await Dexie.delete(name);
  });

  it('moves the rows of the world from every table to the first profile, other worlds stay', async () => {
    await legacyWith(async (db) => {
      await db.battles.bulkPut([battle(de20, 1), battle(de10, 2)]);
      await db.players.bulkPut([player(de20, 11), player(de10, 11)]);
      await db.noteGroups.put({ world: de20, id: 'g', name: 'G', sort: 0 });
      await db.foestatsFetches.put({ world: de20, player: playerId(11), day: '2026-10-26', at: 1, ok: true });
      await db.greatBuildingLists.bulkPut([
        { world: de20, contributionsAt: 5 },
        { world: de10, contributionsAt: 6 },
      ]);
    });
    const { storage } = memoryStorage(OLD_KEYS);

    const db = await adopt(first, storage);

    expect((await db.battles.toArray()).map((b) => b.battleId)).toEqual([1]);
    expect((await db.players.toArray()).map((p) => p.world)).toEqual([de20]);
    expect(await db.noteGroups.count()).toBe(1);
    expect(await db.foestatsFetches.count()).toBe(1);
    expect(await db.greatBuildingLists.toArray()).toEqual([{ world: de20, contributionsAt: 5 }]);
    const legacy = openDb('forge-toolbox');
    expect((await legacy.battles.toArray()).map((b) => b.battleId)).toEqual([2]);
    expect((await legacy.players.toArray()).map((p) => p.world)).toEqual([de10]);
    expect(await legacy.noteGroups.count()).toBe(0);
    expect(await legacy.greatBuildingLists.toArray()).toEqual([{ world: de10, contributionsAt: 6 }]);
    legacy.close();
  });

  it('copies the old settings and boxes when rows moved, and keeps the old keys while the old database lives', async () => {
    await legacyWith((db) => db.battles.bulkPut([battle(de20, 1), battle(de10, 2)]));
    const { data, storage } = memoryStorage({ ...OLD_KEYS, 'ui.prefs:de20:1': { map: 'own' } });

    await adopt(first, storage);

    expect(data).toMatchObject({
      'settings:de20:1': { a: true },
      'ui.boxes:de20:1': { pvp: { x: 1 } },
      // the profile had its own already
      'ui.prefs:de20:1': { map: 'own' },
      ...OLD_KEYS,
    });
    expect(await Dexie.exists('forge-toolbox')).toBe(true);
  });

  it('starts a second profile on the same world empty, with default settings', async () => {
    await legacyWith((db) => db.battles.bulkPut([battle(de20, 1), battle(de10, 2)]));
    const { data, storage } = memoryStorage(OLD_KEYS);
    await adopt(first, storage);

    const db = await adopt(second, storage);

    expect(await db.battles.count()).toBe(0);
    expect(data).not.toHaveProperty('settings:de20:2');
    expect(data).not.toHaveProperty('ui.boxes:de20:2');
  });

  it('copies no settings when no rows moved', async () => {
    await legacyWith((db) => db.battles.put(battle(de10, 2)));
    const { data, storage } = memoryStorage(OLD_KEYS);
    await adopt(first, storage);
    expect(Object.keys(data).filter((k) => k.endsWith(':de20:1'))).toEqual([]);
  });

  it('deletes the old database and the old keys once it is empty', async () => {
    await legacyWith((db) => db.battles.bulkPut([battle(de20, 1), battle(de10, 2)]));
    const { data, storage } = memoryStorage(OLD_KEYS);
    await adopt(first, storage);
    expect(await Dexie.exists('forge-toolbox')).toBe(true);

    await adopt(onDe10, storage);

    expect(await Dexie.exists('forge-toolbox')).toBe(false);
    expect(data).not.toHaveProperty('settings');
    expect(data).not.toHaveProperty('ui.boxes');
    expect(data).not.toHaveProperty('ui.prefs');
    expect(data['settings:de10:3']).toEqual({ a: true });
    expect(data['settings:de20:1']).toEqual({ a: true });
  });

  it('runs once per profile, and a rerun after a stop between copy and mark is harmless', async () => {
    await legacyWith((db) => db.battles.bulkPut([battle(de20, 1), battle(de10, 2)]));
    const { data, storage } = memoryStorage(OLD_KEYS);
    const db = await adopt(first, storage);
    expect(data[SEEN_KEY]).toEqual([profileDbName(first)]);

    // rows that come back into the old database are not taken again once the profile is marked
    await legacyWith((old) => old.battles.put(battle(de20, 3)));
    await adoptLegacy(first, db, storage);
    expect((await db.battles.toArray()).map((b) => b.battleId)).toEqual([1]);

    // without the mark, the same rows are put again under the same keys
    await legacyWith((old) => old.battles.put(battle(de20, 1)));
    delete data[SEEN_KEY];
    await adoptLegacy(first, db, storage);
    expect((await db.battles.toArray()).map((b) => b.battleId)).toEqual([1, 3]);
    expect(data[SEEN_KEY]).toEqual([profileDbName(first)]);
  });

  it('does nothing without an old database, and does not create one', async () => {
    const { data, storage } = memoryStorage();
    const db = await adopt(first, storage);
    expect(await db.battles.count()).toBe(0);
    expect(await Dexie.exists('forge-toolbox')).toBe(false);
    expect(data[SEEN_KEY]).toEqual([profileDbName(first)]);
  });
});
