import { describe, expect, it } from 'vitest';
import { ownCityStats } from '../src/content/features/city-map/stats';
import type { BuildingDef } from '../src/content/stores/catalog';
import type { Building, City } from '../src/content/stores/city-model';
import { CATEGORY_COLORS } from '../src/content/ui/city-colors';
import { type BuildingDefId, buildingDefId, type EraId, eraId, playerId, worldId } from '../src/shared/ids';

const def = (id: string, width: number, length: number, street = 0): BuildingDef => ({
  id: buildingDefId(id),
  name: id,
  generic: false,
  size: { width, length },
  street,
  flags: { motivatable: false, polishable: false, plunderable: false },
  boostsByEra: {},
  productByEra: {},
});
const defs = new Map([def('House', 2, 2, 1), def('Street', 1, 1)].map((d) => [d.id, d]));
const lookup = (id: BuildingDefId) => defs.get(id);

const building = (id: number, d: string, type: string, x: number, y: number) =>
  ({ id, owner: playerId(1), def: buildingDefId(d), type, x, y, connected: true, state: { kind: 'idle' } }) as Building;

// start area 16 × 16 and two expansions to the right
const city: City = {
  world: worldId('de20'),
  owner: playerId(1),
  era: eraId('IronAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(
    [
      building(1, 'House', 'residential', 0, 0),
      building(2, 'Street', 'street', 2, 0),
      building(3, 'Street', 'street', 2, 1),
    ].map((b) => [b.id, b]),
  ),
  areas: [
    { x: 0, y: 0, width: 16, length: 16 },
    { x: 16, y: 0, width: 4, length: 4 },
    { x: 16, y: 4, width: 4, length: 4 },
  ],
  blocked: [{ x: 0, y: 16, width: 4, length: 4 }],
  expansions: [
    { kind: 'tileset_reward', cost: { money: 20e6, premium: 1500 } },
    { kind: 'tileset_reward', cost: { money: 45e6, premium: 3000 } },
    { kind: 'raidMedals', cost: { guild_raids_medals: 6e5 } },
    { kind: 'tileset_premium', minEra: eraId('MarsAge'), cost: { premium: 2000 } },
  ],
};
// 6 × 6 blocks of 4 tiles
const grid = {
  width: 24,
  height: 24,
  blocks: Array.from({ length: 36 }, (_, i) => ({ x: (i % 6) * 4, y: Math.floor(i / 6) * 4 })),
};
const eras = ['IronAge', 'MarsAge'].map(eraId);
const means = (have: Record<string, number> | undefined, withGrid = true) => ({
  ...(withGrid && { grid }),
  resources: { known: have !== undefined, amount: (id: string) => have?.[id] ?? 0 },
  eraIndex: (era: EraId) => (eras.includes(era) ? eras.indexOf(era) : undefined),
  eraName: (era: EraId) => (era === 'MarsAge' ? 'Mars' : era),
});

describe('statistics of the own city', () => {
  it('counts area, buildings by group with their legend color, and street efficiency', () => {
    const stats = ownCityStats(city, lookup, means({ money: 30e6, expansions: 1 }));
    expect(stats.area).toEqual({ free: 16 * 16 + 32 - 6, total: 16 * 16 + 32 });
    expect(stats.buildings).toBe(3);
    expect(stats.types[0]).toMatchObject({
      category: 'street',
      label: 'Straße',
      color: CATEGORY_COLORS.street,
      count: 2,
    });
    expect(stats.types[1]).toMatchObject({ category: 'residential', label: 'Wohnhaus', count: 1, tiles: 4 });
    expect(stats.streets).toEqual({ needed: 1, placed: 2, percent: 50, partial: false });
  });

  it('counts placed, unplaced and open expansions and the free blocks of the grid', () => {
    const stats = ownCityStats(city, lookup, means({ money: 30e6, expansions: 1 }));
    expect(stats.expansions.placed).toBe(2);
    expect(stats.expansions.unplaced).toBe(1);
    expect(stats.expansions.offers).toEqual([
      { kind: 'coins', label: 'Münzen', total: 2, buyable: 1, next: 45e6 },
      { kind: 'medals', label: 'QI-Medaillen', total: 1, buyable: 0, next: 6e5 },
      { kind: 'diamonds', label: 'Diamanten', total: 1, buyable: 0, minEra: 'MarsAge', eraName: 'Mars' },
    ]);
    // 36 blocks: 18 unlocked, 1 blocked; adjacent: 2 right of the start area, 2 right of the expansions and 3 below
    // the start area (the fourth there is blocked)
    expect(stats.expansions.blocks).toEqual({ now: 7, later: 36 - 18 - 1 - 7 });
  });

  it('leaves out what it does not know', () => {
    const bare: City = { ...city, areas: undefined, expansions: undefined };
    const stats = ownCityStats(bare, lookup, means(undefined, false));
    expect(stats.area).toBeUndefined();
    expect(stats.expansions).toEqual({ resourcesKnown: false });
  });

  it('shows unplaced expansions only when there are some', () => {
    expect(ownCityStats(city, lookup, means({ expansions: 0 })).expansions.unplaced).toBeUndefined();
  });
});
