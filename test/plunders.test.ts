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
import { ResearchStore } from '../src/content/stores/research';
import { ResourceStore } from '../src/content/stores/resources';
import { SessionStore } from '../src/content/stores/session';
import { ShieldStore } from '../src/content/stores/shields';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Plunder } from '../src/shared/model';
import fixture from './fixtures/pvp-plunder.json';
import doubleLoot from './fixtures/pvp-plunder-double-loot.json';
import repelled from './fixtures/pvp-plunder-repelled.json';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const opponent = playerId(1001);
const AT = 1_792_438_656_000;

function setup(me: number | null = fixture.me) {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const { db, persistence, plunders: plunderDb, incoming, shields } = testDb();
  const plunders = new PlunderStore(bus, world, plunderDb);
  const cities = new CityStore(bus);
  let now = AT;
  registerGameHandlers(ingestion, {
    world,
    bus,
    now: () => now,
    session,
    players: new PlayerStore(bus, { load: async () => [], put: async () => {} }),
    cities,
    catalog: new CatalogStore(bus),
    resources: new ResourceStore(bus),
    research: new ResearchStore(bus),
    battles: new BattleStore(bus, world, persistence),
    plunders,
    incoming: new IncomingStore(bus, world, incoming),
    shields: new ShieldStore(bus, world, shields),
  });
  const recorded: PlayerId[] = [];
  bus.on('plunder.recorded', (e) => recorded.push(e.opponent));
  const send = (entries: unknown[], request: unknown[] | null = null) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: request && JSON.stringify(request),
      response: JSON.stringify(entries),
      at: 0,
    });
  if (me !== null)
    send([
      { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: me } } },
    ]);
  return { db, plunderDb, plunders, recorded, send, cities, setNow: (at: number) => (now = at) };
}

/** the fixture batch with the plunderById response changed */
const batchWith = (change: Record<string, unknown>) => {
  const batch = structuredClone(fixture.batch);
  const plunder = batch.find((e) => e.requestMethod === 'plunderById');
  Object.assign(plunder?.responseData ?? {}, change);
  return batch;
};

const plunder = (entityId: number, at: number, opp = 1001, change: Partial<Plunder> = {}): Plunder => ({
  world,
  at,
  opponent: playerId(opp),
  outcome: 'plundered',
  entityId,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { money: 110 },
  doubleLoot: false,
  ...change,
});

const repelledAt = (at: number): Plunder => ({
  world,
  at,
  opponent,
  outcome: 'repelled',
  resources: {},
  doubleLoot: false,
});

