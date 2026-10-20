import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { PlayerStore } from '../src/content/stores/players';
import { PlunderStore } from '../src/content/stores/plunders';
import { SessionStore } from '../src/content/stores/session';
import { buildingDefId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Plunder } from '../src/shared/model';
import fixture from './fixtures/pvp-plunder.json';
import doubleLoot from './fixtures/pvp-plunder-double-loot.json';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const opponent = playerId(1001);
const AT = 1_792_438_656_000;

function setup(me: number | null = fixture.me) {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const { db, persistence, plunders: plunderDb } = testDb();
  const plunders = new PlunderStore(bus, world, plunderDb);
  let now = AT;
  registerGameHandlers(ingestion, {
    world,
    now: () => now,
    session,
    players: new PlayerStore(bus, { load: async () => [], put: async () => {} }),
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    battles: new BattleStore(bus, world, persistence),
    plunders,
  });
  const recorded: PlayerId[] = [];
  bus.on('plunder.recorded', (e) => recorded.push(e.opponent));
  const send = (entries: unknown[]) =>
    ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: JSON.stringify(entries), at: 0 });
  if (me !== null)
    send([
      { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: me } } },
    ]);
  return { db, plunderDb, plunders, recorded, send, setNow: (at: number) => (now = at) };
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
  entityId,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { money: 110 },
  doubleLoot: false,
  ...change,
});

describe('recording plunders', () => {
  it('records a plunder with the loot and the plundered building', async () => {
    const { plunders, recorded, send } = setup();
    send(fixture.batch);
    expect(await plunders.latest(opponent)).toEqual({
      world,
      at: AT,
      opponent,
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

  it('ignores results other than success', async () => {
    const { plunders, recorded, send } = setup();
    send(batchWith({ result: 'failed' }));
    expect((await plunders.totals()).count).toBe(0);
    expect(recorded).toEqual([]);
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
    expect(await ids({ limit: 10, offset: 0 })).toEqual([2, 3, 1]);
    expect(await ids({ limit: 2, offset: 1 })).toEqual([3, 1]);
    expect(await ids({ opponents: [opponent], limit: 10, offset: 0 })).toEqual([3, 1]);
    expect(await ids({ opponents: [], limit: 10, offset: 0 })).toEqual([]);
  });

  it('counts plunders and sums their Forge points', async () => {
    const { plunders } = await filled();
    expect(await plunders.totals()).toEqual({ count: 3, fp: 17 });
    expect(await plunders.totals([opponent])).toEqual({ count: 2, fp: 10 });
    expect(await plunders.totals([])).toEqual({ count: 0, fp: 0 });
  });

  it('finds the latest plunder of a player', async () => {
    const { plunders } = await filled();
    expect((await plunders.latest(opponent))?.entityId).toBe(3);
    expect(await plunders.latest(playerId(9999))).toBeUndefined();
  });

  it('prunes plunders older than the limit in every world', async () => {
    const { plunders, db } = await filled();
    expect(await plunders.prune(250)).toBe(2);
    expect((await db.plunders.toArray()).map((p) => p.entityId).sort()).toEqual([2, 4]);
  });
});
