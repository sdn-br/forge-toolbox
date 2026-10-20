import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { measuredArmy } from '../src/content/domain/measured-army';
import type { GameBattle, GameBattleState } from '../src/content/game/game-types';
import { registerGameHandlers } from '../src/content/game/handlers';
import { BattleStore } from '../src/content/stores/battles';
import { CatalogStore } from '../src/content/stores/catalog';
import { CityStore } from '../src/content/stores/cities';
import { IncomingStore } from '../src/content/stores/incoming';
import { PlayerStore } from '../src/content/stores/players';
import { PlunderStore } from '../src/content/stores/plunders';
import { SessionStore } from '../src/content/stores/session';
import { ShieldStore } from '../src/content/stores/shields';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle } from '../src/shared/model';
import fixture from './fixtures/pvp-battle.json';
import manual from './fixtures/pvp-manual-battle.json';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const opponent = playerId(1001);

function setup(me: number | null = fixture.me) {
  const bus = createBus();
  const ingestion = new Ingestion();
  const session = new SessionStore(bus);
  const players = new PlayerStore(bus, { load: async () => [], put: async () => {} });
  const { db, persistence, plunders, incoming, shields } = testDb();
  const battles = new BattleStore(bus, world, persistence);
  registerGameHandlers(ingestion, {
    world,
    bus,
    now: () => 0,
    session,
    players,
    cities: new CityStore(bus),
    catalog: new CatalogStore(bus),
    battles,
    plunders: new PlunderStore(bus, world, plunders),
    incoming: new IncomingStore(bus, world, incoming),
    shields: new ShieldStore(bus, world, shields),
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
      // the game counts rounds from 0 and omits the field in the first round
      rounds: 3,
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

  it('counts a battle that ended in the first round, where the game omits the round, as one round', async () => {
    const { battles, send } = setup();
    send(batchWith({ battleId: 4 }, { surrenderBit: 1, winnerBit: undefined, round: undefined }));
    expect((await battles.list({ limit: 1, offset: 0 }))[0]?.rounds).toBe(1);
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

describe('recording manual battles', () => {
  /** the end of the manual battle with its state changed */
  const endWith = (state: Record<string, unknown>) => {
    const end = structuredClone(manual.end);
    Object.assign(end[1]?.responseData ?? {}, state);
    return end;
  };

  it('records a manual battle once it ends, with auto false', async () => {
    const { battles, recorded, send } = setup(manual.me);
    send(manual.start);
    expect(await battles.count()).toBe(0);
    send(manual.end);
    send(manual.end);
    expect(await battles.count()).toBe(1);
    const b = await battles.latest(opponent);
    expect(b).toMatchObject({
      battleId: 5002,
      at: 1_792_438_262_000,
      opponent,
      result: 'won',
      auto: false,
      rounds: 2,
      era: 'ColonialAge',
    });
    expect(b?.attacker.units).toHaveLength(8);
    expect(b?.defender.units).toEqual([
      { unitTypeId: 'javeliner', startHp: 10, endHp: 0 },
      { unitTypeId: 'javeliner', startHp: 10, endHp: 0 },
    ]);
    expect(Object.keys(b?.attacker.bonuses ?? {}).length).toBeGreaterThan(0);
    expect(recorded).toEqual([opponent]);
  });

  it('takes the bonuses from the start and falls back to the end', async () => {
    const start = structuredClone(manual.start);
    const startUnits = start[0]?.responseData.state.unitsOrder ?? [];
    for (const u of startUnits) u.bonuses = [{ type: 'attack_boost', value: 7, __class__: 'UnitBonus' }];
    const fromStart = setup(manual.me);
    fromStart.send(start);
    fromStart.send(manual.end);
    expect((await fromStart.battles.latest(opponent))?.attacker.bonuses).toEqual({ attack_boost: 7 });

    for (const u of startUnits) u.bonuses = [];
    const end = endWith({});
    const endState = end[1]?.responseData as GameBattleState | undefined;
    for (const u of endState?.unitsOrder ?? []) u.bonuses = [{ type: 'attack_boost', value: 9 }];
    const fromEnd = setup(manual.me);
    fromEnd.send(start);
    fromEnd.send(end);
    expect((await fromEnd.battles.latest(opponent))?.attacker.bonuses).toEqual({ attack_boost: 9 });
  });

  it('keeps the battle pending while moves come without a result', async () => {
    const { battles, send } = setup(manual.me);
    send(manual.start);
    send(endWith({ winnerBit: undefined }));
    expect(await battles.count()).toBe(0);
    send(manual.end);
    expect(await battles.count()).toBe(1);
  });

  it('ignores a move without a pending battle', async () => {
    const { battles, send } = setup(manual.me);
    send(manual.end);
    expect(await battles.count()).toBe(0);
  });

  it('ignores a pending battle that is not PvP or not attacked by the session player', async () => {
    const pve = structuredClone(manual.start);
    if (pve[0]) pve[0].responseData.battleType.type = 'guild_expedition';
    const a = setup(manual.me);
    a.send(pve);
    a.send(manual.end);
    expect(await a.battles.count()).toBe(0);
    const b = setup(1001);
    b.send(manual.start);
    b.send(manual.end);
    expect(await b.battles.count()).toBe(0);
  });

  it('replaces the pending battle with the next start', async () => {
    const { battles, send } = setup(manual.me);
    send(manual.start);
    const next = structuredClone(manual.start);
    if (next[0]) next[0].responseData.battleId = 5003;
    send(next);
    send(manual.end);
    expect((await battles.list({ limit: 10, offset: 0 })).map((r) => r.battleId)).toEqual([5003]);
  });

  it('forgets the pending battle when a battle of another type starts', async () => {
    const { battles, send } = setup(manual.me);
    send(manual.start);
    const pve = structuredClone(manual.start);
    if (pve[0]) pve[0].responseData.battleType.type = 'guild_expedition';
    send(pve);
    send(manual.end);
    expect(await battles.count()).toBe(0);
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
  it('keeps the players of version 1 and the battles of version 2', async () => {
    const name = 'upgrade-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ players: '[world+id], world, seenAt' });
    await v1.table('players').put({ world, id: 7, seenAt: 1 });
    v1.close();
    const v2 = new Dexie(name);
    v2.version(1).stores({ players: '[world+id], world, seenAt' });
    v2.version(2).stores({ battles: '[world+battleId], [world+at], [world+opponent+at], at' });
    await v2.table('battles').put(battle(1, 100));
    v2.close();
    const db = openDb(name);
    expect(await db.players.count()).toBe(1);
    expect(await db.battles.count()).toBe(1);
    await db.plunders.put({
      world,
      at: 100,
      opponent,
      outcome: 'plundered',
      entityId: 1,
      cityEntityId: buildingDefId('R_X'),
      resources: {},
      doubleLoot: false,
    });
    expect(await db.plunders.count()).toBe(1);
  });

  it('rebuilds the unreleased plunders table of version 3 with a key a repelled plunder fits', async () => {
    const name = 'upgrade-v3-test';
    const v3 = new Dexie(name);
    v3.version(1).stores({ players: '[world+id], world, seenAt' });
    v3.version(2).stores({ battles: '[world+battleId], [world+at], [world+opponent+at], at' });
    v3.version(3).stores({ plunders: '[world+opponent+entityId+at], [world+at], [world+opponent+at], at' });
    await v3.table('players').put({ world, id: 7, seenAt: 1 });
    await v3.table('battles').put(battle(1, 100));
    v3.close();
    const db = openDb(name);
    expect(await db.players.count()).toBe(1);
    expect(await db.battles.count()).toBe(1);
    await db.plunders.put({ world, at: 100, opponent, outcome: 'repelled', resources: {}, doubleLoot: false });
    expect(await db.plunders.count()).toBe(1);
  });

  it('adds attacks on the own city to version 5 and keeps the plunders', async () => {
    const name = 'upgrade-v5-test';
    const v5 = new Dexie(name);
    v5.version(1).stores({ players: '[world+id], world, seenAt' });
    v5.version(2).stores({ battles: '[world+battleId], [world+at], [world+opponent+at], at' });
    v5.version(3).stores({ plunders: '[world+opponent+entityId+at], [world+at], [world+opponent+at], at' });
    v5.version(4).stores({ plunders: null });
    v5.version(5).stores({ plunders: '[world+opponent+at], [world+at], at' });
    await v5.table('plunders').put({ world, at: 100, opponent, outcome: 'repelled', resources: {}, doubleLoot: false });
    v5.close();
    const db = openDb(name);
    expect(await db.plunders.count()).toBe(1);
    await db.incoming.put({ world, kind: 'battle', key: 1, at: 100, attacker: opponent, defense: 'broken' });
    await db.incoming.put({ world, kind: 'plunder', key: 1, at: 100, attacker: opponent });
    expect(await db.incoming.count()).toBe(2);
  });
});
