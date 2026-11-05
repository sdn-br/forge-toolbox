import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { arcBonus, arcBonusAt } from '../src/content/domain/arc-bonus';
import type { Building, City, GreatBuildingBonus } from '../src/content/model/city';
import { CityStore } from '../src/content/stores/cities';
import { PlayerBonusStore } from '../src/content/stores/player-bonuses';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';

describe('arcBonus', () => {
  const gb = (id: number, type: string, value: number, ...more: GreatBuildingBonus[]): Building => ({
    id,
    owner: playerId(1),
    def: buildingDefId(`X_${id}`),
    category: 'greatBuilding',
    x: 0,
    y: 0,
    connected: true,
    state: { kind: 'idle' },
    greatBuilding: { level: 1, maxLevel: 2, bonuses: [{ type, value }, ...more] },
  });
  const city = (...buildings: Building[]): City => ({
    world: worldId('de20'),
    owner: playerId(1),
    map: 'main',
    era: eraId('IronAge'),
    takenAt: 0,
    buildings: new Map(buildings.map((b) => [b.id, b])),
  });

  it('sums the contribution boosts of the own great buildings and limited ones not already counted', () => {
    const own = city(gb(1769, 'contribution_boost', 95.5), gb(701, 'supplies_boost', 300));
    expect(arcBonus(own)).toEqual({ copper: 95.5, gold: 0 });
    expect(
      arcBonus(own, [
        { type: 'contribution_boost', value: 5 },
        { type: 'contribution_boost', value: 95.5, entityId: 1769 },
        { type: 'supplies_boost', value: 300, entityId: 701 },
      ]),
    ).toEqual({ copper: 100.5, gold: 0 });
    expect(arcBonus(undefined)).toEqual({ copper: 0, gold: 0 });
  });

  it('sums the gold boosts apart, a limited one of the Arc skipped per type (Arc 2026-11-05: 93 and 12)', () => {
    const own = city(
      gb(
        1769,
        'contribution_boost',
        93,
        { type: 'clan_goods', value: 1845 },
        { type: 'contribution_boost_gold', value: 12 },
      ),
    );
    expect(arcBonus(own)).toEqual({ copper: 93, gold: 12 });
    expect(
      arcBonus(own, [
        { type: 'contribution_boost_gold', value: 12, entityId: 1769 },
        { type: 'contribution_boost_gold', value: 3 },
        { type: 'contribution_boost', value: 5, entityId: 9 },
      ]),
    ).toEqual({ copper: 98, gold: 15 });
  });

  it('takes the value of the tier of the level a construction goes to', () => {
    const arc = { copper: 93, gold: 12 };
    const gold = { era: 'FutureEra', levelCosts: [], maxTier: 'gold' as const };
    expect(arcBonusAt(arc, gold, 99)).toBe(93);
    // the construction from 100 goes to level 101, the first gold level
    expect(arcBonusAt(arc, gold, 100)).toBe(12);
    expect(arcBonusAt(arc, { ...gold, maxTier: 'copper' }, 137)).toBe(93);
    expect(arcBonusAt(arc, undefined, 137)).toBe(93);
    expect(
      arcBonusAt(arc, gold, 120, [
        { tier: 'copper', startLevel: 1 },
        { tier: 'gold', startLevel: 150 },
      ]),
    ).toBe(93);
  });

  it('is answered by the player bonus store from the own city and the limited bonuses', () => {
    const cities = new CityStore(createBus());
    const bonuses = new PlayerBonusStore(cities);
    expect(bonuses.arcBonus()).toEqual({ copper: 0, gold: 0 });
    bonuses.setLimited([{ type: 'contribution_boost', value: 5 }]);
    expect(bonuses.arcBonus()).toEqual({ copper: 5, gold: 0 });
    cities.setOwn(city(gb(1769, 'contribution_boost', 95.5, { type: 'contribution_boost_gold', value: 12 })));
    expect(bonuses.arcBonus()).toEqual({ copper: 100.5, gold: 12 });
  });
});
