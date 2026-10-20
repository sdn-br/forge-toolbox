import { describe, expect, it } from 'vitest';
import { type AssessContext, assessCity } from '../src/content/domain/assess-city';
import { toBuildingDef } from '../src/content/game/building-defs';
import { toCity } from '../src/content/game/convert';
import type { GameCityEntity } from '../src/content/game/game-types';
import type { BuildingDef } from '../src/content/stores/catalog';
import { type BuildingDefId, buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import ownCity from './fixtures/own-city.json';
import fixture from './fixtures/visit-industrial.json';
import setsAndChains from './fixtures/visit-sets-chains.json';

const lookup = (defs: unknown[], eras: string[] = []): AssessContext => {
  const map = new Map<BuildingDefId, BuildingDef>();
  for (const json of defs) {
    const def = toBuildingDef(json);
    if (def) map.set(def.id, def);
  }
  return { def: (id) => map.get(id), eraByLevel: (level) => (eras[level] ? eraId(eras[level]) : undefined) };
};

const cityOf = (entities: GameCityEntity[], era = 'IndustrialAge') =>
  toCity(worldId('de20'), playerId(1001), era, 'main', entities, 0);

describe('assessCity with a recorded city', () => {
  const city = cityOf(fixture.visit.city_map.entities as GameCityEntity[], fixture.visit.other_player_era);
  const result = assessCity(city, lookup(fixture.defs, fixture.eras));

  it('sums building and great building boosts per army side', () => {
    // building boosts for all features (297/198/246/67, summed independently from the raw data)
    // plus Zeus and Aachen (military_boost 60.5) and Observatorium (fierce_resistance 65.5)
    expect(result.army).toEqual({
      attacker: { attack: 357.5, defense: 258.5 },
      defender: { attack: 311.5, defense: 132.5 },
    });
  });

  it('knows every definition of the city', () => {
    expect(result.missingDefs).toEqual([]);
  });
});

const house = (id: number, state: object, def = 'R_Test_House'): GameCityEntity => ({
  id,
  player_id: 1001,
  cityentity_id: def,
  type: 'residential',
  x: 0,
  y: 0,
  connected: 1,
  state,
});

const defs = lookup([
  {
    id: 'R_Test_House',
    name: 'Haus',
    __class__: 'CityEntityResidentialBuilding',
    type: 'residential',
    abilities: [{ __class__: 'MotivatableAbility' }],
  },
  {
    id: 'G_Test_Generic',
    name: 'Generisch',
    __class__: 'GenericCityEntity',
    abilities: [],
    components: {
      AllAge: { socialInteraction: { interactionType: 'motivate' } },
      IndustrialAge: {
        production: { options: [{ products: [{ playerResources: { resources: { strategy_points: 5 } } }] }] },
        boosts: {
          boosts: [
            { type: 'att_boost_attacker', value: 3, targetedFeature: 'all' },
            { type: 'att_boost_attacker', value: 50, targetedFeature: 'battleground' },
          ],
        },
      },
    },
  },
  {
    id: 'G_Test_Treasury',
    name: 'Schatzkammer',
    __class__: 'GenericCityEntity',
    abilities: [{ __class__: 'AddResourcesToGuildTreasuryAbility' }],
    components: {},
  },
  // shaped like the Siegesturm, Wunschbrunnen or Druidentempel: a generic building that cannot be motivated
  {
    id: 'G_Test_Tower',
    name: 'Turm',
    __class__: 'GenericCityEntity',
    abilities: [],
    components: {
      AllAge: { flags: { flags: 19 } },
      IndustrialAge: {
        production: { options: [{ products: [{ playerResources: { resources: { money: 100 } } }] }] },
      },
    },
  },
  {
    id: 'G_Test_Event',
    name: 'Eventgebäude',
    __class__: 'GenericCityEntity',
    abilities: [],
    components: {
      AllAge: { flags: { flags: 19 }, socialInteraction: { interactionType: 'motivate' } },
      IndustrialAge: {
        production: {
          options: [
            {
              products: [
                { playerResources: { resources: { all_goods_of_age: 10 } } },
                { onlyWhenMotivated: true, playerResources: { resources: { strategy_points: 4 } } },
              ],
            },
          ],
        },
      },
    },
  },
]);

const generic = (id: number, state: object, def = 'G_Test_Generic'): GameCityEntity => ({
  ...house(id, state),
  cityentity_id: def,
  type: 'generic_building',
});

describe('assessCity against the game', () => {
  it('matches the boosts the game reports for the own city', () => {
    const city = cityOf(ownCity.entities as GameCityEntity[], ownCity.era);
    const { boostTotals } = assessCity(city, lookup(ownCity.defs, ownCity.eras));
    const military = (totals: Record<string, number>) =>
      Object.fromEntries(Object.entries(totals).filter(([type]) => /^(att|def)_/.test(type)));
    expect(military(boostTotals)).toEqual(military(ownCity.expectedBoosts));
  });

  it('connects every link of the chains in a recorded city', () => {
    const city = cityOf(
      setsAndChains.visit.city_map.entities as GameCityEntity[],
      setsAndChains.visit.other_player_era,
    );
    const { missingDefs, army } = assessCity(city, lookup(setsAndChains.defs, setsAndChains.eras));
    expect(missingDefs).toEqual([]);
    expect(army.attacker.attack).toBeGreaterThan(0);
  });
});

describe('assessCity rules', () => {
  it('lists only finished buildings, the game hides when the others are ready', () => {
    const result = assessCity(
      cityOf([
        house(1, {
          __class__: 'ProducingState',
          next_state_transition_at: 500,
          current_product: { product: { resources: { money: 10 } } },
        }),
        house(2, { __class__: 'ProductionFinishedState', current_product: { product: { resources: { money: 20 } } } }),
      ]),
      defs,
    );
    expect(result.plunderable).toEqual([{ building: 2, name: 'Haus', resources: { money: 20 } }]);
  });

  it('protects motivated buildings', () => {
    const result = assessCity(
      cityOf([
        house(1, {
          __class__: 'ProductionFinishedState',
          is_motivated: true,
          current_product: { product: { resources: { money: 20 } } },
        }),
      ]),
      defs,
    );
    expect(result.plunderable).toEqual([]);
  });

  // a visited city marks motivation as a social interaction, not as is_motivated
  it('protects buildings motivated in a visited city', () => {
    const result = assessCity(
      cityOf([
        house(1, {
          __class__: 'ProductionFinishedState',
          socialInteractionId: 'motivate',
          current_product: { product: { resources: { money: 20 } } },
        }),
      ]),
      defs,
    );
    expect(result.plunderable).toEqual([]);
  });

  // a visited city sends no current_product for finished generic buildings
  // checked in the game: a finished generic building the visit sends without a product has nothing to plunder
  it('never lists a finished building the visit sends without a product', () => {
    const result = assessCity(cityOf([generic(1, { __class__: 'ProductionFinishedState' })]), defs);
    expect(result.plunderable).toEqual([]);
  });

  it('lists a finished generic building with the product the visit sends', () => {
    const result = assessCity(
      cityOf([
        generic(1, {
          __class__: 'ProductionFinishedState',
          current_product: { product: { resources: { strategy_points: 7 } } },
        }),
      ]),
      defs,
    );
    expect(result.plunderable[0]?.resources).toEqual({ strategy_points: 7 });
  });

  it('never lists generic buildings that cannot be motivated', () => {
    const result = assessCity(
      cityOf([
        generic(1, { __class__: 'ProductionFinishedState' }, 'G_Test_Tower'),
        generic(
          2,
          {
            __class__: 'ProductionFinishedState',
            current_product: { product: { resources: { money: 100 } } },
          },
          'G_Test_Tower',
        ),
      ]),
      defs,
    );
    expect(result.plunderable).toEqual([]);
  });

  // checked in the game: a Mondtor St. 6 was plundered with 5,100 coins, 2 FP and 17 medals
  it('lists a building whose production has medals', () => {
    const result = assessCity(
      cityOf([
        house(1, {
          __class__: 'ProductionFinishedState',
          current_product: { product: { resources: { money: 5100, strategy_points: 2, medals: 17 } } },
        }),
      ]),
      defs,
    );
    expect(result.plunderable[0]?.resources).toEqual({ money: 5100, strategy_points: 2, medals: 17 });
  });

  it('counts only boosts for all features and none of unconnected buildings', () => {
    const result = assessCity(
      cityOf([generic(1, { __class__: 'IdleState' }), generic(2, { __class__: 'UnconnectedState' })]),
      defs,
    );
    expect(result.army.attacker.attack).toBe(3);
  });

  it('never lists buildings that feed the guild treasury', () => {
    const result = assessCity(
      cityOf([
        {
          ...house(1, {
            __class__: 'ProductionFinishedState',
            current_product: { product: { resources: { money: 1 } } },
          }),
          cityentity_id: 'G_Test_Treasury',
        },
      ]),
      defs,
    );
    expect(result.plunderable).toEqual([]);
  });

  it('reports definitions that are not loaded yet', () => {
    const result = assessCity(cityOf([house(1, { __class__: 'IdleState' }, 'R_Unknown')]), defs);
    expect(result.missingDefs).toEqual([buildingDefId('R_Unknown')]);
  });
});
