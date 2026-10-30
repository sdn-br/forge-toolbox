import { describe, expect, it } from 'vitest';
import { footprints } from '../src/content/domain/city-grid';
import { cityBasis } from '../src/content/features/city-map/basis';
import { CATEGORY_COLORS, mutedColor } from '../src/content/features/city-map/colors';
import {
  MARK,
  nextFinish,
  type OwnMapUi,
  ownCityMapViewModel as viewModel,
} from '../src/content/features/city-map/view-model';
import type { BuildingDef, CityGrid } from '../src/content/model/catalog';
import type { Building, City } from '../src/content/model/city';
import { type BuildingDefId, buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';

const def = (id: string, name: string, width: number, length: number): BuildingDef => ({
  id: buildingDefId(id),
  name,
  generic: false,
  size: { width, length },
  flags: { motivatable: false, polishable: false, plunderable: false },
  boostsByEra: {},
  productByEra: {},
});
const defs = new Map(
  [def('House', 'Strohdachhaus', 2, 2), def('Farm', 'Bauernhof', 2, 1), def('Street', 'Straße', 1, 1)].map((d) => [
    d.id,
    d,
  ]),
);
const lookup = (id: BuildingDefId) => defs.get(id);

const building = (id: number, d: string, type: string, x: number, y: number, change: Partial<Building> = {}) =>
  ({
    id,
    owner: playerId(1),
    def: buildingDefId(d),
    type,
    x,
    y,
    connected: true,
    state: { kind: 'idle' },
    ...change,
  }) as Building;

const city = (buildings: Building[], areas?: City['areas']): City => ({
  world: worldId('de20'),
  owner: playerId(1),
  era: eraId('IronAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(buildings.map((b) => [b.id, b])),
  ...(areas && { areas }),
});

const ownCityMapViewModel = (
  c: City,
  options: OwnMapUi,
  grid?: CityGrid,
  selected?: ReadonlySet<number>,
  now?: number,
) => viewModel(c, cityBasis(c, footprints(c.buildings.values(), lookup), grid), options, selected, now);

const ui: OwnMapUi = { finished: true, unconnected: true, free: true, stats: false, expansions: false };
const town = city(
  [
    building(1, 'House', 'residential', 0, 0),
    building(2, 'Farm', 'production', 2, 0, { state: { kind: 'finished' } }),
    building(3, 'House', 'residential', 0, 2, { connected: false }),
    building(4, 'Street', 'street', 2, 1),
  ],
  [{ x: 0, y: 0, width: 4, length: 4 }],
);
const tileOf = (vm: ReturnType<typeof ownCityMapViewModel>, x: number, y: number) =>
  vm.data.tiles.find((t) => t.x === x && t.y === y);

describe('own city map view model', () => {
  it('colors buildings by group', () => {
    const vm = ownCityMapViewModel(town, ui);
    expect(tileOf(vm, 0, 0)).toMatchObject({
      id: 1,
      fill: CATEGORY_COLORS.residential,
      tooltip: 'Strohdachhaus\nKlick: nur dieses auswählen, Umschalt+Klick: hinzufügen/entfernen',
    });
    expect(tileOf(vm, 2, 1)?.fill).toBe(CATEGORY_COLORS.street);
    expect(vm.legend.map((l) => l.label)).toContain('Legendäres Bauwerk');
  });

  it('counts a production whose time is up as finished, since the game tells nothing then', () => {
    const forge = (readyAt: number) =>
      city([building(5, 'Farm', 'production', 0, 0, { state: { kind: 'producing', readyAt } })]);
    expect(tileOf(ownCityMapViewModel(forge(1000), ui, undefined, new Set(), 999), 0, 0)?.badges).toBeUndefined();
    expect(tileOf(ownCityMapViewModel(forge(1000), ui, undefined, new Set(), 1000), 0, 0)?.badges).toEqual([
      { color: MARK.finished, symbol: 'check' },
    ]);
    expect(nextFinish(forge(1000), 999)).toBe(1000);
    expect(nextFinish(forge(1000), 1000)).toBeUndefined();
  });

  it('marks finished productions and buildings without road with badges, each switchable', () => {
    const vm = ownCityMapViewModel(town, ui);
    expect(tileOf(vm, 2, 0)).toMatchObject({
      badges: [{ color: MARK.finished, symbol: 'check' }],
      tooltip: 'Bauernhof\nProduktion fertig\nKlick: nur dieses auswählen, Umschalt+Klick: hinzufügen/entfernen',
    });
    expect(tileOf(vm, 0, 2)).toMatchObject({ badges: [{ color: MARK.unconnected, symbol: 'cross' }] });
    expect(tileOf(vm, 0, 2)?.outline).toBeUndefined();
    expect(tileOf(vm, 0, 2)?.tooltip).toBe(
      'Strohdachhaus\nOhne Straßenanbindung\nKlick: nur dieses auswählen, Umschalt+Klick: hinzufügen/entfernen',
    );
    const off = ownCityMapViewModel(town, { ...ui, finished: false, unconnected: false });
    expect(tileOf(off, 2, 0)?.badges).toBeUndefined();
    expect(tileOf(off, 0, 2)?.badges).toBeUndefined();
    expect(off.legend.some((l) => l.symbol)).toBe(false);
    expect(vm.legend).toContainEqual({ color: MARK.finished, label: 'Produktion fertig', symbol: 'check' });
  });

  it('frames the selected buildings light, before any other mark, and mutes the rest', () => {
    const vm = ownCityMapViewModel(town, ui, undefined, new Set([1, 2]));
    expect(tileOf(vm, 0, 0)).toMatchObject({ outline: MARK.selected, strong: true, fill: CATEGORY_COLORS.residential });
    expect(tileOf(vm, 2, 0)).toMatchObject({ outline: MARK.selected, strong: true, fill: CATEGORY_COLORS.production });
    // the other house is not selected: muted, its badge stays
    expect(tileOf(vm, 0, 2)).toMatchObject({
      badges: [{ color: MARK.unconnected, symbol: 'cross' }],
      fill: mutedColor('residential'),
    });
    // a selected building keeps its badge under the frame
    expect(tileOf(vm, 2, 0)?.badges).toEqual([{ color: MARK.finished, symbol: 'check' }]);
    expect(vm.legend).toContainEqual({ color: MARK.selected, label: 'Ausgewählt (Pfeil im Spiel)', outline: true });
    const none = ownCityMapViewModel(town, ui, undefined, new Set([99]));
    expect(none.legend.map((l) => l.label)).not.toContain('Ausgewählt (Pfeil im Spiel)');
    expect(tileOf(none, 0, 2)?.fill).toBe(CATEGORY_COLORS.residential);
  });

  it('counts and shows the free tiles of the unlocked areas', () => {
    const vm = ownCityMapViewModel(town, ui);
    // 16 tiles: two houses 8, farm 2, street 1
    expect(vm.free).toBe(5);
    expect(vm.data.marked?.tiles).toHaveLength(5);
    const hidden = ownCityMapViewModel(town, { ...ui, free: false });
    expect(hidden.free).toBe(5);
    expect(hidden.data.marked).toBeUndefined();
  });

  it('leaves the free tiles unknown without areas and tells about missing definitions', () => {
    const vm = ownCityMapViewModel(city([building(1, 'Castle', 'other', 0, 0)]), ui);
    expect(vm.free).toBeUndefined();
    expect(vm.data.marked).toBeUndefined();
    expect(vm.incomplete).toBe(true);
    expect(tileOf(vm, 0, 0)?.tooltip).toBe('Castle\nKlick: nur dieses auswählen, Umschalt+Klick: hinzufügen/entfernen');
  });

  it('leaves the groups out of the legend while the statistics show them', () => {
    const vm = ownCityMapViewModel(town, { ...ui, stats: true });
    expect(vm.legend.map((l) => l.label)).not.toContain('Wohnhaus');
    expect(vm.legend.map((l) => l.label)).toContain('Produktion fertig');
  });

  it('draws the free expansion blocks on demand, adjacent ones strong', () => {
    // 3 × 3 blocks, the city holds the top left one
    const grid = {
      width: 12,
      height: 12,
      blocks: Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 4, y: Math.floor(i / 3) * 4 })),
    };
    expect(ownCityMapViewModel(town, ui, grid).data.zones).toBeUndefined();
    const vm = ownCityMapViewModel(town, { ...ui, expansions: true }, grid);
    const [now, later] = vm.data.zones ?? [];
    expect(now?.rects).toHaveLength(2);
    expect(now?.tooltip).toBe('Erweiterungsfläche, jetzt setzbar');
    expect(later?.rects).toHaveLength(6);
    expect(vm.legend.map((l) => l.label)).toContain('Erweiterung jetzt setzbar');
    expect(ownCityMapViewModel(town, { ...ui, expansions: true }).data.zones).toBeUndefined();
  });

  it('keeps the expansion blocks in the extent while they are hidden, so the map keeps its frame', () => {
    const grid = {
      width: 12,
      height: 12,
      blocks: Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 4, y: Math.floor(i / 3) * 4 })),
    };
    const hidden = ownCityMapViewModel(town, ui, grid).data;
    const shown = ownCityMapViewModel(town, { ...ui, expansions: true }, grid).data;
    expect(hidden.extent).toHaveLength(8);
    expect(shown.extent).toEqual(hidden.extent);
  });
});
