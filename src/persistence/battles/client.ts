import type { Call } from '../../content/core/rpc';
import type { BattlePersistence } from '../../content/stores/battles';
import type { Battle } from '../../shared/model';
import { playerRowsClient } from '../player-rows-client';

/** Persistence through the service worker, which owns the database. */
export function battlePersistence(call: Call): BattlePersistence {
  return {
    ...playerRowsClient<Battle>(call, 'battles'),
    put: (rows) => call('battles.put', { rows }),
    count: (world, opponents) => call('battles.count', { world, opponents }),
  };
}
