import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { PLUNDERABLE_FILL, visitedCityMap } from '../src/content/features/sabotage/city-map';
import { type BuildingDef, CatalogStore } from '../src/content/stores/catalog';
import type { Building, City } from '../src/content/stores/city-model';
import { mutedColor } from '../src/content/ui/city-colors';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';

const def = (id: string, name: string, width: number, length: number): BuildingDef => ({
  id: buildingDefId(id),
  name,
  generic: false,
  size: { width, length },
  flags: { motivatable: false, polishable: false, plunderable: true },
  boostsByEra: {},
  productByEra: {},
});

const building = (id: number, defId: string, type: string, x: number, y: number): Building => ({
  id,
  owner: playerId(2),
  def: buildingDefId(defId),
  type,
  x,
  y,
  connected: true,
  state: { kind: 'idle' },
});

const city = (buildings: Building[]): City => ({
  world: worldId('de20'),
  owner: playerId(2),
  era: eraId('IronAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(buildings.map((b) => [b.id, b])),
  areas: [{ x: 0, y: 0, width: 8, length: 8 }],
});

describe('visited city map', () => {
  const catalog = new CatalogStore(createBus());
  catalog.add(def('House', 'Haus', 2, 2));
  catalog.add(def('Farm', 'Hof', 3, 2));
  const visited = city([
    building(1, 'Farm', 'production', 0, 0),
    building(2, 'House', 'residential', 4, 0),
    building(3, 'Unknown', 'street', 0, 3),
  ]);
  const vm = visitedCityMap(visited, [{ building: 1, name: 'Hof', resources: { money: 120, supplies: 30 } }], catalog);

  it('highlights plunderable buildings with their loot and mutes the others by group', () => {
    const farm = vm.data.tiles.find((t) => t.tooltip.startsWith('Hof'));
    expect(farm).toMatchObject({ x: 0, y: 0, width: 3, length: 2, fill: PLUNDERABLE_FILL, strong: true });
    expect(farm?.tooltip).toBe('Hof\n120 Münzen, 30 Vorräte');
    const house = vm.data.tiles.find((t) => t.tooltip === 'Haus');
    expect(house).toMatchObject({ fill: mutedColor('residential') });
    expect(house?.outline).toBeUndefined();
  });

  it('names a building without definition by its id and draws plunderable ones last', () => {
    expect(vm.data.tiles.map((t) => t.tooltip.split('\n')[0])).toEqual(['Haus', 'Unknown', 'Hof']);
    expect(vm.data.areas).toEqual(visited.areas);
  });

  it('explains the colors', () => {
    expect(vm.legend[0]).toEqual({ color: PLUNDERABLE_FILL, label: 'Plünderbar' });
    expect(vm.legend.map((l) => l.label)).toContain('Wohnhaus');
  });
});
