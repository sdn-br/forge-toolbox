// What both investment tabs share about filtering: the default relation toggles, their words and the saved filters.
import { t } from '../../core/texts';
import { ALL_REACH, type Reach, type ReachFilter } from '../../domain/reach';

/** the first three on: what the former checkbox "only reachable" meant */
export const DEFAULT_REACH: ReachFilter = { neighbor: true, friend: true, guildMember: true, none: false };

/** every reason as words, or why there is none */
export const reachTip = (reasons: Reach[]) => {
  const [first] = reasons;
  if (first === 'none' || first === 'unknown') return t(`investments.reachHint.${first}`);
  return reasons.map((r) => t(`investments.reach.${r}`)).join(', ');
};

/** the former checkbox "only reachable": on was the default, off let all four through; reasons saved since then win */
export const migrateReach = (saved: Record<string, unknown>): Record<string, unknown> =>
  saved.onlyReachable === false
    ? {
        ...saved,
        reach: { ...ALL_REACH, ...(typeof saved.reach === 'object' && saved.reach !== null ? saved.reach : {}) },
      }
    : saved;
