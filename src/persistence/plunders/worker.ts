import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder } from '../../shared/model';
import { FORGE_POINTS } from '../../shared/resources';
import type { Handlers } from '../../shared/rpc';
import type { BattlesTables } from '../battles/worker';
import { playerRows } from '../player-rows';
import { relinkRows } from '../pvp-link';
import type { PlundersApi } from './contract';

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
    'plunders.latest': ({ world, opponent }) => rows.latest(world, opponent),
    'plunders.list': ({ world, opponents, limit, offset }) => rows.list(world, opponents, limit, offset),
    'plunders.totals': async ({ world, opponents }) => {
      const totals = { count: 0, repelled: 0, fp: 0 };
      await rows.forEach(world, opponents, (p) => {
        if (p.outcome === 'repelled') {
          totals.repelled++;
          return;
        }
        totals.count++;
        totals.fp += p.resources[FORGE_POINTS] ?? 0;
      });
      return totals;
    },
    'plunders.prune': ({ before }) => rows.prune(before),
  };
}
