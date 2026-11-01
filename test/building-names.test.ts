import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { toBuildingDef, toBuildingFiles } from '../src/content/game/building-defs';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { BuildingDef } from '../src/content/model/catalog';
import { type BuildingDefLoader, CatalogStore, LOAD_DELAY } from '../src/content/stores/catalog';
import { buildingDefLoader } from '../src/persistence/building-defs/client';
import { buildingDefId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';
import { testStores } from './helpers/stores';

const HERO = buildingDefId('R_MultiAge_HeroBonus22pass');
const CDN = 'https://foede.innogamescdn.com/start/metadata?id=';
const url = (id: string, hash: string) => `${CDN}building_entity_${id}-${hash}`;

/** the start of a definition file, enough for its name */
const file = (id: string, name: string) => ({ id, name, type: 'residential', width: 2, length: 2 });
const def = (id: string, name: string) => toBuildingDef(file(id, name)) as BuildingDef;

/** the lookup in the shape the game loads it (seen 2026-11-01) */
const lookup = (entries: Record<string, string>) =>
  Object.entries(entries).map(([id, u]) => ({ identifier: `building_entity_${id}`, url: u, __class__: 'StaticData' }));

describe('building lookup', () => {
  it('maps each definition id to the URL of its file and skips entries in another shape', () => {
    const files = toBuildingFiles([
      ...lookup({ [HERO]: url(HERO, 'abc') }),
      { identifier: 'something_else', url: 'x' },
      { identifier: 'building_entity_X' },
      'garbage',
    ]);
    expect([...files]).toEqual([[HERO, url(HERO, 'abc')]]);
  });

  it('reaches the catalog through the game handlers', () => {
    const ingestion = new Ingestion();
    const { world, bus, now, stores } = testStores();
    registerGameHandlers(ingestion, { world, bus, now, ...stores });
    const set = vi.spyOn(stores.catalog, 'setBuildingFiles');
    const add = vi.spyOn(stores.catalog, 'add');
    const json = JSON.stringify(lookup({ [HERO]: url(HERO, 'abc') }));
    ingestion.accept({ kind: 'meta', url: `${CDN}building_entity_lookup-ff`, response: json, at: 0 });
    expect(set).toHaveBeenCalledWith(new Map([[HERO, url(HERO, 'abc')]]));
    // the lookup itself is no definition
    expect(add).not.toHaveBeenCalled();
  });
});

describe('building names from the CDN', () => {
  let loader: BuildingDefLoader & { load: ReturnType<typeof vi.fn> };
  let catalog: CatalogStore;
  let updated: string[][];

  beforeEach(() => {
    vi.useFakeTimers();
    loader = { load: vi.fn(async (id: string) => def(id, `Name of ${id}`)) };
    const bus = createBus();
    catalog = new CatalogStore(bus, loader);
    updated = [];
    bus.on('catalog.updated', ({ defs }) => updated.push(defs));
  });
  afterEach(() => vi.useRealTimers());

  it('loads a name the game has not loaded, after a pause, and tells the boxes', async () => {
    catalog.setBuildingFiles(toBuildingFiles(lookup({ [HERO]: url(HERO, 'abc') })));
    expect(catalog.buildingName(HERO)).toBeUndefined();
    expect(loader.load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    expect(loader.load).toHaveBeenCalledWith(HERO, url(HERO, 'abc'));
    expect(updated).toEqual([[HERO]]);
    expect(catalog.buildingName(HERO)).toBe(`Name of ${HERO}`);
  });

  it('does not load what the game loads itself during the pause', async () => {
    catalog.setBuildingFiles(toBuildingFiles(lookup({ [HERO]: url(HERO, 'abc') })));
    catalog.buildingName(HERO);
    catalog.add(def(HERO, 'From the game'));
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    expect(loader.load).not.toHaveBeenCalled();
    expect(catalog.buildingName(HERO)).toBe('From the game');
  });

  it('asks for each id once per session, also when several boxes ask', async () => {
    catalog.setBuildingFiles(toBuildingFiles(lookup({ [HERO]: url(HERO, 'abc') })));
    loader.load.mockResolvedValue(undefined);
    catalog.buildingName(HERO);
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(updated).toEqual([]);
  });

  it('waits for the lookup when a name is asked for before it came', async () => {
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    expect(loader.load).not.toHaveBeenCalled();
    catalog.setBuildingFiles(toBuildingFiles(lookup({ [HERO]: url(HERO, 'abc') })));
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + 100);
    expect(loader.load).toHaveBeenCalledWith(HERO, url(HERO, 'abc'));
  });
});

describe('building definition files in the service worker', () => {
  const setup = (fetchText: (url: string) => Promise<string>) => {
    const fetch = vi.fn(fetchText);
    const { call, db } = testDb({ fetchText: fetch });
    return { fetch, db, loader: buildingDefLoader(call) };
  };

  it('downloads a file once and answers from the database next time', async () => {
    const { fetch, loader, db } = setup(async () => JSON.stringify(file(HERO, 'Hero')));
    expect((await loader.load(HERO, url(HERO, 'abc')))?.name).toBe('Hero');
    expect((await loader.load(HERO, url(HERO, 'abc')))?.name).toBe('Hero');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.buildingDefFiles.count()).toBe(1);
  });

  it('downloads again when the hash in the URL changed and keeps only the newer file', async () => {
    const { fetch, loader, db } = setup(async (u) => JSON.stringify(file(HERO, u.endsWith('new') ? 'New' : 'Old')));
    await loader.load(HERO, url(HERO, 'old'));
    expect((await loader.load(HERO, url(HERO, 'new')))?.name).toBe('New');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await db.buildingDefFiles.toArray()).map((r) => r.url)).toEqual([url(HERO, 'new')]);
  });

  it('refuses a URL off the Inno CDN without downloading it', async () => {
    const { fetch, loader } = setup(async () => '{}');
    await expect(loader.load(HERO, 'https://example.com/metadata?id=x-1')).rejects.toThrow(/Inno CDN/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('has nothing for a file it cannot read or parse, stores nothing and tries again next time', async () => {
    const garbage = setup(async () => 'not json');
    expect(await garbage.loader.load(HERO, url(HERO, 'abc'))).toBeUndefined();
    expect(await garbage.loader.load(HERO, url(HERO, 'abc'))).toBeUndefined();
    expect(garbage.fetch).toHaveBeenCalledTimes(2);
    expect(await garbage.db.buildingDefFiles.count()).toBe(0);
  });
});
