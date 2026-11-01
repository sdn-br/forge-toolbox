import type { Call } from '../../content/core/rpc';
import type { IncomingPersistence } from '../../content/stores/incoming';
import type { IncomingAttack } from '../../shared/model';
import { playerRowsClient } from '../player-rows-client';

/** Persistence through the service worker, which owns the database. */
export function incomingPersistence(call: Call): IncomingPersistence {
  return {
    ...playerRowsClient<IncomingAttack>(call, 'incoming'),
    add: (rows) => call('incoming.add', { rows }),
    totals: (world, opponents) => call('incoming.totals', { world, opponents }),
  };
}