describe('recording plunders', () => {
  it('records a plunder with the loot and the plundered building', async () => {
    const { plunders, recorded, send } = setup();
    send(fixture.batch);
    expect(await plunders.latest(opponent)).toEqual({
      world,
      at: AT,
      opponent,
      outcome: 'plundered',
      entityId: 350,
      cityEntityId: 'R_IronAge_Residential2',
      resources: { money: 110 },
      doubleLoot: false,
    });
    expect(recorded).toEqual([opponent]);
  });

  it('marks Double Loot and keeps the loot as the game reports it', async () => {
    const { plunders, send } = setup(doubleLoot.me);
    send(doubleLoot.batch);
    expect(await plunders.latest(opponent)).toMatchObject({
      entityId: 1230,
      cityEntityId: 'R_ProgressiveEra_Residential2',
      resources: { money: 1220 },
      doubleLoot: true,
    });
  });

  it('does not take the Double Loot icon of another building', async () => {
    const { plunders, send } = setup(doubleLoot.me);
    const batch = structuredClone(doubleLoot.batch);
    const icons = batch.find((e) => e.requestMethod === 'showEntityIcons')?.responseData as { id: number }[];
    for (const icon of icons) icon.id = 7;
    send(batch);
    expect((await plunders.latest(opponent))?.doubleLoot).toBe(false);
  });

  it('ignores unknown results', async () => {
    const { plunders, recorded, send } = setup();
    send(batchWith({ result: 'failed' }));
    const unknown = structuredClone(repelled.batch);
    Object.assign(unknown.find((e) => e.requestMethod === 'plunderById')?.responseData ?? {}, { result: 'failed' });
    send(unknown);
    expect(await plunders.totals()).toEqual({ count: 0, repelled: 0, fp: 0 });
    expect(recorded).toEqual([]);
  });

  it('records a repelled plunder against the player of the same response, without building and loot', async () => {
    const { plunders, recorded, send } = setup(repelled.me);
    send(repelled.batch);
    expect(await plunders.latest(opponent)).toEqual({
      world,
      at: AT,
      opponent,
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    });
    expect(recorded).toEqual([opponent]);
  });

  // the request as the game sends it (seen 2026-10-20): `[playerId, entityId]`
  const plunderRequest = (opp: number, entityId: number) => [
    { requestClass: 'OtherPlayerService', requestMethod: 'plunderById', requestData: [opp, entityId] },
  ];

  it('takes opponent and building of a repelled plunder from the request', async () => {
    const result = repelled.batch.filter((e) => e.requestMethod === 'plunderById');
    const { plunders, recorded, send, cities } = setup(repelled.me);
    cities.setVisited({
      world,
      owner: opponent,
      map: 'main',
      era: eraId('ColonialAge'),
      takenAt: AT,
      buildings: new Map([
        [
          904,
          {
            id: 904,
            owner: opponent,
            def: buildingDefId('R_MultiAge_PatrickBonusSet20b'),
            type: 'residential',
            x: 0,
            y: 0,
            connected: true,
            state: { kind: 'idle' },
          },
        ],
      ]),
      visit: { neighbor: true, friend: false, guildMember: false },
    });
    send(result, plunderRequest(1001, 904));
    expect(await plunders.latest(opponent)).toMatchObject({
      outcome: 'repelled',
      entityId: 904,
      cityEntityId: 'R_MultiAge_PatrickBonusSet20b',
    });
    expect(recorded).toEqual([opponent]);
  });

  it('keeps a repelled plunder without definition when the city of the opponent is not the visited one', async () => {
    const result = repelled.batch.filter((e) => e.requestMethod === 'plunderById');
    const { plunders, send } = setup(repelled.me);
    send(result, plunderRequest(1001, 904));
    const stored = await plunders.latest(opponent);
    expect(stored).toMatchObject({ outcome: 'repelled', entityId: 904 });
    expect(stored).not.toHaveProperty('cityEntityId');
  });

  it('ignores a repelled plunder unless its response names exactly one other player', async () => {
    const result = repelled.batch.filter((e) => e.requestMethod === 'plunderById');
    const update = repelled.batch.filter((e) => e.requestMethod === 'updatePlayer');
    const players = [
      {
        requestClass: 'OtherPlayerService',
        requestMethod: 'updatePlayer',
        responseData: [{ player_id: 1001 }, { player_id: 1002 }],
      },
    ];
    const { plunders, recorded, send } = setup(repelled.me);
    send(result);
    send([...players, ...result]);
    send([...update, ...update, ...result]);
    // updatePlayer in an earlier response does not count
    send(update);
    send(result);
    expect((await plunders.totals()).repelled).toBe(0);
    expect(recorded).toEqual([]);
    const own = setup(1001);
    own.send(repelled.batch);
    expect((await own.plunders.totals()).repelled).toBe(0);
    const noSession = setup(null);
    noSession.send(repelled.batch);
    expect((await noSession.plunders.totals()).repelled).toBe(0);
  });

  it('stores a repelled plunder seen twice once', async () => {
    const { plunders, recorded, send, plunderDb } = setup(repelled.me);
    send(repelled.batch);
    send(repelled.batch);
    expect((await plunders.totals()).repelled).toBe(1);
    expect(recorded).toHaveLength(1);
    const later = new PlunderStore(createBus(), world, plunderDb);
    later.record(repelledAt(AT));
    expect((await later.totals()).repelled).toBe(1);
  });

  it('needs the loot and the building from the same response', async () => {
    const { plunders, send } = setup();
    const loot = fixture.batch.filter((e) => e.requestMethod === 'plunderById');
    const building = fixture.batch.filter((e) => e.requestMethod === 'reset');
    send(building);
    send(loot);
    expect((await plunders.totals()).count).toBe(0);
  });

  it('ignores a plundered building of the session player and needs a session', async () => {
    const own = setup(1001);
    own.send(fixture.batch);
    expect((await own.plunders.totals()).count).toBe(0);
    const noSession = setup(null);
    noSession.send(fixture.batch);
    expect((await noSession.plunders.totals()).count).toBe(0);
  });

  it('stores a plunder seen twice once', async () => {
    const { plunders, plunderDb, recorded } = setup();
    plunders.record(plunder(350, AT));
    plunders.record(plunder(350, AT));
    expect((await plunders.totals()).count).toBe(1);
    expect(recorded).toHaveLength(1);
    // a later session sees the same plunder again
    const later = new PlunderStore(createBus(), world, plunderDb);
    later.record(plunder(350, AT));
    expect((await later.totals()).count).toBe(1);
  });

  it('keeps a later plunder of the same building', async () => {
    const { plunders, send, setNow } = setup();
    send(fixture.batch);
    setNow(AT + 86_400_000);
    send(fixture.batch);
    expect((await plunders.totals()).count).toBe(2);
  });
});

