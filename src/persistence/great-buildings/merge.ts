import type { WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingListRow } from './contract';

/**
 * What a list row does to the known building. Level, sum, costs and `seenAt` change only when the list is newer than
 * the entry. A changed level drops the rankings (they belong to another level), the entry stays so its last state
 * serves the estimate and the retention.
 */
export function applyListRow(
  world: WorldId,
  existing: KnownGreatBuilding | undefined,
  row: GreatBuildingListRow,
  at: number,
  ownContribution = false,
): KnownGreatBuilding | undefined {
  const own = ownContribution || existing?.ownContribution ? { ownContribution: true } : {};
  if (!existing) return { world, ...row, ...own, seenAt: at };
  if (at <= existing.seenAt) return ownContribution && !existing.ownContribution ? { ...existing, ...own } : undefined;
  const next: KnownGreatBuilding = {
    ...existing,
    cityEntityId: row.cityEntityId,
    level: row.level,
    invested: row.invested,
    required: row.required,
    ...own,
    seenAt: at,
  };
  if (row.level !== existing.level) {
    delete next.rankings;
    delete next.rankingsLevel;
    delete next.rankingsAt;
    delete next.rankingsInvested;
    delete next.bestRate;
  }
  return next;
}

/** An entry is safe from the retention when the session player invested in it. */
export const hasOwnContribution = (b: KnownGreatBuilding): boolean =>
  b.ownContribution === true || (b.rankings?.some((r) => r.self && r.rank !== undefined) ?? false);
