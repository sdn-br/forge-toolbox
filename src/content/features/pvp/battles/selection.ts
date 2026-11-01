// Which battle the side panel keeps after the list was read again.
import type { BattleWithPlunder } from '../../../../shared/model';

/**
 * The selected battle after reading `rows` from `offset` of a list of `total` rows, newest first: the battle as read
 * again when the slice has it (a plunder may have come), undefined when the slice spans its time but not the battle
 * (deleted, or an inferred battle replaced by the fought one), else the battle as it was. A slice that starts at the top
 * or reaches the end spans everything above or below.
 */
export function reselect(
  selected: BattleWithPlunder,
  rows: BattleWithPlunder[],
  offset: number,
  total: number,
): BattleWithPlunder | undefined {
  const again = rows.find((b) => b.battleId === selected.battleId);
  if (again) return again;
  const first = rows[0];
  const last = rows.at(-1);
  const spansAbove = offset === 0 || (first !== undefined && first.at > selected.at);
  const spansBelow = offset + rows.length >= total || (last !== undefined && last.at < selected.at);
  return spansAbove && spansBelow ? undefined : selected;
}

/** whether pruning with this limit deletes the battle: it stays while it or its plunder is newer */
export const prunedBy = (b: BattleWithPlunder, before: number) => Math.max(b.at, b.plunderAt ?? b.at) < before;
