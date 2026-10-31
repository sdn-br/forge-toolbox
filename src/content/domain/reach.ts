// The relation to another player that lets the player pay into their great buildings, and the filter over it that the
// investments and the notes share.
import type { Relations } from '../../shared/model';

/** a relation, `none` when there is none, `unknown` for a player the player store never saw */
export type Reach = keyof Relations | 'none' | 'unknown';

/** the first reason in this order names the cell; the reachable ones first when sorted */
export const REACH_ORDER: Reach[] = ['neighbor', 'friend', 'guildMember', 'unknown', 'none'];

/** a switch per relation, and one for players without any */
export type ReachFilter = Record<keyof Relations | 'none', boolean>;

/** the toggles in their order */
export const REACH_TOGGLES: (keyof ReachFilter)[] = ['neighbor', 'friend', 'guildMember', 'none'];

/** every toggle on: nothing is filtered out */
export const ALL_REACH: ReachFilter = { neighbor: true, friend: true, guildMember: true, none: true };

/** the relations a player has, in the fixed order; `none` without any, `unknown` without relations at all */
export const reasonsOf = (relations: Relations | undefined): Reach[] => {
  if (!relations) return ['unknown'];
  const found = REACH_ORDER.filter((r) => relations[r as keyof Relations] === true);
  return found.length > 0 ? found : ['none'];
};

/** a row stays when one of its reasons is switched on; `unknown` always passes */
export const passesReach = (reasons: Reach[], filter: ReachFilter) =>
  reasons.some((reason) => reason === 'unknown' || filter[reason]);
