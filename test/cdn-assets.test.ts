// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { findForgeScript } from '../src/content/core/forge-script';
import { battleDetails, catalogUnits, unitPortrait } from '../src/content/features/shared/battle-details';
import { AssetStore } from '../src/content/stores/assets';
import { CatalogStore } from '../src/content/stores/catalog';
import { battleDetailsView } from '../src/content/ui/battle-details';
import { assetPersistence } from '../src/persistence/assets/client';
import { type AssetIndex, assetUrl, isCdnUrl, parseAssetIndex, unitPortraitPath } from '../src/shared/cdn-assets';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { FoughtBattle } from '../src/shared/model';
import { testDb } from './helpers/battle-db';

const SCRIPT = 'https://foede.innogamescdn.com/cache/ForgeHX-0a1b2c.js';
const ROGUE = unitPortraitPath('rogue');
const CHAMPION = unitPortraitPath('bronzeage_champion');

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

  it('takes the portrait of the asset name first, then of the type id, else none', () => {
    expect(
      unitPortrait(
        assets(CHAMPION, unitPortraitPath('EarlyMiddleAge_champion')),
        'EarlyMiddleAge_champion',
        'bronzeage_champion',
      ),
    ).toBe(`https://cdn${CHAMPION}`);
    expect(unitPortrait(assets(ROGUE), 'rogue', 'agent')).toBe(`https://cdn${ROGUE}`);
    expect(unitPortrait(assets(ROGUE), 'rogue', undefined)).toBe(`https://cdn${ROGUE}`);
    expect(unitPortrait(assets(), 'rogue', 'rogue')).toBeUndefined();
  });

  it('gives the units of the catalog their portrait', () => {
    const catalog = new CatalogStore(createBus());
    catalog.setUnitTypes([
      { id: 'EarlyMiddleAge_champion', assetName: 'bronzeage_champion', name: 'Held' },
      { id: 'rogue', assetName: 'rogue', name: 'Agent' },
    ]);
    const vm = battleDetails(battle(['EarlyMiddleAge_champion', 10], ['rogue', 0], ['unknown_unit', 5]), {
      unit: catalogUnits(catalog, assets(CHAMPION)),
    });
    expect(vm.own.map((u) => u.image)).toEqual([`https://cdn${CHAMPION}`, undefined, undefined]);
  });

  it('draws the portrait beside the name, a fallen unit muted, and none while unknown', () => {
    const root = document.createElement('div');
    const unit = (id: string) => (id === 'unknown_unit' ? undefined : { name: id, image: `https://cdn/${id}.jpg` });
    render(
      battleDetailsView(battleDetails(battle(['rogue', 8], ['grenadier', 0], ['unknown_unit', 5]), { unit })),
      root,
    );
    const cells = [...root.querySelectorAll('td')];
    const img = (i: number) => cells[i * 2]?.querySelector('img');
    expect(img(0)?.getAttribute('src')).toBe('https://cdn/rogue.jpg');
    expect(img(0)?.getAttribute('alt')).toBe('');
    expect(img(0)?.getAttribute('loading')).toBe('lazy');
    expect(cells[0]?.classList.contains('muted')).toBe(false);
    expect(img(1)?.getAttribute('src')).toBe('https://cdn/grenadier.jpg');
    expect(cells[2]?.classList.contains('muted')).toBe(true);
    expect(img(2)).toBeNull();
    expect(cells[0]?.textContent?.trim()).toBe('rogue8/10 LP');
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
