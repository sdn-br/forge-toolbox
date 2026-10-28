import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { type MemoryFolder, memoryFolder } from '../src/backup/folder';
import { FOLDER_STATUS, FolderBackup, type FolderStatus } from '../src/backup/folder-backup';
import { DAILY_FOLDER, dailyFileName, folderFileName } from '../src/backup/folder-files';
import { BACKUP_FORMAT, type BackupFile, type BackupProfile } from '../src/backup/format';
import { gzipJson } from '../src/backup/gzip';
import { readBackupFile } from '../src/backup/import';
import { playerId, worldId } from '../src/shared/ids';
import { type Profile, profileDbName } from '../src/shared/profile';
import { battle, me, tables } from './helpers/backup';

const DAY = 24 * 60 * 60 * 1000;
/** noon, so a few hours later is the same local day */
const T0 = new Date(2026, 9, 28, 12).getTime();
const other: Profile = { world: worldId('us1'), player: playerId(7) };

let run = 0;

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, structuredClone(items));
    },
  };
}

function setup(options: { folder?: MemoryFolder | null; local?: Record<string, unknown>; profiles?: Profile[] } = {}) {
  let time = T0;
  const prefix = `folder-${++run}-`;
  const folder = options.folder === null ? undefined : (options.folder ?? memoryFolder());
  const local = memoryStorage(options.local);
  const session = memoryStorage();
  const errors: string[] = [];
  const open = (name: string) => openDb(`${prefix}${name}`);
  const backup = new FolderBackup({
    folder: async () => folder,
    open,
    local,
    session,
    localProfiles: async () => options.profiles ?? [me],
    now: () => time,
    logError: (what) => errors.push(what),
  });
  /** the profile's database, for arranging rows; close it after */
  const db = (profile: Profile = me) => open(profileDbName(profile));
  return {
    backup,
    folder: folder as MemoryFolder,
    local,
    db,
    errors,
    status: () => local.data[FOLDER_STATUS] as FolderStatus | undefined,
    setTime: (at: number) => {
      time = at;
    },
  };
}

async function fileOf(entry: BackupProfile, createdAt = T0 - DAY): Promise<Blob> {
  return gzipJson({ format: BACKUP_FORMAT, version: 2, createdAt, profiles: [entry] } satisfies BackupFile);
}

async function readFolderFile(folder: MemoryFolder, name: string): Promise<BackupFile | undefined> {
  const blob = folder.data.get(name);
  if (!blob) return undefined;
  const read = await readBackupFile(blob);
  return read.ok ? read.backup : undefined;
}

async function battleIds(db: ReturnType<typeof openDb>) {
  const ids = (await db.battles.toArray()).map((b) => b.battleId);
  db.close();
  return ids;
}

describe('writing the backup folder', () => {
  it('writes the profile as its export does, and the copy of the day', async () => {
    const env = setup({ local: { 'settings:de20:1': { a: 1 }, 'profile:de20:1': { name: 'Ich', seenAt: 1 } } });
    const db = env.db();
    await db.battles.put(battle(7));
    db.close();

    expect(await env.backup.changed(me)).toBe('written');

    const file = await readFolderFile(env.folder, folderFileName(me));
    expect(file?.createdAt).toBe(T0);
    expect(file?.profiles).toEqual([
      { ...me, name: 'Ich', settings: { a: 1 }, tables: tables({ battles: [battle(7)], players: [] }) },
    ]);
    const daily = env.folder.folders.get(DAILY_FOLDER);
    expect([...(daily?.data.keys() ?? [])]).toEqual([dailyFileName(me, T0)]);
    expect(env.status()).toEqual({ lastWrite: T0, paused: false, pending: [] });
  });

  it('skips a write that would store the same, and overwrites the copy of the day on a change', async () => {
    const env = setup();
    await env.backup.changed(me);
    env.setTime(T0 + 1000);
    expect(await env.backup.changed(me)).toBe('unchanged');

    const db = env.db();
    await db.battles.put(battle(8));
    db.close();
    expect(await env.backup.changed(me)).toBe('written');
    const daily = env.folder.folders.get(DAILY_FOLDER) as MemoryFolder;
    expect(daily.data.size).toBe(1);
    expect((await readFolderFile(daily, dailyFileName(me, T0)))?.createdAt).toBe(T0 + 1000);
  });

  it('keeps the copies of the last seven days', async () => {
    const env = setup();
    for (let day = 0; day < 9; day++) {
      env.setTime(T0 + day * DAY);
      const db = env.db();
      await db.battles.put(battle(day + 1));
      db.close();
      await env.backup.changed(me);
    }
    const daily = env.folder.folders.get(DAILY_FOLDER) as MemoryFolder;
    expect([...daily.data.keys()].sort()).toEqual(
      [2, 3, 4, 5, 6, 7, 8].map((day) => dailyFileName(me, T0 + day * DAY)),
    );
  });

  it('does nothing without a chosen folder', async () => {
    const env = setup({ folder: null });
    expect(await env.backup.changed(me)).toBe('none');
    expect(env.status()).toBeUndefined();
  });
});

