import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import { buildingDefId } from '../src/shared/ids';
import contributions from './fixtures/gb-contributions.json';
import ownLevelUp from './fixtures/gb-own-level-up.json';
import ranking from './fixtures/gb-ranking.json';
import { testStores } from './helpers/stores';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData?: unknown;
  responseData: unknown;
}

/** a definition without listed levels: every answer then comes from what was seen */
const bare: GreatBuildingDef = { era: 'AllAge', levelCosts: [] };

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores({ now: () => 5_000 });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const send = (...entries: Entry[]) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: JSON.stringify(
        entries.map(({ requestClass, requestMethod, requestData }) => ({ requestClass, requestMethod, requestData })),
      ),
      response: JSON.stringify(
        entries.map(({ requestClass, requestMethod, responseData }) => ({ requestClass, requestMethod, responseData })),
      ),
      at: 0,
    });
  const seen = (type: string, level: number) => stores.gbLevelCosts.cost(bare, buildingDefId(type), level)?.fp;
  return { send, seen, stores };
}

const entity = (id: number, owner: number, type: string, level: number, required?: number) => ({
  id,
  cityentity_id: type,
  type: 'greatbuilding',
  connected: 1,
  level,
  max_level: level + 1,
  player_id: owner,
  state: { invested_forge_points: 3, ...(required !== undefined && { forge_points_for_level_up: required }) },
});

describe('costs of great building levels from the game traffic', () => {
  it('learns the own buildings of the startup data and an own level up', () => {
    const { send, seen } = setup();
    send(...(ownLevelUp.startup as Entry[]));
    expect(seen('X_ProgressiveEra_Landmark2', 12)).toBe(894);
    send(...(ownLevelUp.contribution as Entry[]));
    expect(seen('X_ProgressiveEra_Landmark2', 13)).toBe(917);
  });

  it('learns an opened foreign building and the buildings of a visited city', () => {
    const { send, seen } = setup();
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getOtherPlayerCityMapEntity',
      requestData: [10, 2001],
      responseData: entity(10, 2001, 'X_FutureEra_Landmark1', 137, 62495),
    });
    expect(seen('X_FutureEra_Landmark1', 137)).toBe(62495);
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'visitPlayer',
      responseData: {
        other_player: { player_id: 2002, name: 'Nachbar' },
        city_map: { entities: [entity(11, 2002, 'X_BronzeAge_Landmark1', 88, 3667), entity(12, 2002, 'X', 5)] },
      },
    });
    expect(seen('X_BronzeAge_Landmark1', 88)).toBe(3667);
    expect(seen('X', 5)).toBeUndefined();
  });

  it('learns the rows of a list of another player, own rows too', () => {
    const { send, seen } = setup();
    send(...(contributions.startup as Entry[]));
    send({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getOtherPlayerOverview',
      requestData: [2001],
      responseData: [
        {
          entity_id: 1,
          city_entity_id: 'X_ByzantineEra_Landmark1',
          level: 64,
          current_progress: 10,
          max_progress: 2385,
          player: { player_id: 2001, name: 'A' },
        },
      ],
    });
    expect(seen('X_ByzantineEra_Landmark1', 64)).toBe(2385);
  });

  it('learns the town hall list of the own contributions', () => {
    const { send, seen } = setup();
    send(...(contributions.startup as Entry[]));
    send(contributions.contributions as Entry);
    const [first] = contributions.contributions.responseData;
    expect(seen(first?.city_entity_id as string, first?.level as number)).toBe(first?.max_progress);
  });

  it('learns the rows of the great building ranking', () => {
    const { send, seen } = setup();
    send(ranking.opened as Entry);
    const [first] = ranking.opened.responseData.rankings;
    expect(seen(first?.cityEntityId as string, first?.level as number)).toBe(first?.requiredPoints);
  });
});
