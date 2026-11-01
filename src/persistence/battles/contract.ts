import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle } from '../../shared/model';
import type { PlayerRowsApi } from '../player-rows-contract';

export interface BattlesApi extends PlayerRowsApi<'battles', Battle> {
  'battles.put': { arg: { rows: Battle[] }; result: undefined };
  'battles.count': { arg: { world: WorldId; opponents?: PlayerId[] }; result: number };
}
