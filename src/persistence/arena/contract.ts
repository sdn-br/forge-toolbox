import type { WorldId } from '../../shared/ids';
import type { ArenaBattle, ArenaLogEntry, ArenaLogFilter, ArenaLogSummary, ArenaPoints } from '../../shared/model';
import type { PlayerRowsApi } from '../player-rows-contract';

type LogArg = ArenaLogFilter & { world: WorldId };

/** The calls of the PvP arena: own battles, the game's log and the own points, each table under its own name. */
export interface ArenaApi
  extends PlayerRowsApi<'arenaBattles', ArenaBattle>,
    Omit<PlayerRowsApi<'arenaLog', ArenaLogEntry>, 'arenaLog.list'> {
  'arenaBattles.put': { arg: { rows: ArenaBattle[] }; result: undefined };
  /** adds lines whose key is new; known ones stay */
  'arenaLog.add': { arg: { rows: ArenaLogEntry[] }; result: undefined };
  /** newest first */
  'arenaLog.list': { arg: LogArg & { limit: number; offset: number }; result: ArenaLogEntry[] };
  /** over exactly the lines the list with the same filter pages through */
  'arenaLog.summary': { arg: LogArg; result: ArenaLogSummary };
  /** stores the row unless the last stored points of its world are the same; true when stored */
  'arenaPoints.add': { arg: { row: ArenaPoints }; result: boolean };
  /** the points of the world from `from` on, oldest first */
  'arenaPoints.since': { arg: { world: WorldId; from: number }; result: ArenaPoints[] };
  /** deletes battles, log lines and points of all worlds older than `before`, in one transaction; returns how many */
  'arena.prune': { arg: { before: number }; result: number };
}
