// What both investment tabs share about filtering: the relation to the owner, the text match and the saved toggles.
import type { Relations } from '../../../shared/model';
import { t } from '../../core/texts';

/** a switch per reason to pay in, and one for the rows out of reach */
export type ReachFilter = Record<keyof Relations | 'none', boolean>;

/** the reason toggles in their order */
export const REACH_TOGGLES: (keyof ReachFilter)[] = ['neighbor', 'friend', 'guildMember', 'none'];

/** the first three on: what the former checkbox "only reachable" meant */
export const DEFAULT_REACH: ReachFilter = { neighbor: true, friend: true, guildMember: true, none: false };

/** why the player can pay into the owner's buildings; `none` when not at all, `unknown` for an owner never seen */
export type Reach = keyof Relations | 'none' | 'unknown';

/** the first reason in this order names the cell; the reachable ones first when sorted */
export const REACH_ORDER: Reach[] = ['neighbor', 'friend', 'guildMember', 'unknown', 'none'];

/** the relations that let the player pay in, in the fixed order */
export const reasonsOf = (relations: Relations | undefined): Reach[] => {
  if (!relations) return ['unknown'];
  const found = REACH_ORDER.filter((r) => relations[r as keyof Relations] === true);
  return found.length > 0 ? found : ['none'];
};

/** every reason as words, or why there is none */
export const reachTip = (reasons: Reach[]) => {
  const [first] = reasons;
  if (first === 'none' || first === 'unknown') return t(`investments.reachHint.${first}`);
  return reasons.map((r) => t(`investments.reach.${r}`)).join(', ');
};

/** a row stays when one of its reasons is switched on; owners the player store does not know always pass */
export const passesReach = (reasons: Reach[], filter: ReachFilter) =>
  reasons.some((reason) => reason === 'unknown' || filter[reason]);

/** part of a text, any case */
export const contains = (text: string, part: string) =>
  text.toLocaleLowerCase('de').includes(part.trim().toLocaleLowerCase('de'));

/** the player field names this owner exactly, in any case; the field is the only state, a part of a name marks nothing */
export const picks = (field: string, name: string) => field.trim().toLowerCase() === name.toLowerCase();

/** the saved toggles of a record, each one that is missing or broken at its default */
export function savedToggles<K extends string>(
  keys: readonly K[],
  saved: unknown,
  defaults: Record<K, boolean>,
): Record<K, boolean> {
  const found = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<Record<K, unknown>>;
  return Object.fromEntries(
    keys.map((key) => [key, typeof found[key] === 'boolean' ? found[key] : defaults[key]]),
  ) as Record<K, boolean>;
}

/** the saved reason toggles; the former checkbox "only reachable" maps to the default (on) or to all four (off) */
export function savedReach(f: { reach?: unknown; onlyReachable?: unknown }): ReachFilter {
  const base: ReachFilter =
    f.onlyReachable === false ? { neighbor: true, friend: true, guildMember: true, none: true } : DEFAULT_REACH;
  return savedToggles(REACH_TOGGLES, f.reach, base);
}
