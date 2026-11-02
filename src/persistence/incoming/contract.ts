import type { WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals, OpponentScope } from '../../shared/model';
import type { PlayerRowsApi } from '../player-rows-contract';

export interface IncomingApi extends PlayerRowsApi<'incoming', IncomingAttack> {
  /** adds rows whose key is new; a known attack keeps its first stored time */
  'incoming.add': { arg: { rows: IncomingAttack[] }; result: undefined };
  'incoming.totals': { arg: OpponentScope & { world: WorldId }; result: IncomingTotals };
}
