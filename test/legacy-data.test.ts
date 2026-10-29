// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegacyFound } from '../src/backup/legacy/types';
import { BackupCopy } from '../src/content/backup/backup-copy';
import { type CopyEntry, memoryCopyStore } from '../src/content/backup/backup-store';
import { FoundData } from '../src/content/backup/found-data';
import { LEGACY_ANSWER, LegacyData } from '../src/content/backup/legacy-data';
import { memoryLegacyStore } from '../src/content/backup/legacy-store';
import { createBus } from '../src/content/core/events';
import { memoryKv } from '../src/content/core/kv';
import { Settings } from '../src/content/core/settings';
import { backupPersistence } from '../src/persistence/backup/client';
import v2 from './fixtures/legacy-toolbox2.json';
import { battle, copyOf, de20, me, tables } from './helpers/backup';
import { testDb } from './helpers/battle-db';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 27, 12).getTime();
/** the first battle of the fixture, against 2001 */
const FIRST = Date.parse('2026-10-18T08:20:10.000Z');

const found = (change: Partial<LegacyFound['dump']> = {}): LegacyFound => ({
  version: '2.x',
  dump: {
    attacks: v2.neighborhoodAttacks,
    players: v2.players,
    events: v2.Events,
    groups: v2.groups,
    items: v2.items,
    ...change,
  },
});

