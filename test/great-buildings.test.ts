import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { toGreatBuildingEntity } from '../src/content/game/convert';
import { registerGameHandlers } from '../src/content/game/handlers';
import { playerId } from '../src/shared/ids';
import fixture from './fixtures/great-buildings.json';
import { testStores } from './helpers/stores';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores({ now: () => 5_000 });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const events: string[] = [];
  bus.on('greatBuilding.opened', (e) => events.push(`opened:${e.owner}:${e.entityId}:${e.own ? 'own' : 'foreign'}`));
  bus.on('greatBuilding.changed', (e) => events.push(`changed:${e.reason}`));
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
  const ws = (requestClass: string, requestMethod: string, responseData: unknown) =>
    ingestion.accept({ kind: 'ws', data: JSON.stringify([{ requestClass, requestMethod, responseData }]), at: 0 });
  send(...(fixture.startup as Entry[]));
  const open = (entityId: number) => {
    const o = fixture.openings.find((x) => x.entity.requestData[0] === entityId);
    if (!o) throw new Error(`no opening ${entityId}`);
    send(o.entity as Entry);
    send(o.construction as Entry);
  };
  return { ...stores, events, send, ws, open };
}

const entry = (
  requestMethod: string,
  requestData: unknown,
  responseData: unknown,
  requestClass = 'GreatBuildingsService',
) => ({
  requestClass,
  requestMethod,
  requestData,
  responseData,
});

