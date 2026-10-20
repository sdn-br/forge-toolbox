import Dexie, { type Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingKind } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { IncomingApi } from './contract';

export type IncomingTables = { incoming: Table<IncomingAttack, [WorldId, IncomingKind, number]> };

export function incomingHandlers(db: IncomingTables & Dexie): Handlers<IncomingApi> {
  const byAttacker = (world: WorldId, attacker: PlayerId) =>
    db.incoming.where('[world+attacker+at]').between([world, attacker, Dexie.minKey], [world, attacker, Dexie.maxKey]);
  const newestFirst = (world: WorldId, attackers?: PlayerId[]) => {
    const all = db.incoming.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]).reverse();
    if (!attackers) return all;
    const wanted = new Set<number>(attackers);
    return all.filter((a) => wanted.has(a.attacker));
  };

  return {
    'incoming.add': ({ rows }) =>
      db.transaction('rw', db.incoming, async () => {
        const known = await db.incoming.bulkGet(
          rows.map((r): [WorldId, IncomingKind, number] => [r.world, r.kind, r.key]),
        );
        await db.incoming.bulkAdd(rows.filter((_, i) => !known[i]));
        return undefined;
      }),
    'incoming.latest': async ({ world, attacker }) => (await byAttacker(world, attacker).last()) ?? null,
    'incoming.list': ({ world, attackers, limit, offset }) =>
      newestFirst(world, attackers).offset(offset).limit(limit).toArray(),
    'incoming.totals': async ({ world, attackers }) => {
      const totals = { battles: 0, held: 0, plunders: 0 };
      await newestFirst(world, attackers).each((a) => {
        if (a.kind === 'plunder') totals.plunders++;
        else totals.battles++;
        if (a.defense === 'held') totals.held++;
      });
      return totals;
    },
    'incoming.prune': ({ before }) => db.incoming.where('at').below(before).delete(),
  };
}
