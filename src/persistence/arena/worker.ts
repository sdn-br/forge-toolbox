import Dexie, { type Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type {
  ArenaBattle,
  ArenaLogEntry,
  ArenaLogFilter,
  ArenaLogKind,
  ArenaLogSummary,
  ArenaPoints,
} from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import { playerRowsHandlers } from '../player-rows-handlers';
import type { ArenaApi } from './contract';

export type ArenaLogKey = [WorldId, number, PlayerId, ArenaLogKind];

export type ArenaTables = {
  arenaBattles: Table<ArenaBattle, [WorldId, number]>;
  arenaLog: Table<ArenaLogEntry, ArenaLogKey>;
  arenaPoints: Table<ArenaPoints, [WorldId, number]>;
};

const logKey = (e: ArenaLogEntry): ArenaLogKey => [e.world, e.at, e.opponent, e.kind];

export function arenaHandlers(db: ArenaTables & Dexie): Handlers<ArenaApi> {
  const battles = playerRows(db.arenaBattles, 'opponent');
  const log = playerRows(db.arenaLog, 'opponent');
  const attacks = playerRows(db.arenaLog, 'opponent', (e) => e.kind === 'attack');
  const defenses = playerRows(db.arenaLog, 'opponent', (e) => e.kind === 'defense');
  const logOf = ({ kind }: ArenaLogFilter) => (kind === 'attack' ? attacks : kind === 'defense' ? defenses : log);

  const pointsOf = (world: WorldId) =>
    db.arenaPoints.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]);

  return {
    ...playerRowsHandlers('arenaBattles', battles),
    'arenaBattles.put': async ({ rows }) => {
      await db.arenaBattles.bulkPut(rows);
      return undefined;
    },
    'arenaLog.latest': playerRowsHandlers('arenaLog', log)['arenaLog.latest'],
    'arenaLog.add': ({ rows }) =>
      db.transaction('rw', db.arenaLog, async () => {
        const known = await db.arenaLog.bulkGet(rows.map(logKey));
        await db.arenaLog.bulkAdd(rows.filter((_, i) => !known[i]));
        return undefined;
      }),
    'arenaLog.list': ({ limit, offset, ...filter }) => logOf(filter).list(filter.world, filter, limit, offset),
    'arenaLog.summary': async ({ world, ...filter }) => {
      const summary: ArenaLogSummary = { attacks: 0, won: 0, lost: 0, defenses: 0, points: 0 };
      await logOf(filter).forEach(world, filter, (e) => {
        summary.points += e.points;
        if (e.kind === 'defense') summary.defenses++;
        else {
          summary.attacks++;
          if (e.points > 0) summary.won++;
          else summary.lost++;
        }
      });
      return summary;
    },
    'arenaPoints.add': ({ row }) =>
      db.transaction('rw', db.arenaPoints, async () => {
        const last = await pointsOf(row.world).last();
        if (last?.points === row.points) return false;
        await db.arenaPoints.put(row);
        return true;
      }),
    'arenaPoints.since': ({ world, from }) =>
      db.arenaPoints.where('[world+at]').between([world, from], [world, Dexie.maxKey], true, true).toArray(),
    'arena.prune': ({ before }) =>
      db.transaction('rw', db.arenaBattles, db.arenaLog, db.arenaPoints, async () => {
        const counts = await Promise.all(
          [db.arenaBattles, db.arenaLog].map((t) => (t as Table<{ at: number }>).where('at').below(before).delete()),
        );
        // the newest points of a world stay even when old: they are the start of the curve until the points change
        const old = await db.arenaPoints.where('at').below(before).toArray();
        const newest = new Map<string, number>();
        for (const world of new Set(old.map((p) => p.world))) {
          const last = await db.arenaPoints.where('[world+at]').between([world, -Infinity], [world, Infinity]).last();
          if (last) newest.set(world, last.at);
        }
        const gone = old.filter((p) => newest.get(p.world) !== p.at);
        await db.arenaPoints.bulkDelete(gone.map((p) => [p.world, p.at] as [typeof p.world, number]));
        return counts.reduce((a, b) => a + b, 0) + gone.length;
      }),
  };
}
