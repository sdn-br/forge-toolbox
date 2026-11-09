// What a foreign great building leaves in the database: the row of an opened construction, and the own contribution
// read from its rankings.
import type { WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { Construction, RankingRow } from '../model/great-building';

/** the Forge points the session player holds in the rankings; 0 without a ranked place of its own */
export const ownRankedFp = (rankings: RankingRow[]): number =>
  rankings.find((r) => r.self && r.rank !== undefined)?.fp ?? 0;

/** how much the own deposit grew from the old rankings to the new ones */
export const ownDepositGrowth = (before: RankingRow[], after: RankingRow[]): number =>
  ownRankedFp(after) - ownRankedFp(before);

/** The row of the open construction as the database keeps it; undefined for an own building or one without entity. */
export function knownRowOf(open: Construction, world: WorldId, at: number): KnownGreatBuilding | undefined {
  const entity = open.entity;
  if (open.own || !entity) return undefined;
  const invested = open.rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0);
  const self = open.rankings.find((r) => r.self && r.rank !== undefined);
  return {
    world,
    owner: open.owner,
    entityId: open.entityId,
    cityEntityId: entity.def,
    level: entity.level,
    invested: entity.invested,
    required: entity.required,
    maxLevel: entity.maxLevel,
    connected: entity.connected,
    rankings: open.rankings,
    rankingsLevel: open.rankingsLevel ?? entity.level,
    rankingsAt: open.seenAt,
    rankingsInvested: invested,
    ...(self?.rank !== undefined && {
      ownContribution: true,
      contribution: { rank: self.rank, forgePoints: self.fp ?? 0, reward: self.reward?.fp ?? 0, at },
    }),
    // the building is open in the game now: what is paid in from here on is growth
    growthBase: entity.invested,
    seenAt: at,
  };
}
