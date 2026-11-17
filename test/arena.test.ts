import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { collectTables } from '../src/backup/collect';
import { importTables } from '../src/backup/import';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { ArenaBattle, ArenaLogEntry } from '../src/shared/model';
import arena from './fixtures/arena.json';
import manual from './fixtures/arena-manual-battle.json';
import pvp from './fixtures/pvp-battle.json';
import pvpManual from './fixtures/pvp-manual-battle.json';
import { testStores } from './helpers/stores';

const world = worldId('de20');

function setup(me: number | null = arena.me) {
  const ingestion = new Ingestion();
  let now = 1_000;
  const { db, bus, stores } = testStores({ now: () => now });
  registerGameHandlers(ingestion, { world, bus, now: () => now, ...stores });
  const events: string[] = [];
  const battles: PlayerId[] = [];
  const logged: PlayerId[] = [];
  bus.on('arena.opened', () => events.push('opened'));
  bus.on('arena.opponents', () => events.push('opponents'));
  bus.on('arena.pointsRecorded', () => events.push('points'));
  bus.on('arena.battleRecorded', (e) => battles.push(...e.opponents));
  bus.on('arena.logRecorded', (e) => logged.push(...e.opponents));
  const send = (entries: unknown[]) =>
    ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: JSON.stringify(entries), at: 0 });
  if (me !== null)
    send([
      { requestClass: 'StartupService', requestMethod: 'getData', responseData: { user_data: { player_id: me } } },
    ]);
  return { db: db.db, stores, arena: stores.arena, events, battles, logged, send, tick: () => (now += 1_000) };
}

const page = { limit: 50, offset: 0 };
const line = (at: number, opponent: number, kind: ArenaLogEntry['kind'], points: number): ArenaLogEntry => ({
  world,
  at: at * 1000,
  opponent: playerId(opponent),
  kind,
  points,
});

/** the overview with the line the battle's addLog brings */
const overviewWithBattleLine = () => {
  const overview = structuredClone(arena.overview);
  const added = arena.battle.find((e) => e.requestMethod === 'addLog')?.responseData;
  overview[0]?.responseData.actions.unshift(added as never);
  return overview;
};

describe('recording arena battles', () => {
  it('records an automatic arena battle with its points, difficulty and opponent slot', async () => {
    const { arena: store, stores, battles, send } = setup();
    send(arena.battle);
    const b = (await store.battles.latest(playerId(1002))) as ArenaBattle;
    expect(b).toMatchObject({
      world,
      battleId: 5001,
      at: 1_794_327_899_000,
      opponent: 1002,
      result: 'won',
      auto: true,
      era: 'VirtualFuture',
      points: 400,
      difficulty: 'medium',
      opponentId: 7002,
    });
    expect(b.rounds).toBeGreaterThan(1);
    expect(b.attacker.units.length).toBeGreaterThan(0);
    expect(b.defender.units.length).toBeGreaterThan(0);
    expect(battles).toEqual([1002]);
    expect((await stores.battles.summary()).battles).toBe(0);
  });

  it('records a manual arena battle once it ends; the opponent comes from the battle type', async () => {
    const { arena: store, stores, send } = setup(manual.me);
    send(manual.start);
    expect(await store.battles.list(page)).toEqual([]);
    send(manual.end);
    const [b] = await store.battles.list(page);
    expect(b).toMatchObject({ battleId: 5002, opponent: 1001, result: 'lost', auto: false, points: -297 });
    expect((await stores.battles.summary()).battles).toBe(0);
  });

  it('ignores the end of a manual arena battle that did not start, and arena battles of others', async () => {
    const a = setup(manual.me);
    a.send(manual.end);
    expect(await a.arena.battles.list(page)).toEqual([]);
    const b = setup(1001);
    b.send(arena.battle);
    b.send(manual.start);
    b.send(manual.end);
    expect(await b.arena.battles.list(page)).toEqual([]);
  });

  it('keeps PvP battles in the neighbourhood store, auto and manual', async () => {
    const { arena: store, stores, send } = setup(pvp.me);
    send(pvp.batch);
    send(pvpManual.start);
    send(pvpManual.end);
    expect((await stores.battles.summary()).battles).toBe(2);
    expect(await store.battles.list(page)).toEqual([]);
  });

  it('ends a manual arena battle in the arena even after a neighbourhood battle was seen', async () => {
    const { arena: store, stores, send } = setup();
    send(pvp.batch);
    send(manual.start);
    send(manual.end);
    expect((await stores.battles.summary()).battles).toBe(1);
    expect((await store.battles.list(page)).map((b) => b.battleId)).toEqual([5002]);
  });
});