describe('great building handlers and store', () => {
  it('opens a foreign construction with the building from its opening and keeps its state', async () => {
    const { greatBuildings, events, open } = setup();
    open(1909);
    const c = greatBuildings.current();
    expect(c).toMatchObject({ owner: 1001, entityId: 1909, own: false, seenAt: 5_000 });
    expect(c?.entity).toEqual({
      owner: 1001,
      entityId: 1909,
      def: 'X_EarlyMiddleAge_Landmark2',
      level: 75,
      maxLevel: 76,
      invested: 251,
      required: 3062,
      connected: true,
    });
    expect(c?.rankings[0]).toEqual({ player: 1001, name: 'Eigentümer 1001', self: false, fp: 251 });
    expect(c?.rankings[1]).toEqual({
      rank: 1,
      name: 'Noch kein Mäzen',
      self: false,
      reward: { fp: 730, blueprints: 15, medals: 1080 },
    });
    expect(events).toEqual(['opened:1001:1909:foreign']);
    expect(await greatBuildings.known(playerId(1001))).toEqual([
      {
        world: 'de20',
        owner: 1001,
        entityId: 1909,
        cityEntityId: 'X_EarlyMiddleAge_Landmark2',
        level: 75,
        invested: 251,
        required: 3062,
        bestRate: 192.6,
        seenAt: 5_000,
      },
    ]);
  });

  it('keeps the production of the next level from the construction with the level it was opened at', () => {
    const { greatBuildings, send } = setup();
    const o = fixture.openings.find((x) => x.entity.requestData[0] === 1909);
    if (!o) throw new Error('no opening 1909');
    send(o.entity as Entry);
    send({
      ...o.construction,
      responseData: {
        ...o.construction.responseData,
        next_production_bonus: { type: 'strategy_points', value: 31, amount: -1 },
      },
    } as Entry);
    expect(greatBuildings.current()?.nextProduction).toEqual({ level: 75, type: 'strategy_points', value: 31 });
    // a construction without it, or one that cannot be placed on a building, keeps none
    send(o.entity as Entry);
    send(o.construction as Entry);
    expect(greatBuildings.current()?.nextProduction).toBeUndefined();
  });

  it('marks the own row and keeps one row per building', async () => {
    const { greatBuildings, open } = setup();
    open(650);
    open(1500);
    open(650);
    expect(greatBuildings.current()?.rankings.find((r) => r.self)).toMatchObject({ rank: 1, player: 1000, fp: 696 });
    const known = await greatBuildings.known();
    expect(known.map((k) => [k.entityId, k.bestRate])).toEqual([
      [650, undefined],
      [1500, undefined],
    ]);
  });

  it('opens an own construction with the building of the own city and stores nothing', async () => {
    const { greatBuildings, events, send } = setup();
    send(fixture.own as Entry);
    expect(greatBuildings.current()).toMatchObject({
      owner: 1000,
      own: true,
      entity: { entityId: 1769, invested: 5145, required: 21777, level: 135, connected: true },
    });
    expect(greatBuildings.current()?.rankings[0]).toMatchObject({ self: true, fp: 5132 });
    expect(events).toEqual(['opened:1000:1769:own']);
    expect(await greatBuildings.known()).toEqual([]);
  });

  it('shows a finished level beside the current rankings and returns to them', () => {
    const { greatBuildings, events, send, open } = setup();
    open(2434);
    const current = greatBuildings.current()?.rankings;
    send(fixture.ranking as Entry);
    expect(greatBuildings.current()?.past?.level).toBe(52);
    expect(greatBuildings.current()?.past?.rankings[0]).toMatchObject({ rank: 1, fp: 1020 });
    expect(greatBuildings.current()?.rankings).toBe(current);
    // the level being built is 53
    send(entry('getConstructionRanking', [2434, 1002, 53], fixture.openings[3]?.construction.responseData.rankings));
    expect(greatBuildings.current()?.past).toBeUndefined();
    expect(events).toEqual(['opened:1002:2434:foreign', 'changed:ranking', 'changed:ranking']);
  });

  it('ignores rankings of another building', () => {
    const { greatBuildings, events, send, open } = setup();
    open(2434);
    send(entry('getConstructionRanking', [650, 1002, 49], []));
    expect(greatBuildings.current()?.past).toBeUndefined();
    expect(events).toEqual(['opened:1002:2434:foreign']);
  });

  it('adds an own contribution to the invested Forge points (assumed format)', async () => {
    const { greatBuildings, events, send, open } = setup();
    open(1909);
    const mine = { rank: 1, player: { player_id: 1000, name: 'Ich', is_self: true }, forge_points: 1406 };
    send(
      entry(
        'contributeForgePoints',
        [1909, 1001, 76, 1406, false],
        [{ player: { player_id: 1001 }, forge_points: 251 }, mine],
      ),
    );
    expect(greatBuildings.current()?.entity?.invested).toBe(1657);
    expect(greatBuildings.current()?.rankings[1]).toMatchObject({ self: true, fp: 1406 });
    // the answer may also be the construction itself; 10 more FP on the own place
    send(entry('contributeForgePoints', [], { rankings: [{ ...mine, forge_points: 1416 }] }));
    expect(greatBuildings.current()?.entity?.invested).toBe(1667);
    expect(events).toEqual(['opened:1001:1909:foreign', 'changed:contributed', 'changed:contributed']);
    expect((await greatBuildings.known(playerId(1001)))[0]?.invested).toBe(1667);
  });

  it('marks the open construction as levelled when the event names its owner and building (assumed format)', () => {
    const { greatBuildings, events, send, ws, open } = setup();
    send(...(fixture.overviews as Entry[]));
    open(1909);
    const event = (name: string, owner = 1001) => ({
      type: 'great_building_contribution',
      other_player: { player_id: owner, name: 'x' },
      great_building_name: name,
      level: 76,
      rank: 1,
    });
    ws('OtherPlayerService', 'newEvent', event('Alcatraz'));
    ws('OtherPlayerService', 'newEvent', event('Aachener Dom', 1002));
    expect(greatBuildings.current()?.leveled).toBeUndefined();
    ws('OtherPlayerService', 'newEvent', event('Aachener Dom'));
    expect(greatBuildings.current()?.leveled).toEqual({ level: 76, rank: 1 });
    expect(events).toEqual(['opened:1001:1909:foreign', 'changed:leveled']);
  });

  it('keeps the limited bonuses that are active', () => {
    const { greatBuildings, send } = setup();
    send(
      entry(
        'getLimitedBonuses',
        [],
        [
          { type: 'contribution_boost', value: 5, isActive: true },
          { type: 'supplies_boost', value: 300, entityId: 701 },
          { type: 'contribution_boost', value: 7, isActive: false },
        ],
        'BonusService',
      ),
    );
    expect(greatBuildings.limitedBonuses()).toEqual([
      { type: 'contribution_boost', value: 5 },
      { type: 'supplies_boost', value: 300, entityId: 701 },
    ]);
  });

  it('keeps the invested Forge points of the own great buildings current', () => {
    const { cities, send } = setup();
    const arc = fixture.startup[0]?.responseData.city_map.entities[0];
    send(
      entry('updateEntity', [], [{ ...arc, state: { ...arc?.state, invested_forge_points: 5200 } }], 'CityMapService'),
    );
    expect(cities.own()?.buildings.get(1769)?.greatBuilding?.investedFp).toBe(5200);
  });

  it('takes a building without connected for not connected', () => {
    const e = { id: 1, player_id: 2, cityentity_id: 'X', type: 'greatbuilding', level: 1, max_level: 2, state: {} };
    expect(toGreatBuildingEntity(e)).toMatchObject({ connected: false, invested: 0, required: 0 });
    expect(toGreatBuildingEntity({ ...e, type: 'residential' })).toBeNull();
  });
});
