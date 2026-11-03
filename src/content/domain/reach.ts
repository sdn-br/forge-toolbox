// The relation to another player that lets the player pay into their great buildings, and the filter over it that the
// investments and the notes share.
import type { Relations } from '../../shared/model';

/**
 * a relation, `invited` for an open own friend invitation (a reason to show, no reach for paying in), `none` when there
 * is neither, `unknown` for a player the player store never saw
 */
export type Reach = keyof Relations | 'invited' | 'none' | 'unknown';

/** the reasons in their fixed order; the first one that is no invitation names the cell and ranks the row */
export const REACH_ORDER: Reach[] = ['neighbor', 'friend', 'guildMember', 'invited', 'unknown', 'none'];

/** a switch per relation, one for an open friend invitation and one for players with neither */
export type ReachFilter = Record<keyof Relations | 'invited' | 'none', boolean>;

/** the toggles in their order */
export const REACH_TOGGLES: (keyof ReachFilter)[] = ['neighbor', 'friend', 'guildMember', 'invited', 'none'];

/** every toggle on: nothing is filtered out */
export const ALL_REACH: ReachFilter = { neighbor: true, friend: true, guildMember: true, invited: true, none: true };

/**
 * the relations a player has, in the fixed order, then `invited` for an open friend invitation; `none` without any of
 * them (an invitation alone is no `none`), `unknown` without relations at all
 */
export const reasonsOf = (relations: Relations | undefined, friendInvited = false): Reach[] => {
  const invited: Reach[] = friendInvited ? ['invited'] : [];
  if (!relations) return ['unknown', ...invited];
  const found = REACH_ORDER.filter((r) => r !== 'invited' && relations[r as keyof Relations] === true);
  const all = [...found, ...invited];
  return all.length > 0 ? all : ['none'];
};

/** the reason that stands for the row where it counts as reach: the invitation is none, it does not let anyone pay in */
export const leadReason = (reasons: Reach[]): Reach => reasons.find((r) => r !== 'invited') ?? 'none';

/** a row stays when one of its reasons is switched on; `unknown` always passes */
export const passesReach = (reasons: Reach[], filter: ReachFilter) =>
  reasons.some((reason) => reason === 'unknown' || filter[reason]);
