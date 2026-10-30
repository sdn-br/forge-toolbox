import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBackupFile } from '../src/backup/import';
import { BACKUP_DELAY, BACKUP_SETTING, BackupCopy } from '../src/content/backup/backup-copy';
import { type CopyEntry, memoryCopyStore } from '../src/content/backup/backup-store';
import { FoundData } from '../src/content/backup/found-data';
import { memoryKv } from '../src/content/core/kv';
import { Settings, toggleDef } from '../src/content/core/settings';
import { backupPersistence } from '../src/persistence/backup/client';
import { battle, copyOf, de20, me, tables } from './helpers/backup';
import { testDb } from './helpers/battle-db';

const DAY = 24 * 60 * 60 * 1000;
/** noon, so a few hours later is the same local day */
const T0 = new Date(2026, 9, 27, 12).getTime();

async function setup(options: { stored?: Record<string, unknown>; copy?: CopyEntry; reading?: () => void } = {}) {
  let time = T0;
  const now = () => time;
  const db = testDb({ now });
  let persisted: (change: number) => void = () => {};
  let change = 0;
  const kv = memoryKv(options.stored);
  const settings = new Settings(kv);
  settings.register(OTHER);
  const store = memoryCopyStore();
  if (options.copy) await store.put(options.copy);
  let reloads = 0;
  const copy = new BackupCopy({
    profile: me,
    name: 'Ich',
    onPersisted: (fn) => {
      persisted = fn;
    },
    settings,
    kv,
    persistence: {
      ...backupPersistence(db.call),
      tables: (world) => {
        options.reading?.();
        return db.call('backup.tables', { world });
      },
    },
    store,
    now,
  });
  const found = new FoundData([copy], () => reloads++);
  await settings.load();
  copy.watch();
  /** the file of the stored copy, unpacked */
  const written = async () => {
    const entry = await store.get(me);
    if (!entry) return undefined;
    const read = await readBackupFile(new Blob([entry.file]));
    return read.ok ? { entry, file: read.backup } : undefined;
  };
  return {
    db,
    /** the service worker signals changed rows, with the next change number or the one given */
    signal: (at = ++change) => persisted(at),
    kv,
    settings,
    store,
    copy,
    found,
    written,
    get reloads() {
      return reloads;
    },
    setTime: (at: number) => {
      time = at;
    },
  };
}

