import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import type { CityAssessment } from '../src/content/domain/assess-city';
import { sabotageViewModel } from '../src/content/features/sabotage/view-model';
import { CatalogStore } from '../src/content/stores/catalog';
import type { VisitedCity } from '../src/content/stores/cities';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle } from '../src/shared/model';

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
});
