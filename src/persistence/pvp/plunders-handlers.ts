import type Dexie from 'dexie';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import { playerRowsHandlers } from '../player-rows-handlers';
import { type PvpTables, relinkRows } from './link';
import type { PlundersApi } from './plunders-contract';
import { tallyPlunder } from './tally';

export function plundersHandlers(db: PvpTables & Dexie): Handlers<PlundersApi> {
  const rows = playerRows(db.plunders, 'opponent');

  return {
    // a plunder can link a battle or need an inferred one, so its opponents are relinked in the same transaction
    'plunders.put': ({ rows }) =>
      db.transaction('rw', db.battles, db.plunders, async () => {
        await db.plunders.bulkPut(rows);
        await relinkRows(db, rows);
        return undefined;
      }),
    ...playerRowsHandlers('plunders', rows),
    'plunders.totals': async ({ world, opponents }) => {
      const tally = { plunders: 0, repelled: 0, fp: 0 };
      await rows.forEach(world, { opponents }, (p) => tallyPlunder(tally, p));
      return { count: tally.plunders, repelled: tally.repelled, fp: tally.fp };
    },
  };
}