describe('the arena log', () => {
  it('stores the overview lines and the battle line once, however often they come', async () => {
    const { arena: store, logged, send } = setup();
    send(arena.overview);
    send(arena.battle);
    send(arena.overview);
    send(overviewWithBattleLine());
    const lines = await store.log.list(page);
    expect(lines).toHaveLength(7);
    expect(lines.map((l) => l.at)).toEqual([...lines.map((l) => l.at)].sort((a, b) => b - a));
    expect(lines[0]).toEqual(line(1_794_327_899, 1002, 'attack', 400));
    expect(new Set(logged)).toEqual(new Set([1002, 1004, 1005, 1006, 1007, 1008]));
  });

  it('lists by opponent and kind, newest first, paged', async () => {
    const { arena: store, send } = setup();
    send(overviewWithBattleLine());
    const opp = await store.log.list({ ...page, opponents: [playerId(1005)] });
    expect(opp).toEqual([line(1_794_327_806, 1005, 'attack', 529), line(1_794_327_789, 1005, 'attack', 529)]);
    expect(await store.log.list({ ...page, kind: 'defense' })).toEqual([line(1_794_311_737, 1008, 'defense', -55)]);
    const except = await store.log.list({ ...page, exceptOpponents: [playerId(1005), playerId(1002)] });
    expect(except.map((l) => l.opponent)).toEqual([1004, 1006, 1007, 1008]);
    const second = await store.log.list({ limit: 2, offset: 2, opponents: [playerId(1005), playerId(1006)] });
    expect(second).toEqual([line(1_794_327_789, 1005, 'attack', 529)]);
  });

  it('sums attacks, wins, losses, defenses and points over a filter', async () => {
    const { arena: store, send } = setup();
    send(overviewWithBattleLine());
    expect(await store.log.summary()).toEqual({ attacks: 6, won: 3, lost: 3, defenses: 1, points: -388 });
    expect(await store.log.summary({ kind: 'attack' })).toEqual({
      attacks: 6,
      won: 3,
      lost: 3,
      defenses: 0,
      points: -333,
    });
    expect(await store.log.summary({ opponents: [playerId(1005)] })).toEqual({
      attacks: 2,
      won: 2,
      lost: 0,
      defenses: 0,
      points: 1058,
    });
  });

  it('learns the players of the log and the opponents, but not the session player', async () => {
    const { stores, send } = setup();
    send(arena.overview);
    send(arena.battle);
    expect(stores.players.get(playerId(1004))).toMatchObject({ name: 'Testgegner 4', source: 'list' });
    expect(stores.players.get(playerId(1001))).toMatchObject({ name: 'Testgegner 1' });
    expect(stores.players.get(playerId(1010))).toMatchObject({ name: 'Testgegner 10' });
    expect(stores.players.get(playerId(1000))).toBeUndefined();
  });
});

describe('the arena points', () => {
  it('stores the points with the time they came, only when they changed', async () => {
    const { arena: store, events, send, tick } = setup();
    send(arena.overview);
    tick();
    send(arena.battle);
    tick();
    send(arena.battle);
    tick();
    const overview = structuredClone(arena.overview);
    if (overview[0]) overview[0].responseData.currentPlayer.rankingPoints = 23_274;
    send(overview);
    expect(await store.points.since(0)).toEqual([
      { world, at: 1_000, points: 22_874 },
      { world, at: 2_000, points: 23_274 },
    ]);
    expect(await store.points.since(1_500)).toEqual([{ world, at: 2_000, points: 23_274 }]);
    expect(events.filter((e) => e === 'points')).toHaveLength(2);
  });
});

