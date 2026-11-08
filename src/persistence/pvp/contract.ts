import type { BattlesApi } from './battles-contract';
import type { PlundersApi } from './plunders-contract';

/** The calls of the PvP domain: battles and plunders keep their own names. */
export interface PvpApi extends BattlesApi, PlundersApi {
  /**
   * Deletes the plunders and the battles of all worlds older than `before`, in one transaction, and returns how many
   * rows went. A battle stays while its plunder does, so every kept plunder keeps its battle.
   */
  'pvp.prune': { arg: { before: number }; result: number };
}
