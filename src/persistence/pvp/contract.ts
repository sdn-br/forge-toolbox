import type { BattlesApi } from './battles-contract';
import type { PlundersApi } from './plunders-contract';

/** The calls of the PvP domain: battles and plunders keep their own names. */
export interface PvpApi extends BattlesApi, PlundersApi {}