describe('the arena opponents', () => {
  it('holds the opponents on offer, replaced by every new draw, and announces the opening', async () => {
    const { arena: store, events, send } = setup();
    expect(store.opponents.current()).toEqual([]);
    send(arena.overview);
    expect(store.opponents.current()).toEqual([
      {
        opponentId: 7001,
        player: 1001,
        rewardPoints: 628,
        difficulty: 'hard',
        era: 'SpaceAgeAsteroidBelt',
        attackBoost: 11674,
        defenseBoost: 11991,
      },
      expect.objectContaining({ opponentId: 7002, player: 1002, difficulty: 'medium' }),
      expect.objectContaining({ opponentId: 7003, player: 1003, difficulty: 'easy' }),
    ]);
    send(arena.battle);
    expect(store.opponents.current().map((o) => o.opponentId)).toEqual([7004, 7005, 7006]);
    send(arena.battle);
    expect(events.filter((e) => e !== 'points')).toEqual(['opponents', 'opened', 'opponents']);
  });

  it('takes the new draw of the button "Erneuern"', () => {
    const { arena: store, events, send } = setup();
    const opponents = structuredClone(arena.overview[0]?.responseData.opponents ?? []).reverse();
    send([
      {
        requestClass: 'PVPArenaService',
        requestMethod: 'refreshOpponents',
        responseData: { currentPlayer: { player: { player_id: arena.me } }, nextRefreshAt: 1, opponents },
      },
    ]);
    expect(store.opponents.current().map((o) => o.opponentId)).toEqual([7003, 7002, 7001]);
    expect(events).toEqual(['opponents']);
  });
});

describe('arena retention', () => {
  it('prunes battles, log lines and points older than the limit together', async () => {
    const { arena: store, db, send, tick } = setup();
    send(overviewWithBattleLine());
    send(arena.battle);
    tick();
    const overview = structuredClone(arena.overview);
    if (overview[0]) overview[0].responseData.currentPlayer.rankingPoints = 1;
    send(overview);
    // battle at 1_794_327_899 s, four of the seven log lines before 1_794_327_800 s, points at 1 s and 2 s: the newest
    // stays as the start of the curve
    expect(await store.prune(1_794_327_800_000)).toBe(4 + 1);
    expect(await db.arenaBattles.count()).toBe(1);
    expect((await store.log.list(page)).map((l) => l.at / 1000)).toEqual([1_794_327_899, 1_794_327_819, 1_794_327_806]);
    expect((await store.points.since(0)).map((p) => p.points)).toEqual([1]);
  });
});

describe('arena tables in the database and the backup', () => {
  it('adds the arena tables in version 17 and keeps the rows of version 16', async () => {
    const name = 'arena-upgrade-v16';
    const v16 = new Dexie(name);
    v16.version(16).stores({
      battles: '[world+battleId], [world+at], [world+opponent+at], at',
      incoming: '[world+kind+key], [world+at], [world+attacker+at], at',
    });
    await v16.table('battles').put({ world, battleId: 1, at: 1, opponent: 2 });
    await v16.table('incoming').put({ world, kind: 'battle', key: 1, at: 1, attacker: 2 });
    v16.close();
    const db = openDb(name);
    expect(await db.battles.count()).toBe(1);
    expect(await db.incoming.count()).toBe(1);
    await db.arenaLog.put(line(1, 2, 'attack', 5));
    await db.arenaLog.put(line(1, 2, 'defense', -5));
    await db.arenaPoints.put({ world, at: 1, points: 5 });
    expect(await db.arenaLog.count()).toBe(2);
    expect(db.verno).toBe(17);
  });

  it('backs up and imports the arena rows with the players they name', async () => {
    const { arena: store, db, send, tick } = setup();
    send(overviewWithBattleLine());
    tick();
    send(arena.battle);
    tick();
    send(manual.start);
    send(manual.end);
    // prunes nothing, but waits for the pending writes
    expect(await store.prune(0)).toBe(0);
    const tables = await collectTables(db, world, 0);
    expect(tables.arenaBattles.map((b) => b.battleId).sort()).toEqual([5001, 5002]);
    expect(tables.arenaLog).toHaveLength(8);
    expect(tables.arenaPoints.map((p) => p.points)).toEqual([22_874, 23_274, 24_720]);
    const target = openDb('arena-import');
    const written = await importTables(target, { world, player: playerId(1000), tables }, new Set(['pvp']), 'merge');
    expect(written.pvp).toBe(2 + 8 + 3);
    expect(await target.arenaLog.count()).toBe(8);
  });
});
