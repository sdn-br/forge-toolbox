import Dexie from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';
import type { Arg, Method, Result } from '../shared/rpc';
import type { ToolboxDb } from './db';

type Handlers = { [M in Method]: (arg: Arg<M>) => Promise<Result<M>> };

export function createHandlers(db: ToolboxDb): Handlers {
  const byOpponent = (world: WorldId, opponent: PlayerId) =>
    db.battles.where('[world+opponent+at]').between([world, opponent, Dexie.minKey], [world, opponent, Dexie.maxKey]);
  const newestFirst = (world: WorldId, opponents?: PlayerId[]) => {
    const all = db.battles.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]).reverse();
    if (!opponents) return all;
    const wanted = new Set<number>(opponents);
    return all.filter((b) => wanted.has(b.opponent));
  };

  return {
    'players.load': ({ world }) => db.players.where('world').equals(world).toArray(),
    'players.put': async ({ rows }) => {
      await db.players.bulkPut(rows);
    },
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
