import type { WorldId } from '../../shared/ids';
import type { Player } from '../../shared/model';

export interface PlayersApi {
  'players.load': { arg: { world: WorldId }; result: Player[] };
  'players.put': { arg: { rows: Player[] }; result: undefined };
}
