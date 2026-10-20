import Dexie, { type EntityTable } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { BattlesApi } from './contract';

export type BattlesTables = { battles: EntityTable<Battle> };

export function battlesHandlers(db: BattlesTables): Handlers<BattlesApi> {
  const byOpponent = (world: WorldId, opponent: PlayerId) =>
    db.battles.where('[world+opponent+at]').between([world, opponent, Dexie.minKey], [world, opponent, Dexie.maxKey]);
  const newestFirst = (world: WorldId, opponents?: PlayerId[]) => {
    const all = db.battles.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]).reverse();
    if (!opponents) return all;
    const wanted = new Set<number>(opponents);
    return all.filter((b) => wanted.has(b.opponent));
  };

  return {
    'battles.put': async ({ rows }) => {
      await db.battles.bulkPut(rows);
    },
    'battles.latest': async ({ world, opponent }) => (await byOpponent(world, opponent).last()) ?? null,
    'battles.list': ({ world, opponents, limit, offset }) =>
      newestFirst(world, opponents).offset(offset).limit(limit).toArray(),
    'battles.count': ({ world, opponents }) => newestFirst(world, opponents).count(),
    'battles.prune': ({ before }) => db.battles.where('at').below(before).delete(),
  };
}
