import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingKind } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import type { IncomingApi } from './contract';

export type IncomingTables = { incoming: Table<IncomingAttack, [WorldId, IncomingKind, number]> };

export function incomingHandlers(db: IncomingTables & Dexie): Handlers<IncomingApi> {
  const rows = playerRows(db.incoming, 'attacker');

  return {
    'incoming.add': ({ rows }) =>
      db.transaction('rw', db.incoming, async () => {
        const known = await db.incoming.bulkGet(
          rows.map((r): [WorldId, IncomingKind, number] => [r.world, r.kind, r.key]),
        );
        await db.incoming.bulkAdd(rows.filter((_, i) => !known[i]));
        return undefined;
      }),
    'incoming.latest': ({ world, opponent }) => rows.latest(world, opponent),
    'incoming.list': ({ world, opponents, limit, offset }) => rows.list(world, opponents, limit, offset),
    'incoming.totals': async ({ world, opponents }) => {
      const totals = { battles: 0, held: 0, plunders: 0 };
      await rows.newestFirst(world, opponents).each((a) => {
        if (a.kind === 'plunder') totals.plunders++;
        else totals.battles++;
        if (a.defense === 'held') totals.held++;
      });
      return totals;
    },
    'incoming.prune': ({ before }) => rows.prune(before),
  };
}
