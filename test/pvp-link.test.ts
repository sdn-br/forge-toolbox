import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { linkedBattles, relink } from '../src/persistence/pvp-link';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, BattleResult, FoughtBattle, InferredBattle, Plunder } from '../src/shared/model';
import { DAY_MS } from '../src/shared/time';
import recorded from './fixtures/pvp-battle-plunder.json';
import { testDb } from './helpers/battle-db';
import { testStores } from './helpers/stores';

const world = worldId('de20');
const T = 1_800_000_000_000;

const fought = (battleId: number, at: number, result: BattleResult = 'won', opp = 1001): FoughtBattle => ({
  world,
  battleId,
  at,
  opponent: playerId(opp),
  result,
  auto: true,
  rounds: 1,
  era: eraId('IronAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

const plunder = (at: number, outcome: Plunder['outcome'] = 'plundered', opp = 1001): Plunder => ({
  world,
  at,
  opponent: playerId(opp),
  outcome,
  resources: {},
  doubleLoot: false,
});

const inferred = (at: number, opp = 1001): InferredBattle => ({
  world,
  battleId: -at,
  at,
  opponent: playerId(opp),
  result: 'won',
  inferred: true,
  plunderAt: at,
});

/** the target as battle id → plunderAt (undefined without), inferred ones marked */
const shape = (battles: Battle[]) =>
  Object.fromEntries(
    [...battles]
      .sort((a, b) => a.battleId - b.battleId)
      .map((b) => [b.battleId, `${'inferred' in b ? 'inferred ' : ''}${b.plunderAt ?? '-'}`]),
  );

describe('linking plunders to battles', () => {
  it('takes a won battle exactly 24 h before the plunder and not one just older', () => {
    expect(shape(linkedBattles([fought(1, T - DAY_MS)], [plunder(T)]))).toEqual({ 1: `${T}` });
    expect(shape(linkedBattles([fought(1, T - DAY_MS - 1)], [plunder(T)]))).toEqual({
      1: '-',
      [-T]: `inferred ${T}`,
    });
  });

  it('takes a battle at the same time as the plunder but never one after it', () => {
    expect(shape(linkedBattles([fought(1, T)], [plunder(T)]))).toEqual({ 1: `${T}` });
    expect(shape(linkedBattles([fought(1, T + 1)], [plunder(T)]))).toEqual({ 1: '-', [-T]: `inferred ${T}` });
  });

  it('skips lost and surrendered battles and battles against another opponent', () => {
    const battles = [fought(1, T - 10, 'lost'), fought(2, T - 20, 'surrendered'), fought(3, T - 30, 'won', 1002)];
    expect(shape(linkedBattles(battles, [plunder(T)]))).toEqual({
      1: '-',
      2: '-',
      3: '-',
      [-T]: `inferred ${T}`,
    });
  });

  it('takes the latest won battle in the window', () => {
    expect(shape(linkedBattles([fought(1, T - 100), fought(2, T - 50)], [plunder(T)]))).toEqual({ 1: '-', 2: `${T}` });
  });

  it('gives a contested battle to the earlier plunder, the later one gets an inferred battle', () => {
    const target = linkedBattles([fought(1, T - 100)], [plunder(T + 10), plunder(T)]);
    expect(shape(target)).toEqual({ 1: `${T}`, [-(T + 10)]: `inferred ${T + 10}` });
  });

  it('links a repelled plunder like a successful one', () => {
    expect(shape(linkedBattles([fought(1, T - 100)], [plunder(T, 'repelled')]))).toEqual({ 1: `${T}` });
  });

  it('keeps exactly one inferred battle per unlinked plunder and drops other inferred ones', () => {
    const battles: Battle[] = [fought(1, T - 100), inferred(T), inferred(T - 5 * DAY_MS)];
    const target = linkedBattles(battles, [plunder(T), plunder(T + 2 * DAY_MS)]);
    expect(shape(target)).toEqual({ 1: `${T}`, [-(T + 2 * DAY_MS)]: `inferred ${T + 2 * DAY_MS}` });
    expect(target.find((b) => b.battleId === -(T + 2 * DAY_MS))).toEqual(inferred(T + 2 * DAY_MS));
  });

  it('drops a stale plunderAt and gives the same target when applied to its own result', () => {
    const stale = { ...fought(1, T - 100), plunderAt: T - 50 };
    const first = linkedBattles([stale, fought(2, T - 3 * DAY_MS)], [plunder(T), plunder(T - 2 * DAY_MS)]);
    expect(shape(first)).toEqual({ 1: `${T}`, 2: `${T - 2 * DAY_MS}` });
    expect(linkedBattles(first, [plunder(T), plunder(T - 2 * DAY_MS)])).toEqual(first);
  });
});

let dbs = 0;

describe('relinking in the database', () => {
  it('writes the target and nothing on a second run', async () => {
    const db = openDb(`pvp-link-${++dbs}`);
    await db.battles.bulkPut([fought(1, T - 100), inferred(T - 9 * DAY_MS)]);
    await db.plunders.bulkPut([plunder(T), plunder(T + 2 * DAY_MS)]);
    await relink(db, world, [playerId(1001)]);
    expect(shape(await db.battles.toArray())).toEqual({
      1: `${T}`,
      [-(T + 2 * DAY_MS)]: `inferred ${T + 2 * DAY_MS}`,
    });

    let writes = 0;
    db.battles.hook('creating', () => {
      writes++;
    });
    db.battles.hook('updating', () => {
      writes++;
    });
    db.battles.hook('deleting', () => {
      writes++;
    });
    await relink(db, world, [playerId(1001)]);
    expect(writes).toBe(0);
  });

  it('touches only the opponents named', async () => {
    const db = openDb(`pvp-link-${++dbs}`);
    await db.plunders.bulkPut([plunder(T, 'plundered', 1001), plunder(T + 1, 'plundered', 1002)]);
    await relink(db, world, [playerId(1002)]);
    expect((await db.battles.toArray()).map((b) => b.opponent)).toEqual([playerId(1002)]);
  });
});

/** the stored battles and plunders, in key order, to compare two databases */
const stateOf = async (db: ReturnType<typeof testDb>['db']) => ({
  battles: await db.battles.toArray(),
  plunders: await db.plunders.toArray(),
});

describe('writing battles and plunders', () => {
  const rows = {
    battles: [fought(1, T - 100), fought(2, T - 3 * DAY_MS)],
    plunders: [plunder(T), plunder(T + DAY_MS)],
  };

  it('ends in the same state whatever comes first, also with duplicates', async () => {
    const a = testDb();
    await a.persistence.put(rows.battles);
    await a.plunders.put(rows.plunders);
    const b = testDb();
    await b.plunders.put(rows.plunders);
    await b.persistence.put(rows.battles);
    const c = testDb();
    for (const p of rows.plunders) await c.plunders.put([p]);
    await c.persistence.put([rows.battles[0] as FoughtBattle]);
    await c.plunders.put(rows.plunders);
    await c.persistence.put(rows.battles);
    await c.persistence.put(rows.battles);

    const expected = await stateOf(a.db);
    expect(shape(expected.battles)).toEqual({ 1: `${T}`, 2: '-', [-(T + DAY_MS)]: `inferred ${T + DAY_MS}` });
    expect(await stateOf(b.db)).toEqual(expected);
    expect(await stateOf(c.db)).toEqual(expected);
  });

  it('keeps the link of a battle recorded again, which the game sends without it', async () => {
    const { db, persistence, plunders } = testDb();
    await persistence.put([fought(1, T - 100)]);
    await plunders.put([plunder(T)]);
    await persistence.put([fought(1, T - 100)]);
    expect((await db.battles.get([world, 1]))?.plunderAt).toBe(T);
  });

  it('replaces an inferred battle by the fought one that comes later', async () => {
    const { db, persistence, plunders } = testDb();
    await plunders.put([plunder(T)]);
    expect(shape(await db.battles.toArray())).toEqual({ [-T]: `inferred ${T}` });
    await persistence.put([fought(1, T - 100)]);
    expect(shape(await db.battles.toArray())).toEqual({ 1: `${T}` });
  });

  it('prunes a battle older than the limit only once its plunder goes too, so every kept plunder keeps its battle', async () => {
    const { db, persistence, plunders } = testDb();
    await persistence.put([fought(1, T - 100), fought(2, T - 200, 'lost'), fought(3, T - 2 * DAY_MS)]);
    await plunders.put([plunder(T), plunder(T - DAY_MS - 1000), plunder(T - 3 * DAY_MS)]);
    for (const before of [T - 2 * DAY_MS + 1, T - 50]) {
      await persistence.prune(before);
      await plunders.prune(before);
      const battles = await db.battles.toArray();
      for (const p of await db.plunders.toArray()) {
        expect(battles.filter((b) => b.opponent === p.opponent && b.plunderAt === p.at)).toHaveLength(1);
      }
    }
    // the battle before the limit stays for its plunder after it, the lost one goes
    expect(shape(await db.battles.toArray())).toEqual({ 1: `${T}` });
  });
});

describe('battle queries over plunders', () => {
  async function filled() {
    const env = testDb();
    await env.persistence.put([
      fought(1, T - 100, 'won', 1001),
      fought(2, T + 1000, 'won', 1001),
      fought(3, T - 50, 'won', 1002),
      fought(4, T + 2000, 'lost', 1002),
      fought(5, T + 3000, 'won', 1003),
    ]);
    await env.plunders.put([
      { ...plunder(T, 'plundered', 1001), resources: { strategy_points: 7 } },
      plunder(T, 'repelled', 1002),
      { ...plunder(T + 5 * DAY_MS, 'plundered', 1003), resources: { strategy_points: 2 } },
    ]);
    return env;
  }

  it('lists only battles with a plunder, newest first, paging across opponents, each with its plunder', async () => {
    const { persistence } = await filled();
    const opponents = [playerId(1001), playerId(1002), playerId(1003)];
    const ids = async (limit: number, offset: number) =>
      (await persistence.list(world, { opponents, withPlunder: true, limit, offset })).map((b) => b.battleId);
    expect(await ids(10, 0)).toEqual([-(T + 5 * DAY_MS), 3, 1]);
    expect(await ids(1, 1)).toEqual([3]);
    expect(await ids(2, 2)).toEqual([1]);
    const [first] = await persistence.list(world, { withPlunder: true, limit: 1, offset: 2 });
    expect(first?.plunder).toEqual({ ...plunder(T, 'plundered', 1001), resources: { strategy_points: 7 } });
    const all = await persistence.list(world, { limit: 10, offset: 0 });
    expect(all.find((b) => b.battleId === 2)?.plunder).toBeUndefined();
  });

  it('sums exactly the battles the list pages through', async () => {
    const { persistence } = await filled();
    const filters = [
      {},
      { withPlunder: true },
      { opponents: [playerId(1002)] },
      { opponents: [playerId(1001)], withPlunder: true },
    ];
    for (const filter of filters) {
      const listed = await persistence.list(world, { ...filter, limit: 100, offset: 0 });
      const summary = await persistence.summary(world, filter);
      expect(summary.battles).toBe(listed.length);
      expect(summary.won).toBe(listed.filter((b) => b.result === 'won').length);
      expect(summary.plunders + summary.repelled).toBe(listed.filter((b) => b.plunder).length);
    }
    expect(await persistence.summary(world, {})).toEqual({ battles: 6, won: 5, plunders: 2, repelled: 1, fp: 9 });
    expect(await persistence.summary(world, { opponents: [playerId(1002)] })).toEqual({
      battles: 2,
      won: 1,
      plunders: 0,
      repelled: 1,
      fp: 0,
    });
  });

  it('finds the latest battle, which may be inferred, and the latest fought one', async () => {
    const { persistence } = await filled();
    expect((await persistence.latest(world, playerId(1003)))?.battleId).toBe(-(T + 5 * DAY_MS));
    expect((await persistence.latestFought(world, playerId(1003)))?.battleId).toBe(5);
    expect(await persistence.latestFought(world, playerId(9999))).toBeUndefined();
  });
});

describe('database upgrade to version 13', () => {
  const v12 = (name: string) => {
    const db = new Dexie(name);
    db.version(12).stores({
      battles: '[world+battleId], [world+at], [world+opponent+at], at',
      plunders: '[world+opponent+at], [world+at], at',
    });
    return db;
  };

  it('links the stored plunders to their battles and infers the missing ones', async () => {
    const old = v12('upgrade-v13');
    await old.table('battles').bulkPut([fought(1, T - 100), fought(2, T - 100, 'won', 1002)]);
    await old
      .table('plunders')
      .bulkPut([plunder(T), plunder(T + 2 * DAY_MS), { ...plunder(T + 9, 'plundered', 1002), world: worldId('en1') }]);
    old.close();
    const db = openDb('upgrade-v13');
    expect(shape(await db.battles.toArray())).toEqual({
      1: `${T}`,
      2: '-',
      [-(T + 2 * DAY_MS)]: `inferred ${T + 2 * DAY_MS}`,
      [-(T + 9)]: `inferred ${T + 9}`,
    });
    expect((await db.battles.get([worldId('en1'), -(T + 9)]))?.opponent).toBe(1002);
  });

  it('leaves a database without plunders as it is', async () => {
    const old = v12('upgrade-v13-empty');
    await old.table('battles').bulkPut([fought(1, T - 100)]);
    old.close();
    const db = openDb('upgrade-v13-empty');
    expect(await db.battles.toArray()).toEqual([fought(1, T - 100)]);
  });
});

describe('a recorded battle and the plunder after it', () => {
  it('stores one fought battle that carries the plunder and no inferred battle', async () => {
    // the battle carries its own time, the plunder takes the clock
    const now = () => recorded.plunderAt;
    const { db, bus, stores } = testStores({ now });
    const ingestion = new Ingestion();
    registerGameHandlers(ingestion, { world, bus, now, ...stores });
    const send = (entries: unknown[]) =>
      ingestion.accept({
        kind: 'json',
        url: '/game/json?h=1',
        request: null,
        response: JSON.stringify(entries),
        at: 0,
      });
    send([
      {
        requestClass: 'StartupService',
        requestMethod: 'getData',
        responseData: { user_data: { player_id: recorded.me } },
      },
    ]);
    send(recorded.battle);
    await stores.battles.latest(playerId(1001));
    send(recorded.plunder);
    await stores.plunders.latest(playerId(1001));

    const battles = await db.db.battles.toArray();
    expect(battles).toHaveLength(1);
    expect(battles[0]).toMatchObject({ battleId: 5001, opponent: 1001, result: 'won', plunderAt: recorded.plunderAt });
    expect(battles[0]?.at).toBeLessThan(recorded.plunderAt);
    expect(await db.db.plunders.toArray()).toMatchObject([{ opponent: 1001, at: recorded.plunderAt }]);
  });
});
