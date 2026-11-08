import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { BattlesTables } from '../battles/worker';
import { playerRows } from '../player-rows';
import { playerRowsHandlers } from '../player-rows-handlers';
import { relinkRows } from '../pvp-link';
import type { PlundersApi } from './contract';
import { tallyPlunder } from './tally';

export type PlundersTables = { plunders: Table<Plunder, [WorldId, PlayerId, number]> };

export function plundersHandlers(db: PlundersTables & BattlesTables & Dexie): Handlers<PlundersApi> {
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