describe('plunder queries', () => {
  async function filled() {
    const { plunders, db } = setup(null);
    for (const p of [
      plunder(1, 100, 1001, { resources: { strategy_points: 10, money: 5 } }),
      plunder(2, 300, 1002, { resources: { strategy_points: 7 } }),
      plunder(3, 200),
      repelledAt(250),
    ]) {
      plunders.record(p);
    }
    // a plunder of another world goes in directly, the store only records its own world
    await db.plunders.put(plunder(4, 400, 1001, { world: worldId('en1'), resources: { strategy_points: 99 } }));
    return { plunders, db };
  }

  it('lists newest first with paging and an opponent filter', async () => {
    const { plunders } = await filled();
    const ids = async (q: Parameters<PlunderStore['list']>[0]) => (await plunders.list(q)).map((p) => p.entityId);
    expect(await ids({ limit: 10, offset: 0 })).toEqual([2, undefined, 3, 1]);
    expect(await ids({ limit: 2, offset: 2 })).toEqual([3, 1]);
    expect(await ids({ opponents: [opponent], limit: 10, offset: 0 })).toEqual([undefined, 3, 1]);
    expect(await ids({ opponents: [], limit: 10, offset: 0 })).toEqual([]);
  });

  it('counts plunders and repelled ones apart and sums the Forge points of plunders', async () => {
    const { plunders } = await filled();
    expect(await plunders.totals()).toEqual({ count: 3, repelled: 1, fp: 17 });
    expect(await plunders.totals([opponent])).toEqual({ count: 2, repelled: 1, fp: 10 });
    expect(await plunders.totals([])).toEqual({ count: 0, repelled: 0, fp: 0 });
  });

  it('finds the latest plunder of a player, repelled ones included', async () => {
    const { plunders } = await filled();
    expect(await plunders.latest(opponent)).toEqual(repelledAt(250));
    expect((await plunders.latest(playerId(1002)))?.entityId).toBe(2);
    expect(await plunders.latest(playerId(9999))).toBeUndefined();
  });

  it('prunes plunders older than the limit in every world', async () => {
    const { plunders, db } = await filled();
    expect(await plunders.prune(260)).toBe(3);
    expect((await db.plunders.toArray()).map((p) => p.entityId).sort()).toEqual([2, 4]);
  });
});
