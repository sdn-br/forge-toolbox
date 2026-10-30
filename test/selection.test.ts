import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Markers } from '../src/content/core/markers';
import type { BuildingDef } from '../src/content/model/catalog';
import type { Building, City } from '../src/content/model/city';
import { CityStore } from '../src/content/stores/cities';
import { OwnSelection, SELECTION } from '../src/content/stores/selection';
import { selectionEntries } from '../src/content/ui/selection-list';
import { type BuildingDefId, buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import { MAX_MARKERS } from '../src/shared/marker-protocol';
import { fakeMarkerLink } from './helpers/feature-context';

const def = (id: string, name: string, width: number, length: number) =>
  ({ id: buildingDefId(id), name, size: { width, length } }) as BuildingDef;
const defs = new Map([def('House', 'Domizil', 2, 2), def('Dome', 'Aachener Dom', 3, 4)].map((d) => [d.id, d]));

const building = (id: number, d: string, x: number, type = 'residential') =>
  ({
    id,
    owner: playerId(1),
    def: buildingDefId(d),
    type,
    x,
    y: 0,
    connected: true,
    state: { kind: 'idle' },
  }) as Building;

const city = (buildings: Building[]): City => ({
  world: worldId('de20'),
  owner: playerId(1),
  era: eraId('IronAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(buildings.map((b) => [b.id, b])),
});

// three houses, a dome, and a harbour beside the grid
const town = [
  building(1, 'House', 0),
  building(2, 'House', 2),
  building(3, 'House', 4),
  building(4, 'Dome', 6, 'culture'),
  building(5, 'House', 0, 'off_grid'),
];

function setup(buildings = town) {
  const bus = createBus();
  const cities = new CityStore(bus);
  const marker = fakeMarkerLink();
  const markers = new Markers(bus, cities, marker.link);
  const selection = new OwnSelection(bus, cities, { get: (id: BuildingDefId) => defs.get(id) }, markers);
  cities.setOwn(city(buildings));
  let changes = 0;
  bus.on('selection.changed', () => changes++);
  const ids = () => [...selection.ids()].sort();
  return { bus, cities, marker, markers, selection, ids, changes: () => changes };
}

describe('own city selection', () => {
  it('adds all buildings of a name on the grid and puts arrows on them', () => {
    const s = setup();
    s.selection.toggle(1);
    s.selection.addName('Domizil');
    expect(s.ids()).toEqual([1, 2, 3]);
    expect(s.marker.shown.sort()).toEqual([1, 2, 3]);
    expect(s.markers.current()).toMatchObject({ by: SELECTION, city: 'own' });
    expect(s.marker.last?.type === 'show' && s.marker.last.spots[0]).toEqual({
      id: 1,
      x: 0,
      y: 0,
      width: 2,
      length: 2,
    });
    expect(selectionEntries(s.selection)).toEqual([{ name: 'Domizil', selected: 3, total: 3 }]);
    expect(s.changes()).toBe(2);
    // all of the name already selected: nothing changes
    s.selection.addName('Domizil');
    expect(s.changes()).toBe(2);
  });

  it('adds and removes single buildings, and ignores what is not on the grid', () => {
    const s = setup();
    s.selection.toggle(4);
    s.selection.toggle(2);
    expect(selectionEntries(s.selection)).toEqual([
      { name: 'Aachener Dom', selected: 1, total: 1 },
      { name: 'Domizil', selected: 1, total: 3 },
    ]);
    s.selection.toggle(4);
    expect(s.ids()).toEqual([2]);
    s.selection.toggle(5);
    s.selection.toggle(99);
    expect(s.ids()).toEqual([2]);
  });

  it('selects one building alone, and empties the selection when it was alone', () => {
    const s = setup();
    s.selection.addName('Domizil');
    s.selection.selectOnly(2);
    expect(s.ids()).toEqual([2]);
    expect(s.marker.shown).toEqual([2]);
    s.selection.selectOnly(4);
    expect(s.ids()).toEqual([4]);
    s.selection.selectOnly(4);
    expect(s.ids()).toEqual([]);
    expect(s.marker.last?.type).toBe('hide');
  });

  it('removes all buildings of a name, and clears all', () => {
    const s = setup();
    s.selection.addName('Domizil');
    s.selection.toggle(4);
    s.selection.removeName('Domizil');
    expect(s.ids()).toEqual([4]);
    expect(s.marker.shown).toEqual([4]);
    s.selection.toggle(1);
    s.selection.clear();
    expect(s.ids()).toEqual([]);
    expect(s.markers.current()).toBeUndefined();
    expect(s.marker.last?.type).toBe('hide');
  });

  it('drops buildings that left the own city and moves the arrows with the buildings', () => {
    const s = setup();
    s.selection.addName('Domizil');
    const before = s.changes();
    s.cities.setOwn(city([building(1, 'House', 10), building(3, 'House', 4)]));
    expect(s.ids()).toEqual([1, 3]);
    expect(s.changes()).toBe(before + 1);
    expect(s.marker.last?.type === 'show' && s.marker.last.spots.map((p) => [p.id, p.x])).toEqual([
      [1, 10],
      [3, 4],
    ]);
    // the same city again sets no new arrows
    const posted = s.marker.posted.length;
    s.cities.setOwn(city([building(1, 'House', 10), building(3, 'House', 4)]));
    expect(s.marker.posted).toHaveLength(posted);
    expect(s.changes()).toBe(before + 1);
  });

  it('lets go of the arrows the viewer dismissed in the game', () => {
    const s = setup();
    s.selection.addName('Domizil');
    s.selection.toggle(4);
    s.marker.dismiss([2]);
    expect(s.ids()).toEqual([1, 3, 4]);
    expect(s.marker.shown.sort()).toEqual([1, 3, 4]);
    // the ✕ in the game removes all arrows
    s.marker.dismiss([1, 3, 4]);
    expect(s.ids()).toEqual([]);
    expect(selectionEntries(s.selection)).toEqual([]);
  });

  it('empties when the ✕ in the game removes the arrows, also beyond the arrows', () => {
    const many = Array.from({ length: MAX_MARKERS + 5 }, (_, i) => building(i + 1, 'House', i * 2));
    const s = setup(many);
    s.selection.addName('Domizil');
    expect(s.selection.ids().size).toBe(MAX_MARKERS + 5);
    expect(s.marker.shown).toHaveLength(MAX_MARKERS);
    s.marker.dismiss(s.marker.shown);
    expect(s.ids()).toEqual([]);
  });

  it('keeps the selection while a visited city is shown, and arrows of a visit leave it alone', () => {
    const s = setup();
    s.selection.toggle(1);
    s.cities.setVisited({
      ...city([]),
      owner: playerId(5),
      visit: { neighbor: true, friend: false, guildMember: false },
    });
    s.markers.set('sabotage', playerId(5), [{ id: 7, x: 0, y: 0, width: 1, length: 1 }]);
    s.markers.clear('sabotage');
    expect(s.ids()).toEqual([1]);
    s.cities.showOwn();
    expect(s.marker.shown).toEqual([1]);
  });
});
