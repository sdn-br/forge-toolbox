import type { Call } from '../content/core/rpc';
import type { PlayerRowsPersistence } from '../content/stores/player-rows';

type Name = 'battles' | 'plunders' | 'incoming';

/** The client side of `PlayerRowsApi`. */
export function playerRowsClient<Row>(call: Call, name: Name): PlayerRowsPersistence<Row> {
  return {
    latest: async (world, opponent) => ((await call(`${name}.latest`, { world, opponent })) as Row | null) ?? undefined,
    list: (world, query) => call(`${name}.list`, { world, ...query }) as Promise<Row[]>,
    prune: (before) => call(`${name}.prune`, { before }),
  };
}
