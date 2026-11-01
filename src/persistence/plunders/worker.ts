import type { EntityTable } from 'dexie';
import type { Plunder } from '../../shared/model';
import { FORGE_POINTS } from '../../shared/resources';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import type { PlundersApi } from './contract';

export type PlundersTables = { plunders: EntityTable<Plunder> };

export function plundersHandlers(db: PlundersTables): Handlers<PlundersApi> {
  const rows = playerRows(db.plunders, 'opponent');

  return {
    'plunders.put': async ({ rows }) => {
      await db.plunders.bulkPut(rows);
    },
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
