import type { Call } from '../../content/core/rpc';
import type { BattlePersistence } from '../../content/stores/battles';
import type { Battle } from '../../shared/model';
import { playerRowsClient } from '../player-rows-client';

/** Persistence through the service worker, which owns the database. */
export function battlePersistence(call: Call): BattlePersistence {
  const rows = playerRowsClient<Battle>(call, 'battles');
  return {
    latest: rows.latest,
    prune: rows.prune,
    put: (rows) => call('battles.put', { rows }),
    list: (world, query) => call('battles.list', { world, ...query }),
    summary: (world, filter) => call('battles.summary', { world, ...filter }),
    latestFought: async (world, opponent) => (await call('battles.latestFought', { world, opponent })) ?? undefined,
  };
}
