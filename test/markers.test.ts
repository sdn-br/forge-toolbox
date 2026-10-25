import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Markers } from '../src/content/core/markers';
import { CityStore, type VisitedCity } from '../src/content/stores/cities';
import { eraId, playerId, worldId } from '../src/shared/ids';
import { MARKER_TAG } from '../src/shared/marker-protocol';
import { fakeMarkerLink } from './helpers/feature-context';

const visited = (owner: number): VisitedCity => ({
  world: worldId('de20'),
  owner: playerId(owner),
  era: eraId('IronAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(),
  visit: { neighbor: true, friend: false, guildMember: false },
});

const spot = (id: number) => ({ id, x: id, y: 0, width: 2, length: 3 });

function setup() {
  const bus = createBus();
  const cities = new CityStore(bus);
  const marker = fakeMarkerLink();
  const markers = new Markers(bus, cities, marker.link);
  let changes = 0;
  bus.on('markers.changed', () => changes++);
  return { cities, marker, markers, changes: () => changes };
}

describe('markers', () => {
  it('shows a marking of the shown city with a new number each time, replacing the one before', () => {
    const { marker, markers, changes } = setup();
    markers.set('cityMap', 'own', [spot(1), spot(2)]);
    expect(marker.last).toEqual({
      tag: MARKER_TAG,
      from: 'content',
      type: 'show',
      seq: 1,
      settle: false,
      clearLabel: 'Markierungen entfernen',
      spots: [spot(1), spot(2)],
    });
    markers.set('sabotage', 'own', [spot(3)]);
    expect(marker.last).toMatchObject({ type: 'show', seq: 2, spots: [spot(3)] });
    expect(markers.current()).toEqual({ by: 'sabotage', city: 'own', spots: [spot(3)] });
    expect(changes()).toBe(2);
  });

  it('clears only the marking of the feature that asks, and an empty marking clears', () => {
    const { marker, markers } = setup();
    markers.set('sabotage', 'own', [spot(1)]);
    markers.clear('cityMap');
    expect(markers.current()).toBeDefined();
    markers.set('cityMap', 'own', []);
    expect(markers.current()).toBeDefined();
    markers.set('sabotage', 'own', []);
    expect(markers.current()).toBeUndefined();
    expect(marker.last).toEqual({ tag: MARKER_TAG, from: 'content', type: 'hide' });
  });

  it('tells whether a feature marked a building of a city', () => {
    const { markers } = setup();
    markers.set('sabotage', playerId(5), [spot(1)]);
    expect(markers.has('sabotage', playerId(5), 1)).toBe(true);
    expect(markers.has('sabotage', playerId(5), 2)).toBe(false);
    expect(markers.has('sabotage', playerId(6), 1)).toBe(false);
    expect(markers.has('cityMap', playerId(5), 1)).toBe(false);
  });

  describe('city binding', () => {
    it('keeps a marking of another city out of the game until the game shows that city', () => {
      const { cities, marker, markers } = setup();
      cities.setVisited(visited(5));
      markers.set('cityMap', 'own', [spot(1)]);
      expect(marker.posted).toEqual([]);

      cities.showOwn();
      expect(marker.last).toMatchObject({ type: 'show', spots: [spot(1)], settle: true });
    });

    it('hides the arrows while another city shows and brings them back with that city', () => {
      const { cities, marker, markers } = setup();
      markers.set('cityMap', 'own', [spot(1)]);
      cities.setVisited(visited(5));
      expect(marker.last?.type).toBe('hide');
      expect(markers.current()?.city).toBe('own');

      cities.setVisited(visited(6));
      expect(marker.posted.filter((c) => c.type === 'hide')).toHaveLength(1);

      cities.showOwn();
      expect(marker.last).toMatchObject({ type: 'show', seq: 1, settle: true, spots: [spot(1)] });
    });

    it('marks a visited city only while it shows', () => {
      const { cities, marker, markers } = setup();
      cities.setVisited(visited(5));
      markers.set('sabotage', playerId(5), [spot(1)]);
      expect(marker.shown).toEqual([1]);
      cities.showOwn();
      expect(marker.shown).toEqual([]);
      cities.setVisited(visited(5));
      expect(marker.shown).toEqual([1]);
    });

    it('leaves the arrows alone when the game reports the shown city again', () => {
      const { cities, marker, markers } = setup();
      cities.setVisited(visited(5));
      markers.set('sabotage', playerId(5), [spot(1)]);
      const count = marker.posted.length;
      cities.setVisited(visited(5));
      cities.showOwn();
      cities.showOwn();
      expect(marker.posted).toHaveLength(count + 1);
    });

    it('sends nothing on a city change without a marking', () => {
      const { cities, marker } = setup();
      cities.setVisited(visited(5));
      cities.showOwn();
      expect(marker.posted).toEqual([]);
    });
  });

  describe('dismissed in the game', () => {
    it('drops the arrows the page removed and clears the marking with the last one', () => {
      const { marker, markers, changes } = setup();
      markers.set('cityMap', 'own', [spot(1), spot(2)]);
      marker.dismiss([1]);
      expect(markers.current()?.spots).toEqual([spot(2)]);
      expect(changes()).toBe(2);
      marker.dismiss([2]);
      expect(markers.current()).toBeUndefined();
      expect(changes()).toBe(3);
    });

    it('ignores a late report of an older marking and one about no arrow of it', () => {
      const { marker, markers, changes } = setup();
      markers.set('cityMap', 'own', [spot(1)]);
      markers.set('cityMap', 'own', [spot(1), spot(2)]);
      marker.dismiss([1, 2], 1);
      expect(markers.current()?.spots).toEqual([spot(1), spot(2)]);
      marker.dismiss([9]);
      expect(changes()).toBe(2);
    });

    it('does not tell the page to hide arrows it already removed', () => {
      const { cities, marker, markers } = setup();
      markers.set('cityMap', 'own', [spot(1)]);
      marker.dismiss([1]);
      const count = marker.posted.length;
      cities.setVisited(visited(5));
      expect(marker.posted).toHaveLength(count);
    });
  });
});
