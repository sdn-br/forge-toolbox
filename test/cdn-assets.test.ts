// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { findForgeScript } from '../src/content/core/forge-script';
import { battleDetails, catalogUnits } from '../src/content/features/shared/battle-details';
import { AssetStore } from '../src/content/stores/assets';
import { CatalogStore } from '../src/content/stores/catalog';
import { battleDetailsView } from '../src/content/ui/battle-details';
import { assetPersistence } from '../src/persistence/assets/client';
import {
  type AssetIndex,
  assetUrl,
  isCdnUrl,
  parseAssetIndex,
  unitClassIconPath,
  unitPortraitPath,
} from '../src/shared/cdn-assets';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { FoughtBattle } from '../src/shared/model';
import { testDb } from './helpers/battle-db';

const SCRIPT = 'https://foede.innogamescdn.com/cache/ForgeHX-0a1b2c.js';
const ROGUE = unitPortraitPath('rogue');
const CHAMPION = unitPortraitPath('EarlyMiddleAge_champion');

/** a few lines in the shape of the game's script, the index after `baseUrl,` */
const source = (index: AssetIndex) => `var a=function(){};x.init(this.baseUrl,${JSON.stringify(index)});var b={c:1};`;

describe('asset index', () => {
  it('reads the paths and hashes after baseUrl up to the first closing brace', () => {
    expect(parseAssetIndex(source({ [ROGUE]: 'abc', [CHAMPION]: 'def' }))).toEqual({
      [ROGUE]: 'abc',
      [CHAMPION]: 'def',
    });
  });

  it('finds nothing in a script without the marker, with garbage after it or with no string hash', () => {
    expect(parseAssetIndex('var a = 1;')).toBeUndefined();
    expect(parseAssetIndex('this.baseUrl,function(){return 1}')).toBeUndefined();
    expect(parseAssetIndex('this.baseUrl,{"a": nope}')).toBeUndefined();
    expect(parseAssetIndex('this.baseUrl,{"a": 1}')).toBeUndefined();
    expect(parseAssetIndex('this.baseUrl,{"a": "b"')).toBeUndefined();
  });

  it('builds the real URL with the hash before the extension under /assets', () => {
    expect(assetUrl('https://foede.innogamescdn.com', ROGUE, 'abc')).toBe(
      'https://foede.innogamescdn.com/assets/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_rogue-abc.jpg',
    );
    expect(assetUrl('https://x.innogamescdn.com', '/a.b/file', 'h')).toBe(
      'https://x.innogamescdn.com/assets/a.b/file-h',
    );
  });

  it('takes only https URLs on the Inno CDN', () => {
    expect(isCdnUrl(SCRIPT)).toBe(true);
    expect(isCdnUrl('http://foede.innogamescdn.com/ForgeHX.js')).toBe(false);
    expect(isCdnUrl('https://innogamescdn.com.evil.example/ForgeHX.js')).toBe(false);
    expect(isCdnUrl('https://de20.forgeofempires.com/ForgeHX.js')).toBe(false);
    expect(isCdnUrl('not a url')).toBe(false);
  });
});

