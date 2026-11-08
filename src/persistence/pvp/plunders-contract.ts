import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder, PlunderTotals } from '../../shared/model';
import type { PlayerRowsApi } from '../player-rows-contract';

export interface PlundersApi extends PlayerRowsApi<'plunders', Plunder> {
  'plunders.put': { arg: { rows: Plunder[] }; result: undefined };
  'plunders.totals': { arg: { world: WorldId; opponents?: PlayerId[] }; result: PlunderTotals };
}
