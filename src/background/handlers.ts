import type { Arg, Method, Result } from '../shared/rpc';
import type { ToolboxDb } from './db';

type Handlers = { [M in Method]: (arg: Arg<M>) => Promise<Result<M>> };

export function createHandlers(db: ToolboxDb): Handlers {
  return {
    'players.load': ({ world }) => db.players.where('world').equals(world).toArray(),
    'players.put': async ({ rows }) => {
      await db.players.bulkPut(rows);
    },
    'defs.load': () => db.buildingDefs.toArray(),
    'defs.put': async ({ rows }) => {
      await db.buildingDefs.bulkPut(rows);
    },
  };
}
