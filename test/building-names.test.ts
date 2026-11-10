import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { buildingDefLoader } from '../src/content/game/building-def-loader';
import { toBuildingDef, toBuildingFiles } from '../src/content/game/building-defs';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { BuildingDef } from '../src/content/model/catalog';
import {
  type BuildingDefLoader,
  CatalogStore,
  LOAD_DELAY,
  PARALLEL_DOWNLOADS,
  PREFETCH_DELAY,
} from '../src/content/stores/catalog';
import { type BuildingDefId, buildingDefId, playerId, worldId } from '../src/shared/ids';
import type { IncomingAttack, KnownGreatBuilding, Plunder } from '../src/shared/model';
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

describe('building files from the game', () => {
  it('translates only files whose URL the catalog does not have cached', async () => {
    const { world, bus, now, stores } = testStores();
    const loader: BuildingDefLoader = {
      all: async () => [{ def: def(HERO, 'Cached'), url: url(HERO, 'abc') }],
      load: async () => undefined,
      missing: async () => [],
      save: async () => {},
      prune: async () => {},
    };
    const catalog = new CatalogStore(bus, loader);
    await catalog.loadCache();
    const registry = new Ingestion();
    registerGameHandlers(registry, { world, bus, now, ...stores, catalog });
    const add = vi.spyOn(catalog, 'addFromGame');
    const accept = (hash: string) =>
      registry.accept({
        kind: 'meta',
        url: url(HERO, hash),
        response: JSON.stringify(file(HERO, 'From the game')),
        at: 0,
      });
    accept('abc');
    expect(add).not.toHaveBeenCalled();
    accept('new');
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe('building names from the cache and the CDN', () => {
  type Fn = ReturnType<typeof vi.fn>;
  let loader: BuildingDefLoader & { all: Fn; load: Fn; missing: Fn; save: Fn; prune: Fn };
  let catalog: CatalogStore;
  let updated: string[][];
  const OTHER = buildingDefId('P_MultiAge_SummerBonus18');
  const files = (hash = 'abc') => toBuildingFiles(lookup({ [HERO]: url(HERO, hash), [OTHER]: url(OTHER, 'o') }));
  const fromGame = (id: string, hash: string, name = 'From the game') =>
    catalog.addFromGame(def(id, name), { id: buildingDefId(id), url: url(id, hash), json: file(id, name) });
  /** the catalog tells the boxes once per batch, 50 ms after a definition came */
  const BATCH = 60;

  beforeEach(() => {
    vi.useFakeTimers();
    loader = {
      all: vi.fn(async () => []),
      load: vi.fn(async (id: string) => def(id, `Name of ${id}`)),
      missing: vi.fn(async () => []),
      save: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
    };
    const bus = createBus();
    catalog = new CatalogStore(bus, loader);
    updated = [];
    bus.on('catalog.updated', ({ defs }) => updated.push(defs));
  });
  afterEach(() => vi.useRealTimers());

  it('knows the cached names from the start, without asking the service worker per name', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Cached'), url: url(HERO, 'abc') }]);
    await catalog.loadCache();
    catalog.setBuildingFiles(files());
    expect(catalog.buildingName(HERO)).toBe('Cached');
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('drops a cached definition whose file has a new URL and downloads the current one when asked', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Old'), url: url(HERO, 'old') }]);
    await catalog.loadCache();
    catalog.setBuildingFiles(files('new'));
    expect(catalog.buildingName(HERO)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    expect(loader.load).toHaveBeenCalledWith(HERO, url(HERO, 'new'));
    expect(catalog.buildingName(HERO)).toBe(`Name of ${HERO}`);
  });

  it('prunes the database once cache and lookup are both there, in either order', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Old'), url: url(HERO, 'old') }]);
    catalog.setBuildingFiles(files('new'));
    expect(loader.prune).not.toHaveBeenCalled();
    await catalog.loadCache();
    expect(loader.prune).toHaveBeenCalledTimes(1);
    expect(loader.prune).toHaveBeenCalledWith(files('new'));

    const other = new CatalogStore(createBus(), loader);
    loader.prune.mockClear();
    await other.loadCache();
    expect(loader.prune).not.toHaveBeenCalled();
    other.setBuildingFiles(files('new'));
    expect(loader.prune).toHaveBeenCalledTimes(1);
  });

  it('checks the cache against a lookup that came before it', async () => {
    catalog.setBuildingFiles(files('new'));
    loader.all.mockResolvedValue([{ def: def(HERO, 'Old'), url: url(HERO, 'old') }]);
    await catalog.loadCache();
    expect(catalog.get(HERO)).toBeUndefined();
  });

  it('keeps what the game loaded over a stale cached definition', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Old'), url: url(HERO, 'old') }]);
    await catalog.loadCache();
    fromGame(HERO, 'new');
    catalog.setBuildingFiles(files('new'));
    expect(catalog.buildingName(HERO)).toBe('From the game');
  });

  it('does not add a definition again, nor tell the boxes, when the game loads the cached URL', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Cached'), url: url(HERO, 'abc') }]);
    await catalog.loadCache();
    await vi.advanceTimersByTimeAsync(BATCH);
    updated.length = 0;
    const add = vi.spyOn(catalog, 'add');
    fromGame(HERO, 'abc');
    await vi.advanceTimersByTimeAsync(BATCH);
    expect(add).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
  });

  it('caches the files the game loads, together, and only new or changed ones', async () => {
    loader.all.mockResolvedValue([{ def: def(HERO, 'Cached'), url: url(HERO, 'abc') }]);
    await catalog.loadCache();
    fromGame(HERO, 'abc');
    fromGame(OTHER, 'o');
    fromGame('W_New', 'w');
    await vi.advanceTimersByTimeAsync(BATCH);
    expect(loader.save).toHaveBeenCalledTimes(1);
    expect(loader.save.mock.calls[0]?.[0].map((f: { id: string }) => f.id)).toEqual([OTHER, 'W_New']);
    fromGame(OTHER, 'o');
    await vi.advanceTimersByTimeAsync(BATCH);
    expect(loader.save).toHaveBeenCalledTimes(1);
  });

  it('downloads a name it lacks after a pause and tells the boxes', async () => {
    catalog.setBuildingFiles(files());
    expect(catalog.buildingName(HERO)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(LOAD_DELAY - 100);
    expect(loader.load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100 + BATCH);
    expect(loader.load).toHaveBeenCalledWith(HERO, url(HERO, 'abc'));
    expect(updated).toEqual([[HERO]]);
    expect(catalog.buildingName(HERO)).toBe(`Name of ${HERO}`);
  });

  it('does not download what the game loads itself during the pause', async () => {
    catalog.setBuildingFiles(files());
    catalog.buildingName(HERO);
    fromGame(HERO, 'abc');
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    expect(loader.load).not.toHaveBeenCalled();
    expect(catalog.buildingName(HERO)).toBe('From the game');
  });

  it('asks for each id once per session, also when several boxes ask', async () => {
    catalog.setBuildingFiles(files());
    loader.load.mockResolvedValue(undefined);
    catalog.buildingName(HERO);
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(updated).toEqual([]);
  });

  it('downloads the buildings of stored rows the cache lacks in the background, a few at a time', async () => {
    const many = Array.from({ length: 10 }, (_, i) => buildingDefId(`R_Old${i}`));
    const lookupOf = toBuildingFiles(lookup(Object.fromEntries(many.map((id) => [id, url(id, 'h')]))));
    loader.missing.mockResolvedValue([...many, buildingDefId('Not_Listed')]);
    let open = 0;
    let most = 0;
    loader.load.mockImplementation(async (id: string) => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 10));
      open--;
      return def(id, `Name of ${id}`);
    });
    await catalog.loadCache();
    catalog.setBuildingFiles(lookupOf);
    await vi.advanceTimersByTimeAsync(PREFETCH_DELAY - 100);
    expect(loader.missing).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100 + 200);
    expect(loader.missing).toHaveBeenCalledTimes(1);
    expect(loader.load).toHaveBeenCalledTimes(10);
    expect(most).toBe(PARALLEL_DOWNLOADS);
    expect(catalog.buildingName(many[9] as BuildingDefId)).toBe('Name of R_Old9');
  });

  it('prefetches once per session and not before the cache was read', async () => {
    catalog.setBuildingFiles(files());
    await vi.advanceTimersByTimeAsync(PREFETCH_DELAY + BATCH);
    expect(loader.missing).not.toHaveBeenCalled();
    await catalog.loadCache();
    catalog.setBuildingFiles(files());
    await vi.advanceTimersByTimeAsync(PREFETCH_DELAY + BATCH);
    expect(loader.missing).toHaveBeenCalledTimes(1);
  });

  it('waits for the lookup when a name is asked for before it came', async () => {
    catalog.buildingName(HERO);
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
    expect(loader.load).not.toHaveBeenCalled();
    catalog.setBuildingFiles(files());
    await vi.advanceTimersByTimeAsync(LOAD_DELAY + BATCH);
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

  it('keeps the files the game loaded, skips files off the CDN and hands them all back', async () => {
    const { fetch, loader, db } = setup(async () => '{}');
    await loader.save([
      { id: HERO, url: url(HERO, 'abc'), json: file(HERO, 'Hero') },
      { id: buildingDefId('X'), url: 'https://example.com/metadata?id=x-1', json: file('X', 'X') },
    ]);
    expect(await db.buildingDefFiles.count()).toBe(1);
    expect(await loader.all()).toEqual([{ def: def(HERO, 'Hero'), url: url(HERO, 'abc') }]);
    // a cached file needs no download
    expect((await loader.load(HERO, url(HERO, 'abc')))?.name).toBe('Hero');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores the raw file and translates it on the read path, skipping a file that holds no definition', async () => {
    const { call, db } = testDb();
    const loader = buildingDefLoader(call);
    const raw = file(HERO, 'Hero');
    await loader.save([
      { id: HERO, url: url(HERO, 'abc'), json: raw },
      { id: buildingDefId('Junk'), url: url('Junk', 'j'), json: { not: 'a definition' } },
    ]);
    expect((await db.buildingDefFiles.get(HERO))?.json).toEqual(raw);
    expect((await call('buildingDefs.all', {})).files).toHaveLength(2);
    expect(await loader.all()).toEqual([{ def: def(HERO, 'Hero'), url: url(HERO, 'abc') }]);
    expect(await loader.load(buildingDefId('Junk'), url('Junk', 'j'))).toBeUndefined();
  });

  it('deletes the cached files the lookup lacks or lists under another URL', async () => {
    const { loader, db } = setup(async () => '{}');
    const other = buildingDefId('P_Other');
    await loader.save([
      { id: HERO, url: url(HERO, 'abc'), json: file(HERO, 'Hero') },
      { id: other, url: url(other, 'old'), json: file(other, 'Other') },
      { id: buildingDefId('G_Gone'), url: url('G_Gone', 'g'), json: file('G_Gone', 'Gone') },
    ]);
    await loader.prune(
      new Map([
        [HERO, url(HERO, 'abc')],
        [other, url(other, 'new')],
      ]),
    );
    expect(await db.buildingDefFiles.toCollection().primaryKeys()).toEqual([HERO]);
  });

  it('lists the buildings of stored plunders, attacks and great buildings whose file the cache lacks', async () => {
    const { loader, db } = setup(async () => '{}');
    const world = worldId('de10');
    const opponent = playerId(7);
    await db.plunders.bulkPut([
      { world, opponent, at: 1, cityEntityId: HERO } as Plunder,
      { world, opponent, at: 2, cityEntityId: buildingDefId('P_Cached') } as Plunder,
      { world, opponent, at: 3 } as Plunder,
    ]);
    await db.incoming.put({
      world,
      kind: 'plunder',
      key: 1,
      at: 4,
      cityEntityId: buildingDefId('G_Own'),
    } as IncomingAttack);
    await db.greatBuildings.put({
      world,
      owner: opponent,
      entityId: 5,
      cityEntityId: buildingDefId('X_Landmark'),
    } as KnownGreatBuilding);
    await loader.save([{ id: buildingDefId('P_Cached'), url: url('P_Cached', 'c'), json: file('P_Cached', 'C') }]);
    expect((await loader.missing()).sort()).toEqual(['G_Own', HERO, 'X_Landmark']);
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
