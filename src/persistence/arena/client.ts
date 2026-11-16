import type { Call } from '../../content/core/rpc';
import type { ArenaPersistence } from '../../content/stores/arena';
import type { ArenaBattle, ArenaLogEntry } from '../../shared/model';
import { playerRowsClient } from '../player-rows-client';

/** Persistence through the service worker, which owns the database. */
export function arenaPersistence(call: Call): ArenaPersistence {
  return {
    battles: {
      ...playerRowsClient<ArenaBattle>(call, 'arenaBattles'),
      put: (rows) => call('arenaBattles.put', { rows }),
    },
    log: {
      ...playerRowsClient<ArenaLogEntry>(call, 'arenaLog'),
      list: (world, query) => call('arenaLog.list', { world, ...query }),
      add: (rows) => call('arenaLog.add', { rows }),
      summary: (world, filter) => call('arenaLog.summary', { world, ...filter }),
    },
    points: {
      add: (row) => call('arenaPoints.add', { row }),
      since: (world, from) => call('arenaPoints.since', { world, from }),
    },
    prune: (before) => call('arena.prune', { before }),
  };
}
