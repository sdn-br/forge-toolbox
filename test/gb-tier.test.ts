import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { arcBonusAt } from '../src/content/domain/arc-bonus';
import { assessCity } from '../src/content/domain/assess-city';
import { DEFAULT_TIERS, levelTier } from '../src/content/domain/gb-tier';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { GreatBuildingDef, TierStart } from '../src/content/model/catalog';
import { buildingDefId } from '../src/shared/ids';
import fixture from './fixtures/gb-tiers.json';
import { testStores } from './helpers/stores';

const def = (maxTier?: GreatBuildingDef['maxTier']): GreatBuildingDef => ({
  era: 'FutureEra',
  levelCosts: [],
  ...(maxTier && { maxTier }),
});
/** as the game sends them on 2026-11-05: copper 1 to 200, gold from 101; the ranges overlap */
const tiers: TierStart[] = [
  { tier: 'copper', startLevel: 1 },
  { tier: 'gold', startLevel: 101 },
];

describe('levelTier', () => {
  it('turns gold at the start of gold for a building that reaches gold', () => {
    expect(levelTier(def('gold'), 100, tiers)).toBe('copper');
    expect(levelTier(def('gold'), 101, tiers)).toBe('gold');
    // the copper range ends at 200, gold wins already from 101
    expect(levelTier(def('gold'), 150, tiers)).toBe('gold');
  });

  it('stays copper up to the highest tier of the building', () => {
    expect(levelTier(def('copper'), 150, tiers)).toBe('copper');
  });

  it('falls back: no definition takes the given tier or copper, no maxTier copper, no file the default tiers', () => {
    expect(levelTier(undefined, 150, tiers)).toBe('copper');
    expect(levelTier(undefined, 150, tiers, 'gold')).toBe('gold');
    expect(levelTier(def(), 150, tiers)).toBe('copper');
    expect(DEFAULT_TIERS).toEqual(tiers);
    expect(levelTier(def('gold'), 101)).toBe('gold');
  });

  it('follows the start the file gives', () => {
    expect(levelTier(def('gold'), 120, [tiers[0] as TierStart, { tier: 'gold', startLevel: 130 }])).toBe('copper');
  });
});

describe('tiers from the game (recorded 2026-11-05)', () => {
  function setup() {
    const ingestion = new Ingestion();
    const { world, bus, now, stores } = testStores({ now: () => 1_000 });
    registerGameHandlers(ingestion, { world, bus, now, ...stores });
    const updated: number[] = [];
    bus.on('catalog.updated', ({ defs }) => updated.push(defs.length));
    const meta = (url: string, json: unknown) =>
      ingestion.accept({ kind: 'meta', url, response: JSON.stringify(json), at: 0 });
    const [startup] = fixture.startup;
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([startup]),
      at: 0,
    });
    return { ...stores, meta, updated };
  }

  it('keeps the tiers of the metadata file, not a file whose name only starts alike', () => {
    const { catalog, meta, updated } = setup();
    expect(catalog.greatBuildingTiers()).toBe(DEFAULT_TIERS);
    meta('https://cdn/start/metadata?id=great_building_tiers_names-0', [{ tier: { value: 'gold' }, startLevel: 5 }]);
    expect(catalog.greatBuildingTiers()).toBe(DEFAULT_TIERS);
    meta(fixture.tiers.url, fixture.tiers.json);
    expect(catalog.greatBuildingTiers()).toEqual(tiers);
    expect(updated).toEqual([0]);
  });

  it('reads the highest tier of each definition', () => {
    const { catalog, meta } = setup();
    for (const f of fixture.defs) meta(f.url, f.json);
    const maxTier = (id: string) => catalog.get(buildingDefId(id))?.greatBuilding?.maxTier;
    expect(maxTier('X_FutureEra_Landmark1')).toBe('gold');
    expect(maxTier('X_IronAge_Landmark2')).toBe('copper');
  });

  it('reads the list of bonuses of the own great buildings: the Arc on 137 pays its gold bonus into level 138', () => {
    const { catalog, cities, playerBonuses, meta } = setup();
    for (const f of fixture.defs) meta(f.url, f.json);
    const arc = cities.own()?.buildings.get(1769);
    expect(arc?.greatBuilding?.bonuses.map((b) => [b.type, b.value])).toEqual([
      ['contribution_boost', 93],
      ['clan_goods', 1845],
      ['contribution_boost_gold', 12],
    ]);
    expect(playerBonuses.arcBonus()).toEqual({ copper: 93, gold: 12 });
    const def = catalog.get(buildingDefId('X_FutureEra_Landmark1'))?.greatBuilding;
    expect(arcBonusAt(playerBonuses.arcBonus(), def, 137, catalog.greatBuildingTiers())).toBe(12);
  });

  it('counts the military boosts of great buildings for all features only (Alcatraz: battleground)', () => {
    const { catalog, cities, meta } = setup();
    for (const f of fixture.defs) meta(f.url, f.json);
    const own = cities.own();
    if (!own) throw new Error('no own city');
    const result = assessCity(own, { def: (id) => catalog.get(id), eraByLevel: () => undefined });
    // Zeus military_boost 247 for all; the military_boost 2 of Alcatraz is for the battleground
    expect(result.army.attacker).toEqual({ attack: 247, defense: 247 });
  });
});
