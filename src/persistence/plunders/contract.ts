import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder, PlunderTotals } from '../../shared/model';

export interface PlundersApi {
  'plunders.put': { arg: { rows: Plunder[] }; result: undefined };
  'plunders.latest': { arg: { world: WorldId; opponent: PlayerId }; result: Plunder | null };
  'plunders.list': {
    arg: { world: WorldId; opponents?: PlayerId[]; limit: number; offset: number };
    result: Plunder[];
  };
  'plunders.totals': { arg: { world: WorldId; opponents?: PlayerId[] }; result: PlunderTotals };
  'plunders.prune': { arg: { before: number }; result: number };
}
