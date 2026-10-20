import Dexie, { type EntityTable } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { PlundersApi } from './contract';

export type PlundersTables = { plunders: EntityTable<Plunder> };

export function plundersHandlers(db: PlundersTables): Handlers<PlundersApi> {
  const byOpponent = (world: WorldId, opponent: PlayerId) =>
    db.plunders.where('[world+opponent+at]').between([world, opponent, Dexie.minKey], [world, opponent, Dexie.maxKey]);
  const newestFirst = (world: WorldId, opponents?: PlayerId[]) => {
    const all = db.plunders.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]).reverse();
    if (!opponents) return all;
    const wanted = new Set<number>(opponents);
    return all.filter((p) => wanted.has(p.opponent));
  };

  return {
    'plunders.put': async ({ rows }) => {
      await db.plunders.bulkPut(rows);
    },
    'plunders.latest': async ({ world, opponent }) => (await byOpponent(world, opponent).last()) ?? null,
    'plunders.list': ({ world, opponents, limit, offset }) =>
      newestFirst(world, opponents).offset(offset).limit(limit).toArray(),
    'plunders.totals': async ({ world, opponents }) => {
      const totals = { count: 0, fp: 0 };
      await newestFirst(world, opponents).each((p) => {
        totals.count++;
        totals.fp += p.resources.strategy_points ?? 0;
      });
      return totals;
    },
    'plunders.prune': ({ before }) => db.plunders.where('at').below(before).delete(),
  };
}
