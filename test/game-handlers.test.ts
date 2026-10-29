import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { playerId } from '../src/shared/ids';
import { testStores } from './helpers/stores';

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores({ now: () => 1_000_000 });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const { session, players, cities, catalog, resources, research } = stores;
  const events: string[] = [];
  bus.on('city.visited', () => events.push('visited'));
  bus.on('city.visitedChanged', () => events.push('visitedChanged'));
  bus.on('city.ownChanged', (e) => events.push(e.reset ? 'ownReset' : 'ownChanged'));
  bus.on('army.opened', (e) => events.push(`army:${e.battleType}`));
  bus.on('catalog.grid', () => events.push('grid'));
  bus.on('resources.changed', () => events.push('resources'));
  bus.on('research.changed', () => events.push('research'));
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
  /** one response with several entries, as the game bundles them */
  const sendAll = (...entries: [string, string, unknown, unknown?][]) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: JSON.stringify(
        entries.map(([requestClass, requestMethod, , requestData]) => ({ requestClass, requestMethod, requestData })),
      ),
      response: JSON.stringify(
        entries.map(([requestClass, requestMethod, responseData]) => ({ requestClass, requestMethod, responseData })),
      ),
      at: 0,
    });
  return { session, players, cities, catalog, resources, research, events, send, sendAll, meta };
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

  it('takes the buildings in their new state from a harvest and a production start', () => {
    const { cities, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7 },
      city_map: { entities: [house(1, 7, { __class__: 'ProductionFinishedState' })] },
    });
    send(
      'CityProductionService',
      'pickupProduction',
      { updatedEntities: [house(1, 7, { __class__: 'IdleState' })], __class__: 'CityProductionResult' },
      [[1]],
    );
    expect(cities.own()?.buildings.get(1)?.state).toEqual({ kind: 'idle' });
    send(
      'CityProductionService',
      'startProduction',
      {
        updatedEntities: [house(1, 7, { __class__: 'ProducingState', next_state_transition_at: 2000 })],
        __class__: 'CityProductionResult',
      },
      [[1, 1]],
    );
    expect(cities.own()?.buildings.get(1)?.state).toMatchObject({ kind: 'producing', readyAt: 2_000_000 });
  });

  it('leaves the buildings of a settlement out of the own city until the main map loads again', () => {
    const { cities, send } = setup();
    send('StartupService', 'getData', {
      user_data: { player_id: 7 },
      city_map: { entities: [house(1, 7, { __class__: 'ProductionFinishedState' })] },
    });
    send('CityMapService', 'getCityMap', { gridId: 'cultural_outpost', entities: [] }, ['cultural_outpost']);
    const harvest = (id: number) =>
      send(
        'CityProductionService',
        'pickupProduction',
        { updatedEntities: [house(id, 7, { __class__: 'IdleState' })], __class__: 'CityProductionResult' },
        [[id]],
      );
    harvest(500);
    expect(cities.own()?.buildings.has(500)).toBe(false);
    send('CityMapService', 'getEntities', [], ['main']);
    harvest(1);
    expect(cities.own()?.buildings.get(1)?.state).toEqual({ kind: 'idle' });
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
        // shape seen 2026-10-21: bare positions of 4 × 4 blocks, x and y left out when 0
        blocked_areas: [{ __class__: 'Position' }, { x: 64, y: 8, __class__: 'Position' }],
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

  // shape seen 2026-10-21: the amounts sit in resources.resources
  it('keeps the resources of the player from the resource bag', () => {
    const { resources, events, send } = setup();
    send('ResourceService', 'getPlayerResourceBag', {
      type: { __enum__: 'ResourceBagType', value: 'PlayerMain' },
      resources: {
        resources: { money: 45_000_000, expansions: 2, guild_raids_medals: 700_000 },
        __class__: 'Resources',
      },
      __class__: 'ResourceBag',
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
          // shape seen 2026-10-21: the sector type is an enum object
          { type: { __enum__: 'GridSectorType', value: 'Regular' }, tilePositions: [{}, { x: 4 }, { x: 4, y: 4 }] },
          { type: { __enum__: 'GridSectorType', value: 'Water' }, tilePositions: [{ x: 8 }] },
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

  // shape seen 2026-10-21: an array of technologies in the order of the tree
  const tech = (id: string, name: string, rewards: object[]) => ({
    id,
    parents: [],
    children: [],
    era: 'BronzeAge',
    name,
    rewards,
    requirements: { resources: [], __class__: 'Resources' },
    level: 2,
    assetId: '',
    researchCost: { resources: { strategy_points: 4 }, __class__: 'Resources' },
    __class__: 'ResearchTechnology',
  });
  const reward = (type: string, subType: string, amount: number) => ({
    id: `${type}#${amount}#${subType}`,
    type,
    subType,
    amount,
    name: 'Erweiterung',
    iconAssetName: 'expansion',
    flags: [],
    value: String(amount),
    title: '',
    __class__: 'ResearchReward',
  });

  it('keeps the technologies with main city expansions from the research metadata, in its order', () => {
    const { research, events, meta } = setup();
    meta('research_eras-cd34', [{ era: 'BronzeAge', name: 'Bronzezeit' }]);
    expect(research.expansions()).toBeUndefined();
    meta('research-ab12', [
      tech('wheel', 'Das Rad', [reward('expansion', 'main', 1)]),
      tech('outpost', 'Außenposten', [reward('era_outpost_expansion', 'era_outpost', 3)]),
      tech('stellar', 'Sterne', [reward('stellar_city_expansion', 'stellar_city', 1), reward('building', 'x', 1)]),
      tech('mars_rules', 'Mars-Vorschriften', [reward('expansion', 'main', 2), reward('expansion', 'main', 1)]),
    ]);
    expect(research.expansions()).toEqual([
      { tech: 'wheel', name: 'Das Rad', amount: 1 },
      { tech: 'mars_rules', name: 'Mars-Vorschriften', amount: 3 },
    ]);
    expect(events).toEqual(['research']);
  });

  // shape seen 2026-10-21
  it('keeps the unlocked technologies from the research progress, and skips progress that is no object', () => {
    const { research, events, send } = setup();
    send('ResearchService', 'getProgress', []);
    expect(research.unlocked()).toBeUndefined();
    send('ResearchService', 'getProgress', {
      inProgressTechnologies: [],
      unlockedNodes: ['root', 'tribalcommunity', 'stilt_houses'],
      chosenBranches: [],
      __class__: 'ResearchProgress',
    });
    expect([...(research.unlocked() ?? [])]).toEqual(['root', 'tribalcommunity', 'stilt_houses']);
    expect(events).toEqual(['research']);
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

  describe('the city the game shows', () => {
    const visit = (owner: number): [string, string, unknown] => [
      'OtherPlayerService',
      'visitPlayer',
      { other_player: { player_id: owner }, city_map: { entities: [] } },
    ];

    it('follows a visit and the own city reloaded after a battle', () => {
      const { cities, send, sendAll } = setup();
      expect(cities.shown()).toBe('own');
      sendAll(visit(42));
      expect(cities.shown()).toBe(42);
      send('CityMapService', 'getEntities', [], ['main']);
      expect(cities.shown()).toBe('own');
    });

    it('takes the announcements as the return to the own city', () => {
      const { cities, send, sendAll } = setup();
      sendAll(visit(42));
      send('AnnouncementsService', 'fetchAllAnnouncements', []);
      expect(cities.shown()).toBe('own');
    });

    it('stays in the visited city when the own city comes in the same response as the visit', () => {
      // after a battle from a visited city the game reloads the own city and visits again (recorded 2026-10-20)
      const { cities, sendAll } = setup();
      sendAll(visit(42));
      sendAll(['CityMapService', 'getEntities', [], ['main']], visit(42));
      expect(cities.shown()).toBe(42);
    });

    it('does not take the map of a settlement for the own city', () => {
      const { cities, send, sendAll } = setup();
      sendAll(visit(42));
      send('CityMapService', 'getEntities', [], ['cultural_outpost']);
      expect(cities.shown()).toBe(42);
    });
  });
});
