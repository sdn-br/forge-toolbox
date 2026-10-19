import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { measuredArmy } from '../src/content/domain/measured-army';
import type { GameBattle } from '../src/content/game/game-types';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { PlayerStore } from '../src/content/stores/players';
import { SessionStore } from '../src/content/stores/session';
import { eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle } from '../src/shared/model';
import fixture from './fixtures/pvp-battle.json';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const opponent = playerId(1001);

function setup(me: number | null = fixture.me) {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const players = new PlayerStore(bus, { load: async () => [], put: async () => {} });
  const { db, persistence } = testDb();
  const battles = new BattleStore(bus, world, persistence);
  registerGameHandlers(ingestion, {
    world,
    now: () => 0,
    session,
    players,
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    battles,
  });
  const recorded: PlayerId[] = [];
  bus.on('battle.recorded', (e) => recorded.push(e.opponent));
  const send = (entries: unknown[]) =>
    ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: JSON.stringify(entries), at: 0 });
  if (me !== null)
    send([
      { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: me } } },
    ]);
  return { db, persistence, battles, players, recorded, send };
}

/** the fixture batch with the battle response changed */
const batchWith = (change: Partial<GameBattle>, state: NonNullable<GameBattle['state']> = {}) => {
  const batch = structuredClone(fixture.batch);
  const b = batch[1]?.responseData as GameBattle;
  Object.assign(b, change);
  Object.assign(b.state ?? {}, state);
  return batch;
};

const side = (bonuses: Record<string, number> = {}) => ({ bonuses, units: [] });
const battle = (battleId: number, at: number, opp = 1001, w = world): Battle => ({
  world: w,
  battleId,
  at,
  opponent: playerId(opp),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('IronAge'),
  attacker: side(),
  defender: side(),
});

describe('recording battles', () => {
  it('records a PvP battle the session player attacked in', async () => {
    const { battles, players, recorded, send } = setup();
    send(fixture.batch);
    const b = await battles.latest(opponent);
    expect(b).toMatchObject({
      world,
      battleId: 5001,
      at: 1_792_417_798_000,
      opponent,
      result: 'won',
      auto: true,
      rounds: 2,
      era: 'ColonialAge',
    });
    expect(b?.attacker.bonuses).toEqual({ military_boost: 135, attack_boost: 233, attacker_defense_boost: 134 });
    expect(b?.defender.bonuses).toEqual({
      advanced_tactics: 20.5,
      fierce_resistance: 32.5,
      defense_boost: 390,
      defender_attack_boost: 353,
      attack_boost: 12,
    });
    expect(b?.attacker.units).toHaveLength(8);
    expect(b?.attacker.units[0]).toEqual({ unitTypeId: 'grenadier', startHp: 10, endHp: 4 });
    expect(b?.defender.units.map((u) => u.endHp)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(recorded).toEqual([opponent]);
    expect(players.get(opponent)).toMatchObject({ name: 'Testgegner', source: 'update' });
  });

  it('derives the measured army values from the raw bonuses', async () => {
    const { battles, send } = setup();
    send(fixture.batch);
    const b = await battles.latest(opponent);
    expect(b && measuredArmy(b)).toEqual({
      attacker: { attack: 368, defense: 269 },
      defender: { attack: 406, defense: 443 },
    });
  });

  it('ignores battles that are not PvP', async () => {
    const { battles, recorded, send } = setup();
    send(batchWith({ battleType: { type: 'guild_expedition', era: 'ColonialAge' } }));
    expect(await battles.count()).toBe(0);
    expect(recorded).toEqual([]);
  });

  it('ignores battles where the session player is not the attacker', async () => {
    const other = setup(1001);
    other.send(fixture.batch);
    expect(await other.battles.count()).toBe(0);
    const noSession = setup(null);
    noSession.send(fixture.batch);
    expect(await noSession.battles.count()).toBe(0);
  });

  it('stores a battle seen twice once', async () => {
    const { battles, persistence, recorded, send } = setup();
    send(fixture.batch);
    send(fixture.batch);
    expect(await battles.count()).toBe(1);
    expect(recorded).toHaveLength(1);
    // a later session sees the same battle again
    const later = new BattleStore(createBus(), world, persistence);
    later.record((await battles.latest(opponent)) as Battle);
    expect(await later.count()).toBe(1);
  });

  it('maps lost and surrendered battles and skips battles without a result', async () => {
    const { battles, send } = setup();
    send(batchWith({ battleId: 1 }, { winnerBit: 2 }));
    send(batchWith({ battleId: 2 }, { winnerBit: 2, surrenderBit: 1 }));
    send(batchWith({ battleId: 3 }, { winnerBit: 0 }));
    const rows = await battles.list({ limit: 10, offset: 0 });
    expect(rows.map((r) => [r.battleId, r.result]).sort()).toEqual([
      [1, 'lost'],
      [2, 'surrendered'],
    ]);
  });
});

describe('battle queries', () => {
  async function filled() {
    const { battles, db } = setup(null);
    for (const b of [battle(1, 100), battle(2, 300, 1002), battle(3, 200), battle(4, 400, 1001, worldId('en1'))]) {
      battles.record(b);
    }
    // a battle of another world goes in directly, the store only records its own world
    await db.battles.put(battle(4, 400, 1001, worldId('en1')));
    return { battles, db };
  }

  it('lists newest first with paging and an opponent filter', async () => {
    const { battles } = await filled();
    const ids = async (q: Parameters<BattleStore['list']>[0]) => (await battles.list(q)).map((b) => b.battleId);
    expect(await ids({ limit: 10, offset: 0 })).toEqual([2, 3, 1]);
    expect(await ids({ limit: 2, offset: 1 })).toEqual([3, 1]);
    expect(await ids({ opponents: [opponent], limit: 10, offset: 0 })).toEqual([3, 1]);
    expect(await ids({ opponents: [], limit: 10, offset: 0 })).toEqual([]);
    expect(await battles.count()).toBe(3);
    expect(await battles.count([playerId(1002)])).toBe(1);
  });

  it('finds the latest battle against a player', async () => {
    const { battles } = await filled();
    expect((await battles.latest(opponent))?.battleId).toBe(3);
    expect(await battles.latest(playerId(9999))).toBeUndefined();
  });

  it('prunes battles older than the limit in every world', async () => {
    const { battles, db } = await filled();
    expect(await battles.prune(250)).toBe(2);
    expect((await db.battles.toArray()).map((b) => b.battleId).sort()).toEqual([2, 4]);
  });
});

describe('database upgrade', () => {
  it('keeps the players of version 1 when adding the battles table', async () => {
    const name = 'upgrade-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ players: '[world+id], world, seenAt' });
    await v1.table('players').put({ world, id: 7, seenAt: 1 });
    v1.close();
    const db = openDb(name);
    expect(await db.players.count()).toBe(1);
    await db.battles.put(battle(1, 100));
    expect(await db.battles.count()).toBe(1);
  });
});