describe('asset index in the service worker', () => {
  const setup = (fetchText: (url: string) => Promise<string>) => {
    const fetch = vi.fn(fetchText);
    const { call, db } = testDb({ fetchText: fetch });
    return { fetch, db, persistence: assetPersistence(call), call };
  };

  it('downloads the script once, keeps its index and answers from the database next time', async () => {
    const { fetch, persistence, db } = setup(async () => source({ [ROGUE]: 'abc' }));
    expect(await persistence.index(SCRIPT)).toEqual({ [ROGUE]: 'abc' });
    expect(await persistence.index(SCRIPT)).toEqual({ [ROGUE]: 'abc' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(SCRIPT);
    expect((await db.assetIndexes.toArray()).map((r) => r.script)).toEqual([SCRIPT]);
  });

  it('reads two calls for the same script at once with one download', async () => {
    const { fetch, persistence } = setup(async () => source({ [ROGUE]: 'abc' }));
    await Promise.all([persistence.index(SCRIPT), persistence.index(SCRIPT)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps only the index of the newest script', async () => {
    const newer = 'https://foede.innogamescdn.com/cache/ForgeHX-ffff.js';
    const { persistence, db } = setup(async (url) => source({ [ROGUE]: url === newer ? 'new' : 'old' }));
    await persistence.index(SCRIPT);
    expect(await persistence.index(newer)).toEqual({ [ROGUE]: 'new' });
    expect((await db.assetIndexes.toArray()).map((r) => r.script)).toEqual([newer]);
  });

  it('refuses a script off the Inno CDN without downloading it', async () => {
    const { fetch, persistence } = setup(async () => source({ [ROGUE]: 'abc' }));
    await expect(persistence.index('https://example.com/ForgeHX-1.js')).rejects.toThrow(/Inno CDN/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('has no index for a script it cannot read or parse, stores nothing and tries again next time', async () => {
    const failing = setup(async () => {
      throw new Error('503');
    });
    expect(await failing.persistence.index(SCRIPT)).toBeUndefined();
    const garbage = setup(async () => 'var a = 1;');
    expect(await garbage.persistence.index(SCRIPT)).toBeUndefined();
    expect(await garbage.persistence.index(SCRIPT)).toBeUndefined();
    expect(garbage.fetch).toHaveBeenCalledTimes(2);
    expect(await garbage.db.assetIndexes.count()).toBe(0);
  });
});

describe('asset store', () => {
  it('resolves paths once the index arrived and tells the boxes to draw again', async () => {
    const bus = createBus();
    const loaded = vi.fn();
    bus.on('assets.loaded', loaded);
    const store = new AssetStore(bus, { index: async () => ({ [ROGUE]: 'abc' }) });
    expect(store.url(ROGUE)).toBeUndefined();
    await store.load(SCRIPT);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(store.url(ROGUE)).toBe(
      'https://foede.innogamescdn.com/assets/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_rogue-abc.jpg',
    );
    expect(store.url(CHAMPION)).toBeUndefined();
  });

  it('stays without images, quietly, when there is no index or the call fails', async () => {
    const bus = createBus();
    const loaded = vi.fn();
    bus.on('assets.loaded', loaded);
    const none = new AssetStore(bus, { index: async () => undefined });
    await none.load(SCRIPT);
    const failing = new AssetStore(bus, {
      index: async () => {
        throw new Error('refused');
      },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await failing.load(SCRIPT);
    log.mockRestore();
    expect(loaded).not.toHaveBeenCalled();
    expect(none.url(ROGUE)).toBeUndefined();
    expect(failing.url(ROGUE)).toBeUndefined();
  });
});

describe('game script on the page', () => {
  it('finds the tag at once or as soon as the page adds it, as an absolute URL', async () => {
    const doc = document.implementation.createHTMLDocument('game');
    const found = findForgeScript(doc, 1000);
    // parsed scripts are not run, so the test environment does not try to load them
    doc.head.insertAdjacentHTML('beforeend', '<script src="https://foede.innogamescdn.com/cache/other.js"></script>');
    await Promise.resolve();
    doc.body.insertAdjacentHTML('beforeend', `<script src="${SCRIPT}"></script>`);
    expect(await found).toBe(SCRIPT);
    expect(await findForgeScript(doc, 1000)).toBe(SCRIPT);
  });

  it('gives up quietly when the tag never comes', async () => {
    vi.useFakeTimers();
    try {
      const doc = document.implementation.createHTMLDocument('game');
      const found = findForgeScript(doc, 1000);
      vi.advanceTimersByTime(1000);
      expect(await found).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

const battle = (...units: [string, number][]): FoughtBattle => ({
  world: worldId('de20'),
  battleId: 1,
  at: 0,
  opponent: playerId(1001),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: units.map(([unitTypeId, endHp]) => ({ unitTypeId, startHp: 10, endHp })) },
  defender: { bonuses: {}, units: [] },
});

describe('unit portraits in the battle details', () => {
  const assets = (...paths: string[]) => ({
    url: (path: string) => (paths.includes(path) ? `https://cdn${path}` : undefined),
  });

  it('gives the units their portrait by type id and the icon of their class, once the index knows them', () => {
    const catalog = new CatalogStore(createBus());
    catalog.setUnitTypes([
      { id: 'EarlyMiddleAge_champion', name: 'Held', unitClass: 'fast' },
      { id: 'rogue', name: 'Agent', unitClass: 'light_melee' },
    ]);
    const known = assets(CHAMPION, unitClassIconPath('fast'));
    const vm = battleDetails(battle(['EarlyMiddleAge_champion', 10], ['rogue', 0], ['unknown_unit', 5]), {
      unit: catalogUnits(catalog, known),
    });
    expect(vm.own.map((u) => [u.image, u.classIcon])).toEqual([
      [`https://cdn${CHAMPION}`, `https://cdn${unitClassIconPath('fast')}`],
      [undefined, undefined],
      [undefined, undefined],
    ]);
    // the portrait does not wait for the catalog
    expect(catalogUnits(new CatalogStore(createBus()), assets(ROGUE))('rogue').image).toBe(`https://cdn${ROGUE}`);
  });

  it('draws the portrait with the class icon on its badge, the name in place of a portrait it does not know', () => {
    const root = document.createElement('div');
    const unit = (id: string) =>
      id === 'unknown_unit'
        ? undefined
        : { name: id, image: `https://cdn/${id}.jpg`, classIcon: 'https://cdn/fast.png' };
    render(
      battleDetailsView(battleDetails(battle(['rogue', 8], ['grenadier', 0], ['unknown_unit', 5]), { unit })),
      root,
    );
    const tiles = [...root.querySelectorAll('.unit-tile')];
    const portrait = (i: number) => tiles[i]?.querySelector('img.unit-img');
    expect(portrait(0)?.getAttribute('src')).toBe('https://cdn/rogue.jpg');
    expect(portrait(0)?.getAttribute('alt')).toBe('');
    expect(portrait(0)?.getAttribute('loading')).toBe('lazy');
    expect(tiles[0]?.querySelector('.unit-class img')?.getAttribute('src')).toBe('https://cdn/fast.png');
    expect(tiles[1]?.classList.contains('dead')).toBe(true);
    expect(portrait(2)).toBeNull();
    expect(tiles[2]?.querySelector('.unit-name')?.textContent).toBe('unknown_unit');
    expect(tiles[2]?.querySelector('.unit-class')).toBeNull();
  });

  it('hides a portrait that does not load', () => {
    const root = document.createElement('div');
    render(
      battleDetailsView(battleDetails(battle(['rogue', 8]), { unit: () => ({ name: 'Agent', image: 'x' }) })),
      root,
    );
    const img = root.querySelector('img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
  });
});
