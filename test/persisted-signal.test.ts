import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/background/db';
import {
  folderAlarm,
  PersistedSignal,
  ProfileTabs,
  profileOfFolderAlarm,
  watchBackupTables,
} from '../src/background/persisted';
import { collectTables } from '../src/backup/collect';
import { BACKUP_CHANGES } from '../src/backup/format';
import { buildingDefId, eraId, playerId } from '../src/shared/ids';
import type { KnownGreatBuilding, Player } from '../src/shared/model';
import type { Profile } from '../src/shared/profile';
import { battle, de20, me } from './helpers/backup';

let dbCount = 0;

const player = (id: number, change: Partial<Player> = {}): Player => ({
  world: de20,
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
  ...change,
});
const building = (change: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: de20,
  owner: playerId(2),
  entityId: 1,
  cityEntityId: buildingDefId('X_Arc'),
  level: 10,
  invested: 0,
  required: 100,
  seenAt: 1,
  ...change,
});
const contribution = { rank: 1, forgePoints: 10, reward: 5, at: 1 };

/** a database with the hooks of the signal, and the number of changes they counted */
function watched() {
  const db = openDb(`persisted-${++dbCount}`);
  let changes = 0;
  watchBackupTables(db, () => changes++);
  return {
    db,
    /** the changes counted since the last call */
    counted: () => {
      const n = changes;
      changes = 0;
      return n;
    },
  };
}

describe('the rules which writes of the export tables count', () => {
  it('name every table of the export, and only tables of the database', async () => {
    const db = openDb(`persisted-${++dbCount}`);
    const exported = Object.keys(await collectTables(db, de20, 0)).sort();
    expect(Object.keys(BACKUP_CHANGES).sort()).toEqual(exported);
    const tables = db.tables.map((t) => t.name);
    for (const name of exported) expect(tables).toContain(name);
  });
});

describe('the hooks on the export tables', () => {
  it('count every write of a table without a field rule, but not a write that stores the same', async () => {
    const { db, counted } = watched();
    await db.battles.put(battle(1));
    expect(counted()).toBe(1);
    await db.battles.put(battle(1));
    expect(counted()).toBe(0);
    await db.battles.put({ ...battle(1), rounds: 2 });
    expect(counted()).toBe(1);
    await db.battles.where('at').below(10).delete();
    expect(counted()).toBe(1);
    await db.table('battles').bulkDelete([[de20, 99]]);
    expect(counted()).toBe(0);
  });

  it('count a player only when its marks change', async () => {
    const { db, counted } = watched();
    await db.players.put(player(2));
    await db.players.put(player(2, { name: 'again', seenAt: 2 }));
    expect(counted()).toBe(0);
    await db.players.put(player(2, { marked: true, marksAt: 3 }));
    expect(counted()).toBe(1);
    await db.players.put(player(2, { marksAt: 4 }));
    expect(counted()).toBe(1);
    await db.players.put(player(3, { ignored: true, marksAt: 5 }));
    expect(counted()).toBe(1);
    await db.table('players').delete([de20, playerId(3)]);
    expect(counted()).toBe(1);
    await db.table('players').delete([de20, playerId(2)]);
    await db.players.put(player(4));
    await db.table('players').delete([de20, playerId(4)]);
    expect(counted()).toBe(1);
  });

  it('count a great building only when its marks or the own contribution change', async () => {
    const { db, counted } = watched();
    await db.greatBuildings.put(building());
    await db.greatBuildings.put(building({ invested: 50, rankings: [], seenAt: 2 }));
    await db.greatBuildings.delete([de20, playerId(2), 1]);
    expect(counted()).toBe(0);
    await db.greatBuildings.put(building({ ownContribution: true, contribution }));
    expect(counted()).toBe(1);
    await db.greatBuildings.put(
      building({ ownContribution: true, contribution: { ...contribution, forgePoints: 20 } }),
    );
    expect(counted()).toBe(1);
    await db.greatBuildings.put(
      building({ ownContribution: true, contribution: { ...contribution, forgePoints: 20 } }),
    );
    expect(counted()).toBe(0);
    await db.greatBuildings.put(building({ ownContribution: true, marked: true, marksAt: 3 }));
    expect(counted()).toBe(1);
  });

  it('do not count writes of tables outside the export', async () => {
    const { db, counted } = watched();
    await db.foestatsFetches.put({ world: de20, player: playerId(2), day: '2026-10-29', at: 1, ok: true });
    await db.greatBuildingLists.put({ world: de20, contributionsAt: 1 });
    expect(counted()).toBe(0);
  });
});

describe('the signal of the service worker', () => {
  const other: Profile = { world: de20, player: playerId(2) };
  let time = 1000;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    time = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const notified: [number, number][] = [];
    const due: number[] = [];
    const signal = new PersistedSignal({
      now: () => time,
      notify: (profile, change) => notified.push([profile.player, change]),
      folderDue: (profile) => due.push(profile.player),
    });
    return { signal, notified, due };
  }

  it('tells the tab and the folder once per burst of writes, with the change number after it', async () => {
    const { signal, notified, due } = setup();
    signal.rowsChanged(me);
    signal.rowsChanged(me);
    signal.rowsChanged(other);
    expect(notified).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toEqual([
      [1, 1002],
      [2, 1001],
    ]);
    expect(due).toEqual([1, 2]);
  });

  it('makes only the folder due when settings changed, the tab has its own', async () => {
    const { signal, notified, due } = setup();
    signal.settingsChanged(me);
    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toEqual([]);
    expect(due).toEqual([1]);
    signal.settingsChanged(me);
    signal.rowsChanged(me);
    await vi.advanceTimersByTimeAsync(0);
    expect(notified).toEqual([[1, 1003]]);
  });

  it('keeps the change number rising when the service worker starts anew', () => {
    const { signal } = setup();
    signal.rowsChanged(me);
    signal.rowsChanged(me);
    const before = signal.current(me);
    time = 5000;
    const restarted = setup().signal;
    expect(restarted.current(me)).toBeGreaterThan(before);
    restarted.rowsChanged(me);
    expect(restarted.current(me)).toBe(5001);
  });
});

describe('the game tab of a profile', () => {
  it('is the tab its calls came from, until closed or showing another profile', () => {
    const tabs = new ProfileTabs();
    const other: Profile = { world: de20, player: playerId(2) };
    tabs.seen(me, 1);
    tabs.seen(me, 2);
    tabs.seen(other, 3);
    tabs.seen(me, undefined);
    expect(tabs.of(me)).toEqual([1, 2]);
    tabs.forget(1);
    tabs.seen(other, 2);
    expect(tabs.of(me)).toEqual([]);
    expect(tabs.of(other)).toEqual([2, 3]);
  });
});

describe('the alarm that writes the backup folder', () => {
  it('names the profile, and nothing else is one', () => {
    expect(folderAlarm(me)).toBe('folder:de20:1');
    expect(profileOfFolderAlarm(folderAlarm(me))).toEqual(me);
    expect(profileOfFolderAlarm('other:de20:1')).toBeNull();
  });
});
