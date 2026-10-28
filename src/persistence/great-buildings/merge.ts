import type { WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingListRow } from './contract';

/**
 * What a list row does to the known building. Level, sum, costs and `seenAt` change only when the list is newer than
 * the entry. A changed level drops the rankings (they belong to another level), the own place and the progress of the
 * growth base; the entry stays so its last state serves the estimate and the retention. A row of the town hall list
 * brings the own place, which replaces an older one, and starts the growth base when there is none: growth then counts
 * from the first town hall list until the building is opened. A newer row is a sighting: it replaces the growth.
 */
export function applyListRow(
  world: WorldId,
  existing: KnownGreatBuilding | undefined,
  row: GreatBuildingListRow,
  at: number,
  ownContribution = false,
): KnownGreatBuilding | undefined {
  // a list row with a rank is an own contribution, like a row of the contribution list
  const { rank, forgePoints, reward, ...state } = row;
  const own = ownContribution || rank !== undefined || existing?.ownContribution ? { ownContribution: true } : {};
  const place: Pick<KnownGreatBuilding, 'contribution'> =
    rank !== undefined && forgePoints !== undefined && at > (existing?.contribution?.at ?? Number.NEGATIVE_INFINITY)
      ? { contribution: { rank, forgePoints, reward: reward ?? 0, at } }
      : {};
  if (!existing)
    return { world, ...state, ...own, ...place, ...(ownContribution && { growthBase: state.invested }), seenAt: at };
  if (at <= existing.seenAt) {
    const marks = own.ownContribution && !existing.ownContribution;
    const placed = state.level === existing.level ? place : {};
    const based = ownContribution && existing.growthBase === undefined ? { growthBase: existing.invested } : {};
    return marks || placed.contribution || based.growthBase !== undefined
      ? { ...existing, ...own, ...placed, ...based }
      : undefined;
  }
  const next: KnownGreatBuilding = {
    ...existing,
    cityEntityId: state.cityEntityId,
    level: state.level,
    invested: state.invested,
    required: state.required,
    ...own,
    seenAt: at,
  };
  delete next.growth;
  Object.assign(next, growthSince(existing, state));
  if (state.level !== existing.level) {
    delete next.rankings;
    delete next.rankingsLevel;
    delete next.rankingsAt;
    delete next.rankingsInvested;
    delete next.bestRate;
    delete next.contribution;
    delete next.growthBase;
  }
  if (ownContribution && next.growthBase === undefined) next.growthBase = state.invested;
  return { ...next, ...place };
}

/**
 * The growth of a sighting: what it shows paid in beyond the state seen before on the same level. A further write of
 * the same opening with the same progress keeps the growth it had. Nothing grown, or a new level, means no growth.
 */
export function growthSince(
  previous: KnownGreatBuilding | undefined,
  next: Pick<KnownGreatBuilding, 'level' | 'invested'>,
  again = false,
): Pick<KnownGreatBuilding, 'growth'> {
  if (!previous || previous.level !== next.level) return {};
  const grown = next.invested - previous.invested;
  if (grown > 0) return { growth: grown };
  return grown === 0 && again && previous.growth !== undefined ? { growth: previous.growth } : {};
}

/** The player's own marks, the star and the ignore: they stay with the building and only the player removes them. */
export const isFlagged = (b: KnownGreatBuilding): boolean => b.marked === true || b.ignored === true;

/** An entry is safe from the retention when the session player invested in it. */
export const hasOwnContribution = (b: KnownGreatBuilding): boolean =>
  b.ownContribution === true || (b.rankings?.some((r) => r.self && r.rank !== undefined) ?? false);

/**
 * A building the town hall list no longer names (levelled, reward paid out) loses everything that made it an own
 * investment. The star and the ignore are the player's own and stay with the building, which then stands as a plain foreign one.
 */
export function withoutOwnContribution(b: KnownGreatBuilding): KnownGreatBuilding {
  const {
    ownContribution,
    contribution,
    growthBase,
    rankings,
    rankingsLevel,
    rankingsAt,
    rankingsInvested,
    bestRate,
    ...rest
  } = b;
  return rest;
}
