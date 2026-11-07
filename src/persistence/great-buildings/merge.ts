import type { PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingListRow } from './contract';

/** the primary key of a known building */
export const gbKey = (b: Pick<KnownGreatBuilding, 'world' | 'owner' | 'entityId'>): [WorldId, PlayerId, number] => [
  b.world,
  b.owner,
  b.entityId,
];

/**
 * What a list row does to the known building. Level, sum, costs and `seenAt` change only when the list is newer than
 * the entry. A changed level drops the rankings (they belong to another level), the own place and the progress of the
 * growth base; the entry stays so its last state serves the estimate and the retention. A row of the town hall list
 * brings the own place, which replaces an older one, and starts the growth base when there is none: growth then counts
 * from the first town hall list until the building is opened. A newer row is a sighting: more progress replaces the growth, the same progress keeps it.
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
  const { growth, growthFrom, growthAt, ...kept } = existing;
  const next: KnownGreatBuilding = {
    ...(state.level === existing.level ? kept : withoutLevelBound(kept)),
    cityEntityId: state.cityEntityId,
    level: state.level,
    invested: state.invested,
    required: state.required,
    ...(state.tier && { tier: state.tier }),
    ...own,
    seenAt: at,
    ...growthSince(existing, state, at),
  };
  if (ownContribution && next.growthBase === undefined) next.growthBase = state.invested;
  return { ...next, ...place };
}

/**
 * The growth of a sighting at `at`: what it shows paid in beyond the state seen before on the same level, with the time
 * span it covers (`growthFrom` is the sighting before, `growthAt` this one). A sighting with the same progress keeps the
 * growth and its span until something changes. A new level, or less progress, means no growth.
 */
export function growthSince(
  previous: KnownGreatBuilding | undefined,
  next: Pick<KnownGreatBuilding, 'level' | 'invested'>,
  at: number,
): Pick<KnownGreatBuilding, 'growth' | 'growthFrom' | 'growthAt'> {
  if (!previous || previous.level !== next.level) return {};
  const grown = next.invested - previous.invested;
  if (grown > 0) return { growth: grown, growthFrom: previous.seenAt, growthAt: at };
  if (grown < 0 || previous.growth === undefined) return {};
  return {
    growth: previous.growth,
    ...(previous.growthFrom !== undefined && { growthFrom: previous.growthFrom }),
    ...(previous.growthAt !== undefined && { growthAt: previous.growthAt }),
  };
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
  const { ownContribution, ...rest } = b;
  return withoutLevelBound(rest);
}

/** what belongs to one level of the building: the rankings, the own place and the progress of the growth base */
function withoutLevelBound(b: KnownGreatBuilding): KnownGreatBuilding {
  const { contribution, growthBase, rankings, rankingsLevel, rankingsAt, rankingsInvested, ...rest } = b;
  return rest;
}