describe('the first write of a session', () => {
  it('merges the main file and the conflict copies, writes anew and deletes the copies', async () => {
    const folder = memoryFolder();
    folder.data.set(folderFileName(me), await fileOf({ ...me, tables: tables({ battles: [battle(1)] }) }));
    folder.data.set(
      'forge-toolbox-de20-1-PC2.json.gz',
      await fileOf({ ...me, settings: { b: 2 }, tables: tables({ battles: [battle(2)] }) }),
    );
    folder.data.set('forge-toolbox-de20-12.json.gz', await fileOf({ ...me, player: playerId(12), tables: tables() }));
    const env = setup({ folder });
    const db = env.db();
    await db.battles.put(battle(3));
    db.close();

    expect(await env.backup.start(me)).toBe('written');

    expect(await battleIds(env.db())).toEqual([1, 2, 3]);
    expect(env.local.data['settings:de20:1']).toEqual({ b: 2 });
    expect([...folder.data.keys()].sort()).toEqual([folderFileName(me), 'forge-toolbox-de20-12.json.gz']);
    const written = await readFolderFile(folder, folderFileName(me));
    expect(written?.profiles[0]?.tables.battles.map((b) => b.battleId)).toEqual([1, 2, 3]);
  });

  it('keeps the own settings, a file brings settings only to a profile without', async () => {
    const folder = memoryFolder();
    folder.data.set(folderFileName(me), await fileOf({ ...me, settings: { b: 2 }, tables: tables() }));
    const env = setup({ folder, local: { 'settings:de20:1': { a: 1 } } });
    await env.backup.start(me);
    expect(env.local.data['settings:de20:1']).toEqual({ a: 1 });
  });

  it('leaves a copy it cannot read', async () => {
    const folder = memoryFolder();
    folder.data.set('forge-toolbox-de20-1-PC2.json.gz', new Blob(['broken']));
    const env = setup({ folder });
    await env.backup.start(me);
    expect(folder.data.has('forge-toolbox-de20-1-PC2.json.gz')).toBe(true);
    expect(env.errors).toEqual(['reading forge-toolbox-de20-1-PC2.json.gz from the backup folder failed']);
  });

  it('merges before the first write after a change, then only writes', async () => {
    const folder = memoryFolder();
    const env = setup({ folder });
    folder.data.set(folderFileName(me), await fileOf({ ...me, tables: tables({ battles: [battle(1)] }) }));
    await env.backup.changed(me);
    expect(await battleIds(env.db())).toEqual([1]);

    folder.data.set(
      'forge-toolbox-de20-1-PC2.json.gz',
      await fileOf({ ...me, tables: tables({ battles: [battle(2)] }) }),
    );
    const db = env.db();
    await db.battles.put(battle(3));
    db.close();
    await env.backup.changed(me);
    expect(await battleIds(env.db())).toEqual([1, 3]);
    expect(folder.data.has('forge-toolbox-de20-1-PC2.json.gz')).toBe(true);
  });
});

describe('a folder without permission', () => {
  it('pauses and remembers the profile, then writes it once granted', async () => {
    const folder = memoryFolder();
    folder.granted = 'prompt';
    const env = setup({ folder });
    expect(await env.backup.start(me)).toBe('paused');
    expect(folder.data.size).toBe(0);
    expect(env.status()).toEqual({ paused: true, pending: [me] });

    folder.granted = 'granted';
    expect(await env.backup.granted()).toEqual([]);
    expect(folder.data.has(folderFileName(me))).toBe(true);
    expect(env.status()).toEqual({ lastWrite: T0, paused: false, pending: [] });
  });

  it('pauses when the folder refuses the write', async () => {
    const folder = memoryFolder();
    folder.write = async () => {
      throw new DOMException('no', 'NotAllowedError');
    };
    const env = setup({ folder });
    expect(await env.backup.changed(me)).toBe('paused');
    expect(env.status()?.paused).toBe(true);
  });

  it('names the profiles whose rows the merge changed, for the open game tabs', async () => {
    const folder = memoryFolder();
    folder.granted = 'prompt';
    const env = setup({ folder });
    await env.backup.changed(me);
    folder.granted = 'granted';
    folder.data.set(folderFileName(me), await fileOf({ ...me, tables: tables({ battles: [battle(1)] }) }));
    expect(await env.backup.granted()).toEqual([me]);
  });
});

describe('choosing a folder', () => {
  it('merges every profile found, also one new here, and writes the local ones', async () => {
    const folder = memoryFolder();
    folder.data.set(
      folderFileName(other),
      await fileOf({ ...other, name: 'Du', tables: tables({ battles: [{ ...battle(5), world: other.world }] }) }),
    );
    folder.data.set('forge-toolbox-backup-2026-10-26.json.gz', await fileOf({ ...me, tables: tables() }));
    const env = setup({ folder, profiles: [me] });

    expect(await env.backup.chosen()).toEqual([other]);

    expect(await battleIds(env.db(other))).toEqual([5]);
    expect(env.local.data['profile:us1:7']).toEqual({ name: 'Du', seenAt: T0 - DAY });
    expect([...folder.data.keys()].sort()).toEqual([
      'forge-toolbox-backup-2026-10-26.json.gz',
      folderFileName(me),
      folderFileName(other),
    ]);
  });

  it('skips a file that only looks like a profile', async () => {
    const folder = memoryFolder();
    folder.data.set('forge-toolbox-de20-99.json.gz', await fileOf({ ...me, tables: tables() }));
    const env = setup({ folder, profiles: [] });
    expect(await env.backup.chosen()).toEqual([]);
    expect([...folder.data.keys()]).toEqual(['forge-toolbox-de20-99.json.gz']);
  });
});
