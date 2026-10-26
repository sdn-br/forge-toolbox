import { describe, expect, it } from 'vitest';
import {
  buildingCategory,
  type Footprint,
  footprints,
  freeTiles,
  gridBounds,
  needsRoad,
} from '../src/content/domain/city-grid';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { BuildingDef } from '../src/content/stores/catalog';
import type { Building, BuildingState } from '../src/content/stores/city-model';
import { type BuildingDefId, buildingDefId, playerId, worldId } from '../src/shared/ids';
import ownCity from './fixtures/own-city.json';

const def = (id: string, width: number, length: number): BuildingDef => ({
  id: buildingDefId(id),
  name: id,
  generic: false,
  size: { width, length },
  flags: { motivatable: false, polishable: false, plunderable: false },
  boostsByEra: {},
  productByEra: {},
});

let nextId = 1;
const building = (def: string, type: string, x: number, y: number, change: Partial<Building> = {}): Building => ({
  id: nextId++,
  owner: playerId(1),
  def: buildingDefId(def),
  type,
  x,
  y,
  connected: true,
  state: { kind: 'idle' },
  ...change,
});

const catalog = (...defs: BuildingDef[]) => {
  const map = new Map(defs.map((d) => [d.id, d]));
  return (id: BuildingDefId) => map.get(id);
};

describe('footprints', () => {
  it('spans width along x and length along y from the top left tile', () => {
    const [fp] = footprints([building('House', 'residential', 3, 4)], catalog(def('House', 2, 3)));
    expect(fp).toMatchObject({ x: 3, y: 4, width: 2, length: 3, known: true });
  });

  it('takes a single tile for a building without a known definition', () => {
    const [fp] = footprints([building('Unknown', 'residential', 1, 1)], catalog());
    expect(fp).toMatchObject({ width: 1, length: 1, known: false });
  });

  it('leaves out buildings that are not on the city grid', () => {
    const list = ['off_grid', 'outpost_ship', 'friends_tavern'].map((type) => building('Off', type, -5, -5));
    expect(footprints(list, catalog(def('Off', 4, 4)))).toEqual([]);
  });

  it('places every building of a recorded city without overlap', () => {
    const lookup = new Map<BuildingDefId, BuildingDef>();
    for (const json of ownCity.defs) {
      const d = toBuildingDef(json);
      if (d) lookup.set(d.id, d);
    }
    const city = toCity(
      worldId('de20'),
      playerId(1),
      'ColonialAge',
      { entities: ownCity.entities as GameCityEntity[] },
      0,
    );
    const fps = footprints([...city.buildings.values()], (id) => lookup.get(id));
    // 365 entities, 12 of them off the grid (10 off_grid, the outpost ship, the friends tavern)
    expect(fps).toHaveLength(353);
    expect(fps.every((f) => f.known)).toBe(true);
    const tiles = fps.reduce((n, f) => n + f.width * f.length, 0);
    const distinct = new Set(fps.flatMap((f) => cells(f)));
    expect(distinct.size).toBe(tiles);
    expect(gridBounds(fps)).toEqual({ x1: 8, y1: 8, x2: 43, y2: 51 });
  });
});

const cells = (f: Footprint) =>
  Array.from({ length: f.width * f.length }, (_, i) => `${f.x + (i % f.width)},${f.y + Math.floor(i / f.width)}`);

describe('free tiles', () => {
  const lookup = catalog(def('House', 2, 2), def('Street', 1, 1));

  it('counts the tiles of the unlocked areas that no building covers', () => {
    const fps = footprints([building('House', 'residential', 0, 0), building('Street', 'street', 2, 0)], lookup);
    const free = freeTiles([{ x: 0, y: 0, width: 4, length: 3 }], fps);
    expect(free).toHaveLength(12 - 4 - 1);
    expect(free).toContainEqual({ x: 3, y: 0 });
    expect(free).not.toContainEqual({ x: 1, y: 1 });
  });

  it('counts overlapping areas once and ignores buildings outside them', () => {
    const fps = footprints([building('House', 'residential', 10, 10)], lookup);
    const free = freeTiles(
      [
        { x: 0, y: 0, width: 2, length: 2 },
        { x: 1, y: 0, width: 2, length: 2 },
      ],
      fps,
    );
    expect(free).toHaveLength(6);
  });

  it('spans the bounds over areas and buildings', () => {
    const fps = footprints([building('House', 'residential', 5, 6)], lookup);
    expect(gridBounds([{ x: 0, y: 0, width: 4, length: 4 }, ...fps])).toEqual({ x1: 0, y1: 0, x2: 6, y2: 7 });
    expect(gridBounds([])).toBeUndefined();
  });
});

describe('building category', () => {
  it('groups the game types', () => {
    const cases: [string, string][] = [
      ['residential', 'residential'],
      ['production', 'production'],
      ['goods', 'goods'],
      ['culture', 'culture'],
      ['decoration', 'culture'],
      ['military', 'military'],
      ['greatbuilding', 'greatBuilding'],
      ['street', 'street'],
      ['generic_building', 'special'],
      ['random_production', 'special'],
      ['tower', 'special'],
      ['clan_power_production', 'special'],
      ['main_building', 'other'],
      ['something_new', 'other'],
    ];
    for (const [type, category] of cases) expect([type, buildingCategory(type)]).toEqual([type, category]);
  });
});

describe('road connection', () => {
  const state = (kind: BuildingState['kind']) => ({ kind }) as BuildingState;
  it('marks a building the game calls unconnected', () => {
    expect(needsRoad(building('House', 'residential', 0, 0, { connected: false }))).toBe(true);
    expect(needsRoad(building('House', 'residential', 0, 0, { state: state('unconnected') }))).toBe(true);
    expect(needsRoad(building('House', 'residential', 0, 0))).toBe(false);
  });
});