/** lets the timer run out and waits for the write it started */
async function elapse(env: { copy: BackupCopy }, ms = BACKUP_DELAY) {
  await vi.advanceTimersByTimeAsync(ms);
  await env.copy.idle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** a setting besides the backup one, whose change the copy has to notice */
const OTHER = toggleDef({ key: 'x', group: 'settings.core', label: 'settings.recordTraffic', default: false });

describe('writing the backup copy', () => {
  it('tells the found data when the copy was written anew or deleted', async () => {
    const env = await setup();
    let heard = 0;
    env.found.onChanged(() => heard++);
    env.signal();
    await elapse(env);
    expect(heard).toBe(1);
    // the same state again writes nothing, so nothing to tell
    env.signal(1);
    await elapse(env);
    expect(heard).toBe(1);
    await env.settings.of(BACKUP_SETTING).set(false);
    await env.copy.idle();
    await vi.advanceTimersByTimeAsync(0);
    expect(await env.store.get(me)).toBeUndefined();
    expect(heard).toBe(2);
  });

  it('writes the profile as the export does, half a minute after the last change', async () => {
    const env = await setup({ stored: { settings: { a: 1 } } });
    await env.db.db.battles.put(battle(7));
    env.signal();
    await elapse(env, BACKUP_DELAY - 1_000);
    env.signal();
    await elapse(env, BACKUP_DELAY - 1_000);
    expect(await env.store.get(me)).toBeUndefined();
    await elapse(env, 1_000);
    const copy = await env.written();
    expect(copy?.entry.createdAt).toBe(T0);
    expect(copy?.entry.counts).toEqual({ pvp: 1, notes: 0, greatBuildings: 0, settings: 1 });
    expect(copy?.file.profiles).toEqual([
      { world: de20, player: 1, name: 'Ich', settings: { a: 1 }, tables: tables({ battles: [battle(7)] }) },
    ]);
  });

  it('writes after a signal of the service worker or a change of a setting, and not without', async () => {
    const env = await setup();
    await elapse(env);
    expect(await env.store.get(me)).toBeUndefined();
    const changes: (() => void)[] = [
      () => env.signal(),
      () => {
        env.settings.of(OTHER).set(true);
      },
    ];
    for (const [i, change] of changes.entries()) {
      await env.store.delete(me);
      change();
      await elapse(env);
      expect(await env.store.get(me), `change ${i}`).toBeDefined();
    }
  });

  it('writes nothing when the change number is the one of the last copy', async () => {
    const env = await setup();
    await env.db.db.battles.put(battle(7));
    env.signal(5);
    await elapse(env);
    env.setTime(T0 + 60_000);
    env.signal(5);
    await elapse(env);
    expect((await env.store.get(me))?.createdAt).toBe(T0);
  });

  it('writes again when a change came while the rows were read', async () => {
    let reads = 0;
    const env = await setup({ reading: () => reads++ === 0 && env.signal() });
    env.signal();
    await elapse(env);
    expect((await env.store.get(me))?.createdAt).toBe(T0);
    env.setTime(T0 + 60_000);
    await elapse(env);
    expect((await env.store.get(me))?.createdAt).toBe(T0 + 60_000);
  });

  it('switched off deletes the copy of the profile and stops writing; on again writes soon', async () => {
    const env = await setup();
    await env.db.db.battles.put(battle(7));
    env.signal();
    await elapse(env);
    expect(await env.store.get(me)).toBeDefined();
    env.signal();
    await env.settings.of(BACKUP_SETTING).set(false);
    await elapse(env);
    expect(await env.store.get(me)).toBeUndefined();
    env.signal();
    await elapse(env);
    expect(await env.store.get(me)).toBeUndefined();
    await env.settings.of(BACKUP_SETTING).set(true);
    await elapse(env);
    expect(await env.store.get(me)).toBeDefined();
  });

  it('is on by default', async () => {
    const env = await setup();
    expect(env.settings.of(BACKUP_SETTING).get()).toBe(true);
  });
});

describe('the first copy at the start', () => {
  it('is written at once when the profile has none yet', async () => {
    const env = await setup({ stored: { settings: { a: 1 } } });
    await env.db.db.battles.put(battle(7));
    expect(await env.found.start()).toEqual([]);
    await env.copy.idle();
    const copy = await env.written();
    expect(copy?.entry.createdAt).toBe(T0);
    expect(copy?.file.profiles[0]?.tables.battles).toEqual([battle(7)]);
  });

  it('is not written when a copy exists, the setting is off or a found copy waits for an answer', async () => {
    const existing = await setup({ copy: await copyOf({ tables: tables({ battles: [battle(1)] }) }, T0 - DAY) });
    await existing.db.db.battles.put(battle(7));
    await existing.found.start();
    await existing.copy.idle();
    expect((await existing.store.get(me))?.createdAt).toBe(T0 - DAY);

    const off = await setup({ stored: { settings: { [BACKUP_SETTING.key]: false } } });
    await off.found.start();
    await off.copy.idle();
    expect(await off.store.get(me)).toBeUndefined();

    const pending = await setup({ copy: await copyOf({ tables: tables({ battles: [battle(1)] }) }, T0 - DAY) });
    expect(await pending.found.start()).toHaveLength(1);
    await pending.copy.idle();
    expect((await pending.store.get(me))?.createdAt).toBe(T0 - DAY);
  });
});

describe('a found copy at the start', () => {
  const found = () => copyOf({ name: 'Ich', settings: { a: 1 }, tables: tables({ battles: [battle(1)] }) }, T0 - DAY);

  it('is offered when the profile has no data, preselected, and nothing is written until answered', async () => {
    const env = await setup({ copy: await found() });
    const offers = await env.found.start();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.source).toBe('backupCopy');
    expect(offers[0]?.createdAt).toBe(T0 - DAY);
    expect(offers[0]?.choice.counts).toEqual({ pvp: 1, notes: 0, greatBuildings: 0, settings: 1 });
    expect(offers[0]?.choice.checked).toEqual({ pvp: true, notes: false, greatBuildings: false, settings: true });
    await env.db.db.battles.put(battle(9));
    env.signal();
    await elapse(env);
    expect((await env.store.get(me))?.createdAt).toBe(T0 - DAY);
  });

  it('is not offered when the copy holds nothing', async () => {
    const env = await setup({ copy: await copyOf({ name: 'Ich', tables: tables({}) }, T0 - DAY) });
    expect(await env.found.start()).toEqual([]);
  });

  it('is not offered when the profile has only own settings', async () => {
    const env = await setup({ copy: await found(), stored: { settings: { b: 2 } } });
    expect(await env.found.start()).toEqual([]);
  });

  it('preselects the settings only when the profile has none', async () => {
    const env = await setup({ copy: await found(), stored: { settings: { b: 2 } } });
    const [offer] = await env.found.find();
    expect(offer?.choice.checked.settings).toBe(false);
  });

  it('is not offered when the profile has data, and the copy is overwritten', async () => {
    const env = await setup({ copy: await found() });
    await env.db.db.battles.put(battle(5));
    expect(await env.found.start()).toEqual([]);
    env.signal();
    await elapse(env);
    expect((await env.written())?.file.profiles[0]?.tables.battles).toEqual([battle(5)]);
  });

  it('offers nothing without a copy or with a broken one', async () => {
    expect(await (await setup()).found.start()).toEqual([]);
    const broken = { ...(await found()), file: new Uint8Array([1, 2, 3]).buffer };
    expect(await (await setup({ copy: broken })).found.start()).toEqual([]);
  });

  it('takes the chosen areas by merging, the settings when chosen, then reloads and writes again', async () => {
    const env = await setup({ copy: await found() });
    const [offer] = await env.found.start();
    if (!offer) throw new Error('no offer');
    await env.db.db.battles.put(battle(3));
    await env.found.take([{ offer, areas: new Set(['pvp', 'settings']) }]);
    expect((await env.db.db.battles.toArray()).map((b) => b.battleId)).toEqual([1, 3]);
    expect(await env.kv.get('settings')).toEqual({ a: 1 });
    expect(env.reloads).toBe(1);
    env.signal();
    await elapse(env);
    const written = (await env.written())?.file.profiles[0];
    expect(written?.tables.battles.map((b) => b.battleId)).toEqual([1, 3]);
    expect(written?.settings).toEqual({ a: 1 });
  });

  it('after "Nein" never asks again for the profile and lets the copy be overwritten', async () => {
    const env = await setup({ copy: await found() });
    expect(await env.found.start()).toHaveLength(1);
    await env.found.decline(['backupCopy']);
    await env.db.db.battles.put(battle(5));
    env.signal();
    await elapse(env);
    expect((await env.written())?.file.profiles[0]?.tables.battles).toEqual([battle(5)]);
    await env.db.db.battles.clear();
    const next = await setup({ copy: await found(), stored: { 'backup.answer': await env.kv.get('backup.answer') } });
    expect(await next.found.start()).toEqual([]);
  });

  it('after "Später" asks at the next start of another day, also once the profile has data, and holds the copy', async () => {
    const first = await setup({ copy: await found() });
    await first.found.start();
    await first.found.later(['backupCopy']);
    const answer = await first.kv.get('backup.answer');

    const sameDay = await setup({ copy: await found(), stored: { 'backup.answer': answer } });
    sameDay.setTime(T0 + 3 * 60 * 60 * 1000);
    await sameDay.db.db.battles.put(battle(5));
    expect(await sameDay.found.start()).toEqual([]);
    sameDay.signal();
    await elapse(sameDay);
    expect((await sameDay.store.get(me))?.createdAt).toBe(T0 - DAY);

    const nextDay = await setup({ copy: await found(), stored: { 'backup.answer': answer } });
    nextDay.setTime(T0 + DAY);
    await nextDay.db.db.battles.put(battle(5));
    expect(await nextDay.found.start()).toHaveLength(1);
  });

  it('asks again at the next start when the dialog was left open, also once the profile has data', async () => {
    const first = await setup({ copy: await found() });
    await first.found.start();
    const next = await setup({ copy: await found(), stored: { 'backup.answer': await first.kv.get('backup.answer') } });
    await next.db.db.battles.put(battle(5));
    expect(await next.found.start()).toHaveLength(1);
  });

  it('is found by hand also when the profile has data', async () => {
    const env = await setup({ copy: await found() });
    await env.db.db.battles.put(battle(5));
    expect(await env.found.start()).toEqual([]);
    const [offer] = await env.found.find();
    expect(offer?.choice.counts.pvp).toBe(1);
    expect(await (await setup()).found.find()).toEqual([]);
  });

  it('switched off while a copy waits for an answer deletes it and forgets the question', async () => {
    const env = await setup({ copy: await found() });
    await env.found.start();
    await env.settings.of(BACKUP_SETTING).set(false);
    await elapse(env, 0);
    expect(await env.store.get(me)).toBeUndefined();
    expect(await env.kv.get('backup.answer')).toBeNull();
  });
});
