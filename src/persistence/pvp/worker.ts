// The PvP domain: battles and plunders, two tables whose rows are linked (see ./link). Callers outside the domain
// reach the tables through `pvpHandlers` and keep the link current through `relinkPvp`.
import type Dexie from 'dexie';
import type { Handlers } from '../../shared/rpc';
import { battlesHandlers } from './battles-handlers';
import type { PvpApi } from './contract';
import { type PvpTables, relinkRows } from './link';
import { plundersHandlers } from './plunders-handlers';

export type { PvpTables };

/**
 * Brings the stored battles in line with the plunders for the opponents of these rows. Runs in the caller's
 * transaction, which must span both tables.
 */
export const relinkPvp = relinkRows;

export function pvpHandlers(db: PvpTables & Dexie): Handlers<PvpApi> {
  return {
    ...battlesHandlers(db),
    ...plundersHandlers(db),
    'pvp.prune': ({ before }) =>
      db.transaction('rw', db.battles, db.plunders, async () => {
        const plunders = await db.plunders.where('at').below(before).delete();
        // a battle older than the limit stays while its plunder does; the plunders it kept are the only ones left
        const battles = await db.battles
          .where('at')
          .below(before)
          .filter((b) => b.plunderAt === undefined || b.plunderAt < before)
          .delete();
        return plunders + battles;
      }),
  };
}
