import { describe, expect, it } from 'vitest';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, FoughtBattle, Plunder } from '../src/shared/model';
import { DAY_MS } from '../src/shared/time';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const T = 1_800_000_000_000;

const fought = (battleId: number, at: number, opp = 1001, w = world): FoughtBattle => ({
  world: w,
  battleId,
  at,
  opponent: playerId(opp),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('IronAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

const plunder = (at: number, opp = 1001, w = world): Plunder => ({
  world: w,
  at,
  opponent: playerId(opp),
  outcome: 'repelled',
  resources: {},
  doubleLoot: false,
});

const ids = (battles: Battle[]) => battles.map((b) => b.battleId).sort((a, b) => a - b);

describe('pruning PvP rows', () => {
  it('deletes an old plunder and its battle together and returns the rows deleted', async () => {
    const { db, persistence, plunders } = testDb();
    await persistence.put([fought(1, T - 100)]);
    await plunders.put([plunder(T)]);
    expect(await persistence.prune(T + 1)).toBe(2);
    expect(await db.battles.count()).toBe(0);
    expect(await db.plunders.count()).toBe(0);
  });

  it('keeps an old battle while its plunder is kept', async () => {
    const { db, persistence, plunders } = testDb();
    await persistence.put([fought(1, T - 100)]);
    await plunders.put([plunder(T)]);
    expect(await persistence.prune(T - 50)).toBe(0);
    expect(ids(await db.battles.toArray())).toEqual([1]);
    expect(await db.plunders.count()).toBe(1);
  });

  it('deletes an inferred battle with its plunder and an old battle without one', async () => {
    const { db, persistence, plunders } = testDb();
    await persistence.put([fought(2, T - 3 * DAY_MS)]);
    await plunders.put([plunder(T - DAY_MS), plunder(T)]);
    // the plunders without a fought battle got inferred ones; the old fought battle has no plunder
    expect(await db.battles.count()).toBe(3);
    expect(await persistence.prune(T - DAY_MS + 1)).toBe(3);
    expect(ids(await db.battles.toArray())).toEqual([-T]);
    expect((await db.plunders.toArray()).map((p) => p.at)).toEqual([T]);
  });

  it('prunes every world', async () => {
    const { db, persistence } = testDb();
    await db.battles.bulkPut([fought(1, 100), fought(2, 300, 1001, worldId('en1'))]);
    expect(await persistence.prune(200)).toBe(1);
    expect(ids(await db.battles.toArray())).toEqual([2]);
  });
});
