import type { Call } from '../../content/core/rpc';
import type { IncomingPersistence } from '../../content/stores/incoming';

/** Persistence through the service worker, which owns the database. */
export function incomingPersistence(call: Call): IncomingPersistence {
  return {
    add: (rows) => call('incoming.add', { rows }),
    latest: async (world, attacker) => (await call('incoming.latest', { world, attacker })) ?? undefined,
    list: (world, query) => call('incoming.list', { world, ...query }),
    totals: (world, attackers) => call('incoming.totals', { world, attackers }),
    prune: (before) => call('incoming.prune', { before }),
  };
}
