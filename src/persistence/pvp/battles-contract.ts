import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle, BattleFilter, BattleSummary, BattleWithPlunder, FoughtBattle } from '../../shared/model';
import type { PlayerRowsApi } from '../player-rows-contract';

type BattleArg = BattleFilter & { world: WorldId };

export interface BattlesApi extends Omit<PlayerRowsApi<'battles', Battle>, 'battles.list'> {
  'battles.put': { arg: { rows: FoughtBattle[] }; result: undefined };
  /** newest first, each with its plunder */
  'battles.list': { arg: BattleArg & { limit: number; offset: number }; result: BattleWithPlunder[] };
  /** over exactly the battles the list with the same filter pages through */
  'battles.summary': { arg: BattleArg; result: BattleSummary };
  'battles.latestFought': { arg: { world: WorldId; opponent: PlayerId }; result: FoughtBattle | null };
}