async function setup(options: { legacy?: LegacyFound; copy?: CopyEntry; stored?: Record<string, unknown> } = {}) {
  let time = T0;
  const now = () => time;
  const db = testDb({ now });
  const kv = memoryKv(options.stored);
  const settings = new Settings(kv);
  const store = memoryCopyStore();
  if (options.copy) await store.put(options.copy);
  const legacyStore = memoryLegacyStore(options.legacy);
  let reloads = 0;
  const persistence = backupPersistence(db.call);
  const copy = new BackupCopy({
    profile: me,
    name: 'Ich',
    bus: createBus(),
    settings,
    kv,
    persistence,
    store,
    now,
  });
  const foundData = new FoundData(
    [copy, new LegacyData({ profile: me, kv, persistence, store: legacyStore, now })],
    () => reloads++,
  );
  await settings.load();
  return {
    db,
    kv,
    foundData,
    legacyStore,
    get reloads() {
      return reloads;
    },
    setTime: (at: number) => {
      time = at;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('old toolbox data at the start', () => {
  it('are offered once the profile has data too, with the rows it lacks per area', async () => {
    const env = await setup({ legacy: found() });
    await env.db.db.battles.put({ ...battle(900, 2001), at: FIRST + 60_000 });
    const [offer, ...rest] = await env.foundData.start();
    expect(rest).toEqual([]);
    expect(offer).toMatchObject({
      source: 'legacy',
      version: '2.x',
      choice: {
        counts: { pvp: 7, notes: 7, greatBuildings: 0, settings: 0 },
        checked: { pvp: true, notes: true, greatBuildings: false, settings: false },
      },
    });
  });

  it('come after the backup copy', async () => {
    const env = await setup({ legacy: found(), copy: await copyOf({ tables: tables({ battles: [battle(1)] }) }, T0) });
    expect((await env.foundData.start()).map((o) => o.source)).toEqual(['backupCopy', 'legacy']);
  });

  it('are not offered without old data, or when the profile holds all of it', async () => {
    expect(await (await setup()).foundData.start()).toEqual([]);
    const env = await setup({ legacy: found({ events: [], groups: [], items: [] }) });
    await env.foundData.take(
      await env.foundData
        .start()
        .then((offers) => offers.map((offer) => ({ offer, areas: new Set(['pvp' as const]) }))),
    );
    await env.kv.set(LEGACY_ANSWER, null);
    expect(await env.foundData.start()).toEqual([]);
  });

  it('are not read again while their row counts stay as when they held nothing new', async () => {
    const env = await setup({ legacy: found({ events: [], groups: [], items: [] }) });
    await env.foundData.take(
      await env.foundData
        .start()
        .then((offers) => offers.map((offer) => ({ offer, areas: new Set(['pvp' as const]) }))),
    );
    await env.kv.set(LEGACY_ANSWER, null);
    expect(await env.foundData.start()).toEqual([]);
    const read = vi.spyOn(env.legacyStore, 'read');
    expect(await env.foundData.start()).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    env.legacyStore.found = found();
    expect((await env.foundData.start()).map((o) => o.source)).toEqual(['legacy']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('are not offered after "Nein" or taking, after "Später" only on another day', async () => {
    const no = await setup({ legacy: found() });
    await no.foundData.decline(['legacy']);
    expect(await no.foundData.start()).toEqual([]);

    const taken = await setup({ legacy: found() });
    const [offer] = await taken.foundData.start();
    if (!offer) throw new Error('no offer');
    await taken.foundData.take([{ offer, areas: new Set(['notes']) }]);
    expect(await taken.kv.get(LEGACY_ANSWER)).toEqual({ answer: 'taken' });
    expect(await taken.foundData.start()).toEqual([]);

    const later = await setup({ legacy: found() });
    await later.foundData.later(['legacy']);
    later.setTime(T0 + 3 * 60 * 60 * 1000);
    expect(await later.foundData.start()).toEqual([]);
    later.setTime(T0 + DAY);
    expect((await later.foundData.start()).map((o) => o.source)).toEqual(['legacy']);
  });

  it('logs how many rows the mapper could not map', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await (await setup({ legacy: found() })).foundData.start();
    expect(info).toHaveBeenCalledWith('[Forge Toolbox]', 'old toolbox 2.x: 5 rows could not be mapped and stay out');
  });
});

describe('taking found data', () => {
  it('merges the backup copy first, so the old data leave out what the copy brought', async () => {
    const copied = { ...battle(900, 2001), at: FIRST + 30_000 };
    const env = await setup({ legacy: found(), copy: await copyOf({ tables: tables({ battles: [copied] }) }, T0) });
    const offers = await env.foundData.start();
    // the dialog lists the copy first; the order of the answer does not matter
    await env.foundData.take(offers.reverse().map((offer) => ({ offer, areas: new Set(['pvp' as const]) })));
    const battles = await env.db.db.battles.toArray();
    expect(battles.filter((b) => b.opponent === 2001).map((b) => b.battleId)).toEqual([900]);
    expect(battles).toHaveLength(3);
    expect(env.reloads).toBe(1);
  });

  it('counts a row without any chosen area as "Nein" for its source', async () => {
    const env = await setup({ legacy: found(), copy: await copyOf({ tables: tables({ battles: [battle(1)] }) }, T0) });
    const [copyOffer, legacyOffer] = await env.foundData.start();
    if (!copyOffer || !legacyOffer) throw new Error('no offers');
    await env.foundData.take([
      { offer: copyOffer, areas: new Set(['pvp']) },
      { offer: legacyOffer, areas: new Set() },
    ]);
    expect(await env.kv.get(LEGACY_ANSWER)).toEqual({ answer: 'no' });
    expect(await env.kv.get('backup.answer')).toBeNull();
    expect((await env.db.db.battles.toArray()).map((b) => b.battleId)).toEqual([1]);
  });

  it('answers "Nein" and "Später" only for the sources shown', async () => {
    const env = await setup({ legacy: found(), stored: { 'backup.answer': { answer: 'open' } } });
    await env.foundData.decline(['legacy']);
    expect(await env.kv.get('backup.answer')).toEqual({ answer: 'open' });
    await env.foundData.later(['legacy']);
    expect(await env.kv.get('backup.answer')).toEqual({ answer: 'open' });
    expect(await env.kv.get(LEGACY_ANSWER)).toEqual({ answer: 'later', at: T0 });
  });
});

describe('"Gefundene Daten übernehmen"', () => {
  it('lists the old data whatever was answered, also when the profile holds all of it', async () => {
    const env = await setup({ legacy: found({ attacks: [], events: [], groups: [], items: [] }) });
    await env.foundData.decline(['legacy']);
    const offers = await env.foundData.find();
    expect(offers.map((o) => [o.source, o.choice.counts.pvp, o.choice.counts.notes])).toEqual([['legacy', 0, 0]]);
    expect(offers[0]?.choice.profile.world).toBe(de20);
  });
});
