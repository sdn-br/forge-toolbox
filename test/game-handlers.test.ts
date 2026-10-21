import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { IncomingStore } from '../src/content/stores/incoming';
import { PlayerStore } from '../src/content/stores/players';
import { PlunderStore } from '../src/content/stores/plunders';
import { ResourceStore } from '../src/content/stores/resources';
import { SessionStore } from '../src/content/stores/session';
import { ShieldStore } from '../src/content/stores/shields';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

function setup() {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const players = new PlayerStore(bus, { load: async () => [], put: async () => {} });
  const cities = new CityStore(bus);
  const catalog = new CatalogStore(bus);
  const resources = new ResourceStore(bus);
  registerGameHandlers(ingestion, {
    world: worldId('de20'),
    bus,
    now: () => 1_000_000,
    session,
    players,
    cities,
    catalog,
    resources,
    battles: new BattleStore(bus, worldId('de20'), testDb().persistence),
    plunders: new PlunderStore(bus, worldId('de20'), testDb().plunders),
    incoming: new IncomingStore(bus, worldId('de20'), testDb().incoming),
    shields: new ShieldStore(bus, worldId('de20'), testDb().shields),
  });
  const events: string[] = [];
  bus.on('city.visited', () => events.push('visited'));
  bus.on('city.visitedChanged', () => events.push('visitedChanged'));
  bus.on('city.ownChanged', (e) => events.push(e.reset ? 'ownReset' : 'ownChanged'));
  bus.on('army.opened', (e) => events.push(`army:${e.battleType}`));
  bus.on('catalog.grid', () => events.push('grid'));
  bus.on('resources.changed', () => events.push('resources'));
  const send = (requestClass: string, requestMethod: string, responseData: unknown, requestData?: unknown) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: requestData === undefined ? null : JSON.stringify([{ requestClass, requestMethod, requestData }]),
      response: JSON.stringify([{ requestClass, requestMethod, responseData }]),
      at: 0,
    });
  const meta = (id: string, json: unknown) =>
    ingestion.accept({
      kind: 'meta',
      url: `https://cdn/start/metadata?id=${id}`,
      response: JSON.stringify(json),
      at: 0,
    });
  return { session, players, cities, catalog, resources, events, send, meta };
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

  it('keeps the unlocked areas of the city, with coordinates the game leaves out as 0', () => {
    const { cities, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7 },
      city_map: {
        entities: [],
        unlocked_areas: [
          { __class__: 'CityMapArea', width: 16, length: 16 },
          { __class__: 'CityMapArea', x: 16, y: 4, width: 4, length: 4 },
          { __class__: 'CityMapArea', x: 20 },
        ],
      },
    });
    expect(cities.own()?.areas).toEqual([
      { x: 0, y: 0, width: 16, length: 16 },
      { x: 16, y: 4, width: 4, length: 4 },
    ]);
  });

  it('keeps the blocked areas and the open expansions of the own city', () => {
    const { cities, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7 },
      city_map: {
        entities: [],
        blocked_areas: [
          { width: 4, length: 4 },
          { x: 64, y: 8, width: 4, length: 4 },
        ],
        tilesets: [
          {
            type: 'tileset_reward',
            available: true,
            requirements: { cost: { resources: { money: 20_000_000, premium: 1500 } } },
          },
          {
            type: 'raidMedals',
            available: true,
            requirements: { cost: { resources: { guild_raids_medals: 600_000 } } },
          },
          {
            type: 'tileset_premium',
            available: true,
            requirements: { min_era: 'MarsAge', cost: { resources: { premium: 2000 } } },
          },
          { available: true },
        ],
      },
    });
    const city = cities.own();
    expect(city?.blocked).toEqual([
      { x: 0, y: 0, width: 4, length: 4 },
      { x: 64, y: 8, width: 4, length: 4 },
    ]);
    expect(city?.expansions).toEqual([
      { kind: 'tileset_reward', cost: { money: 20_000_000, premium: 1500 } },
      { kind: 'raidMedals', cost: { guild_raids_medals: 600_000 } },
      { kind: 'tileset_premium', minEra: 'MarsAge', cost: { premium: 2000 } },
    ]);
  });

  it('keeps the resources of the player from the resource bag', () => {
    const { resources, events, send } = setup();
    send('ResourceService', 'getPlayerResourceBag', {
      __class__: 'ResourceBag',
      resources: { money: 45_000_000, expansions: 2, guild_raids_medals: 700_000 },
    });
    expect(resources.amount('money')).toBe(45_000_000);
    expect(resources.amount('expansions')).toBe(2);
    expect(resources.amount('premium')).toBe(0);
    expect(resources.known).toBe(true);
    expect(events).toEqual(['resources']);
  });

  it('keeps the main grid of the city from the grid metadata, with positions the game leaves out as 0', () => {
    const { catalog, events, meta } = setup();
    meta('grid-ab12', [
      { id: 'other', width: 10, height: 10, sectors: [] },
      {
        id: 'main',
        width: 72,
        height: 72,
        sectors: [
          { type: 'Regular', tilePositions: [{}, { x: 4 }, { x: 4, y: 4 }] },
          { type: 'Water', tilePositions: [{ x: 8 }] },
        ],
      },
    ]);
    expect(catalog.cityGrid()).toEqual({
      width: 72,
      height: 72,
      blocks: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
    });
    expect(events).toEqual(['grid']);
  });

  it('leaves the areas unknown when the game sends none', () => {
    const { cities, send } = setup();
    send('StartupService', 'getData', { user_data: { player_id: 7 }, city_map: { entities: [] } });
    expect(cities.own()?.areas).toBeUndefined();
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

  it('announces the army window with the battle type the request names', () => {
    const { events, send } = setup();
    send('ArmyUnitManagementService', 'getArmyInfo', {}, [{ __class__: 'ArmyContext', battleType: 'pvp' }]);
    send('ArmyUnitManagementService', 'getArmyInfo', {}, [{ __class__: 'ArmyContext', battleType: 'gvg' }]);
    send('ArmyUnitManagementService', 'getArmyInfo', {});
    send('ArmyUnitManagementService', 'getArmyInfo', {}, [{ __class__: 'Other' }]);
    expect(events).toEqual(['army:pvp', 'army:gvg']);
  });
});
