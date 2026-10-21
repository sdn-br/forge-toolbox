import { describe, expect, it } from 'vitest';
import { footprints } from '../src/content/domain/city-grid';
import { areaStats, streetEfficiency, typeStats } from '../src/content/domain/city-stats';
import type { BuildingDef } from '../src/content/stores/catalog';
import type { Building } from '../src/content/stores/city-model';
import { type BuildingDefId, buildingDefId, playerId } from '../src/shared/ids';

const def = (id: string, width: number, length: number, street?: number): BuildingDef => ({
  id: buildingDefId(id),
  name: id,
  generic: false,
  size: { width, length },
  ...(street !== undefined && { street }),
  flags: { motivatable: false, polishable: false, plunderable: false },
  boostsByEra: {},
  productByEra: {},
});

let nextId = 1;
const building = (d: string, type: string, x: number, y: number) =>
  ({
    id: nextId++,
    owner: playerId(1),
    def: buildingDefId(d),
    type,
    x,
    y,
    connected: true,
    state: { kind: 'idle' },
  }) as Building;

const catalog = (...defs: BuildingDef[]) => {
  const map = new Map(defs.map((d) => [d.id, d]));
  return (id: BuildingDefId) => map.get(id);
};

describe('area of the city', () => {
  it('counts free and all unlocked tiles, overlapping areas once', () => {
    const fps = footprints([building('House', 'residential', 0, 0)], catalog(def('House', 2, 2)));
    const areas = [
      { x: 0, y: 0, width: 4, length: 4 },
      { x: 2, y: 0, width: 4, length: 4 },
    ];
    expect(areaStats(areas, fps)).toEqual({ free: 24 - 4, total: 24 });
  });
});

describe('buildings by type', () => {
  it('counts buildings, their share and their tiles per group, most frequent first', () => {
    const lookup = catalog(def('House', 2, 2), def('Farm', 3, 2), def('Street', 1, 1));
    const fps = footprints(
      [
        building('House', 'residential', 0, 0),
        building('House', 'residential', 2, 0),
        building('Farm', 'production', 0, 2),
        building('Street', 'street', 4, 0),
        building('Street', 'street', 4, 1),
        building('Street', 'street', 4, 2),
        building('Street', 'street', 4, 3),
      ],
      lookup,
    );
    const stats = typeStats(fps);
    expect(stats.total).toBe(7);
    expect(stats.types).toEqual([
      { category: 'street', count: 4, share: (4 / 7) * 100, tiles: 4 },
      { category: 'residential', count: 2, share: (2 / 7) * 100, tiles: 8 },
      { category: 'production', count: 1, share: (1 / 7) * 100, tiles: 6 },
    ]);
  });
});

describe('street efficiency', () => {
  it('compares the street tiles the buildings need with the placed ones', () => {
    // needed: half the shorter side, rounded up: 1-wide 1, 2-wide 1, 3-wide 2, deco none
    const lookup = catalog(
      def('Small', 1, 2, 1),
      def('House', 2, 2, 1),
      def('Big', 3, 4, 2),
      def('Deco', 2, 2, 0),
      def('Street', 1, 1, 0),
    );
    const fps = footprints(
      [
        building('Small', 'residential', 0, 0),
        building('House', 'residential', 1, 0),
        building('Big', 'production', 3, 0),
        building('Deco', 'decoration', 6, 0),
        ...[0, 1, 2, 3, 4].map((y) => building('Street', 'street', 8, y)),
      ],
      lookup,
    );
    expect(streetEfficiency(fps)).toEqual({ needed: 4, placed: 5, percent: 80, partial: false });
  });

  it('tells when some definitions do not name their street requirement', () => {
    const lookup = catalog(def('House', 2, 2, 1), def('Old', 2, 2), def('Street', 1, 1));
    const fps = footprints(
      [
        building('House', 'residential', 0, 0),
        building('Old', 'residential', 2, 0),
        building('Street', 'street', 0, 2),
      ],
      lookup,
    );
    expect(streetEfficiency(fps)).toEqual({ needed: 1, placed: 1, percent: 100, partial: true });
  });

  it('is unknown when no definition names a street requirement', () => {
    const fps = footprints([building('House', 'residential', 0, 0)], catalog(def('House', 2, 2)));
    expect(streetEfficiency(fps)).toBeUndefined();
  });

  it('has no percentage without streets', () => {
    const fps = footprints([building('House', 'residential', 0, 0)], catalog(def('House', 2, 2, 1)));
    expect(streetEfficiency(fps)).toEqual({ needed: 1, placed: 0, partial: false });
  });
});
