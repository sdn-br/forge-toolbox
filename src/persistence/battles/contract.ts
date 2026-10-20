import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle } from '../../shared/model';

export interface BattlesApi {
  'battles.put': { arg: { rows: Battle[] }; result: undefined };
  'battles.latest': { arg: { world: WorldId; opponent: PlayerId }; result: Battle | null };
  'battles.list': {
    arg: { world: WorldId; opponents?: PlayerId[]; limit: number; offset: number };
    result: Battle[];
  };
  'battles.count': { arg: { world: WorldId; opponents?: PlayerId[] }; result: number };
  'battles.prune': { arg: { before: number }; result: number };
}
