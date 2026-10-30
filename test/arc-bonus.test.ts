import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { arcBonus } from '../src/content/domain/arc-bonus';
import type { Building, City } from '../src/content/model/city';
import { CityStore } from '../src/content/stores/cities';
import { PlayerBonusStore } from '../src/content/stores/player-bonuses';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';

describe('arcBonus', () => {
  const gb = (id: number, type: string, value: number): Building => ({
    id,
    owner: playerId(1),
    def: buildingDefId(`X_${id}`),
    type: 'greatbuilding',
    x: 0,
    y: 0,
    connected: true,
    state: { kind: 'idle' },
    greatBuilding: { level: 1, maxLevel: 2, bonus: { type, value } },
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
    expect(arcBonus(own)).toBe(95.5);
    expect(
      arcBonus(own, [
        { type: 'contribution_boost', value: 5 },
        { type: 'contribution_boost', value: 95.5, entityId: 1769 },
        { type: 'supplies_boost', value: 300, entityId: 701 },
      ]),
    ).toBe(100.5);
    expect(arcBonus(undefined)).toBe(0);
  });

  it('is answered by the player bonus store from the own city and the limited bonuses', () => {
    const cities = new CityStore(createBus());
    const bonuses = new PlayerBonusStore(cities);
    expect(bonuses.arcBonus()).toBe(0);
    bonuses.setLimited([{ type: 'contribution_boost', value: 5 }]);
    expect(bonuses.arcBonus()).toBe(5);
    cities.setOwn(city(gb(1769, 'contribution_boost', 95.5)));
    expect(bonuses.arcBonus()).toBe(100.5);
  });
});
