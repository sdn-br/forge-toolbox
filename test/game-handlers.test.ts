import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { PlayerStore } from '../src/content/stores/players';
import { SessionStore } from '../src/content/stores/session';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

function setup() {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const players = new PlayerStore(bus, { load: async () => [], put: async () => {} });
  const cities = new CityStore(bus);
  registerGameHandlers(ingestion, {
    world: worldId('de20'),
    now: () => 1_000_000,
    session,
    players,
    cities,
    catalog: new CatalogStore(bus),
    battles: new BattleStore(bus, worldId('de20'), testDb().persistence),
  });
  const events: string[] = [];
  bus.on('city.visited', () => events.push('visited'));
  bus.on('city.visitedChanged', () => events.push('visitedChanged'));
  bus.on('city.ownChanged', (e) => events.push(e.reset ? 'ownReset' : 'ownChanged'));
  const send = (requestClass: string, requestMethod: string, responseData: unknown) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([{ requestClass, requestMethod, responseData }]),
      at: 0,
    });
  return { session, players, cities, events, send };
}

const house = (id: number, owner: number, state: object) => ({
  id,
  player_id: owner,
  cityentity_id: 'R_IronAge_Residential1',
  type: 'residential',
  x: 1,
  y: 2,
  connected: 1,
  state,
});

describe('game handlers', () => {
  it('starts the session and the own city from the startup data', () => {
    const { session, cities, events, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7, user_name: 'Me', era: 'IronAge', clan_id: 3, clan_name: 'G' },
      city_map: { gridId: 'main', entities: [house(1, 7, { __class__: 'IdleState' })] },
    });
    expect(session.current).toMatchObject({ playerId: 7, name: 'Me', guild: { id: 3, name: 'G' } });
    expect(cities.own()?.buildings.get(1)?.state).toEqual({ kind: 'idle' });
    expect(events).toEqual(['ownReset']);
  });

  it('stores the visited player and city with the visit relation', () => {
    const { players, cities, send } = setup();
    send('OtherPlayerService', 'visitPlayer', {
      other_player: {
        player_id: 42,
        name: 'Neighbor',
        era: 'BronzeAge',
        is_neighbor: true,
        clan: { id: 5, name: 'Clan' },
      },
      other_player_era: 'BronzeAge',
      city_map: {
        entities: [
          house(10, 42, { __class__: 'ProducingState', next_state_transition_at: 2000, is_motivated: true }),
          house(11, 42, {
            __class__: 'ProductionFinishedState',
            current_product: { __class__: 'CityEntityProductionProduct', product: { resources: { money: 50 } } },
          }),
          house(12, 42, { __class__: 'SomethingNewState' }),
        ],
      },
    });
    expect(players.get(playerId(42))).toMatchObject({
      name: 'Neighbor',
      guild: { id: 5, name: 'Clan' },
      source: 'visit',
    });
    const city = cities.visited();
    expect(city?.visit.neighbor).toBe(true);
    expect(city?.buildings.get(10)?.state).toEqual({
      kind: 'producing',
      readyAt: 2_000_000,
      product: undefined,
      motivated: true,
      boosted: undefined,
    });
    expect(city?.buildings.get(11)?.state).toEqual({
      kind: 'finished',
      product: { resources: { money: 50 } },
      motivated: undefined,
    });
    expect(city?.buildings.get(12)?.state).toEqual({ kind: 'unknown', gameClass: 'SomethingNewState' });
  });

  it('routes a building reset to the city of its owner', () => {
    const { cities, events, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7 },
      city_map: { entities: [house(1, 7, { __class__: 'IdleState' })] },
    });
    send('OtherPlayerService', 'visitPlayer', {
      other_player: { player_id: 42 },
      city_map: { entities: [house(10, 42, { __class__: 'IdleState' })] },
    });
    events.length = 0;
    send('CityMapService', 'reset', [house(10, 42, { __class__: 'PlunderedState' })]);
    expect(cities.visited()?.buildings.get(10)?.state).toEqual({ kind: 'plundered' });
    expect(cities.own()?.buildings.get(1)?.state).toEqual({ kind: 'idle' });
    expect(events).toEqual(['visitedChanged']);
  });
});
