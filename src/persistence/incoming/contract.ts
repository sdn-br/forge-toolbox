import type { PlayerId, WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../shared/model';

export interface IncomingApi {
  /** adds rows whose key is new; a known attack keeps its first stored time */
  'incoming.add': { arg: { rows: IncomingAttack[] }; result: undefined };
  'incoming.latest': { arg: { world: WorldId; attacker: PlayerId }; result: IncomingAttack | null };
  'incoming.list': {
    arg: { world: WorldId; attackers?: PlayerId[]; limit: number; offset: number };
    result: IncomingAttack[];
  };
  'incoming.totals': { arg: { world: WorldId; attackers?: PlayerId[] }; result: IncomingTotals };
  'incoming.prune': { arg: { before: number }; result: number };
}
