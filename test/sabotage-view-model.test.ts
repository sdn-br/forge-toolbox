import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import type { CityAssessment } from '../src/content/domain/assess-city';
import { sabotageViewModel } from '../src/content/features/sabotage/view-model';
import { type BuildingDef, CatalogStore } from '../src/content/stores/catalog';
import type { VisitedCity } from '../src/content/stores/cities';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, Plunder } from '../src/shared/model';

const city: VisitedCity = {
  world: worldId('de20'),
  owner: playerId(1001),
  era: eraId('ColonialAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(),
  visit: { neighbor: true, friend: false, guildMember: false },
};

const assessment: CityAssessment = {
  army: { attacker: { attack: 100, defense: 90 }, defender: { attack: 376, defense: 402 } },
  plunderRepel: 0,
  plunderable: [],
  missingDefs: [],
  boostTotals: {},
};

const now = new Date(2026, 9, 19, 15, 0).getTime();
const battle: Battle = {
  world: city.world,
  battleId: 1,
  at: new Date(2026, 9, 19, 13, 49).getTime(),
  opponent: city.owner,
  result: 'won',
  auto: true,
  rounds: 2,
  era: city.era,
  attacker: { bonuses: { attack_boost: 233, military_boost: 135 }, units: [] },
  defender: {
    bonuses: { defender_attack_boost: 353, defense_boost: 390, fierce_resistance: 32.5, advanced_tactics: 20.5 },
    units: [],
  },
};

const vmOf = (showArmy: boolean, last?: Battle) =>
  sabotageViewModel(city, undefined, assessment, new CatalogStore(createBus()), showArmy, now, last);

describe('sabotage view model', () => {
  it('shows the measured defending army with the time of the battle', () => {
    expect(vmOf(true, battle).measured).toEqual({ defender: { attack: 406, defense: 443 }, when: 'heute 13:49' });
    expect(vmOf(true, battle).army).toEqual(assessment.army);
  });

  it('has no measured values without a battle or when army values are hidden', () => {
    expect(vmOf(true).measured).toBeUndefined();
    expect(vmOf(false, battle).measured).toBeUndefined();
  });

  it('lists the plunderable buildings with named resources', () => {
    const vm = sabotageViewModel(
      city,
      undefined,
      { ...assessment, plunderable: [{ building: 1, name: 'Haus', resources: { money: 20 } }] },
      new CatalogStore(createBus()),
      false,
      now,
    );
    expect(vm.plunderable).toEqual([{ name: 'Haus', items: [{ label: 'Münzen', amount: 20 }] }]);
  });

  it('shows the last own plunder here with building, loot and Double Loot, and the totals', () => {
    const catalog = new CatalogStore(createBus());
    catalog.setResourceNames({ marble: 'Marmor' });
    catalog.add({ id: buildingDefId('R_IronAge_Residential2'), name: 'Strohdachhaus' } as BuildingDef);
    const last: Plunder = {
      world: city.world,
      at: new Date(2026, 9, 19, 14, 5).getTime(),
      opponent: city.owner,
      outcome: 'plundered',
      entityId: 350,
      cityEntityId: buildingDefId('R_IronAge_Residential2'),
      resources: { marble: 30, strategy_points: 2 },
      doubleLoot: true,
    };
    const vm = (plunders?: Parameters<typeof sabotageViewModel>[7]) =>
      sabotageViewModel(city, undefined, assessment, catalog, false, now, undefined, plunders).plundered;
    expect(vm({ last, totals: { count: 3, repelled: 0, fp: 9 } })).toEqual({
      last: {
        when: 'heute 14:05',
        repelled: false,
        building: 'Strohdachhaus',
        loot: '30 Marmor, 2 Forge-Punkte',
        doubleLoot: true,
      },
      totals: '3 Plünderungen, 9 FP',
    });
    expect(vm({ totals: { count: 0, repelled: 0, fp: 0 } })).toEqual({
      last: undefined,
      totals: '0 Plünderungen, 0 FP',
    });
    expect(vm()).toBeUndefined();
  });

  it('tells when the last own plunder here was repelled and counts repelled ones apart', () => {
    const last: Plunder = {
      world: city.world,
      at: new Date(2026, 9, 19, 14, 5).getTime(),
      opponent: city.owner,
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    };
    const vm = sabotageViewModel(city, undefined, assessment, new CatalogStore(createBus()), false, now, undefined, {
      last,
      totals: { count: 5, repelled: 2, fp: 120 },
    });
    expect(vm.plundered).toEqual({
      last: { when: 'heute 14:05', repelled: true },
      totals: '5 Plünderungen, 2 abgewehrt, 120 FP',
    });
  });
});
