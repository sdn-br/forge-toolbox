import type { Call } from '../../content/core/rpc';
import type { PlunderPersistence } from '../../content/stores/plunders';
import type { Plunder } from '../../shared/model';
import { playerRowsClient } from '../player-rows-client';

/** Persistence through the service worker, which owns the database. */
export function plunderPersistence(call: Call): PlunderPersistence {
  return {
    ...playerRowsClient<Plunder>(call, 'plunders'),
    put: (rows) => call('plunders.put', { rows }),
    totals: (world, opponents) => call('plunders.totals', { world, opponents }),
  };
}
