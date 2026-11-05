// The Arc bonus of the session player: what his own great buildings and limited bonuses add to every place reward.
// Since 2026-11-05 there are two, one for copper levels and one for gold levels.
import type { LimitedBonus } from '../model/bonus';
import type { GreatBuildingDef, GreatBuildingTier, TierStart } from '../model/catalog';
import type { City } from '../model/city';
import { levelTier } from './gb-tier';

/** the Arc bonus in percent for contributions into levels of each tier */
export type ArcBonus = Record<GreatBuildingTier, number>;

/** the bonus types behind each value: the Arc lists `contribution_boost` 93 and `contribution_boost_gold` 12 */
const TYPES: Record<GreatBuildingTier, string> = { copper: 'contribution_boost', gold: 'contribution_boost_gold' };

/**
 * The Arc bonus in percent: per tier the boosts of that type of the own great buildings plus limited ones of the type.
 * Limited bonuses of own great buildings show up in both lists (seen with a supplies boost), so a limited bonus of a
 * building that already counts for the type is skipped.
 */
export function arcBonus(own: City | undefined, limited: LimitedBonus[] = []): ArcBonus {
  const sum = (type: string) => {
    const counted = new Set<number>();
    let total = 0;
    for (const b of own?.buildings.values() ?? []) {
      for (const bonus of b.greatBuilding?.bonuses ?? []) {
        if (bonus.type !== type) continue;
        total += bonus.value;
        counted.add(b.id);
      }
    }
    for (const l of limited) {
      if (l.type === type && (l.entityId === undefined || !counted.has(l.entityId))) total += l.value;
    }
    return total;
  };
  return { copper: sum(TYPES.copper), gold: sum(TYPES.gold) };
}

/** The Arc bonus that counts for the construction from `level`: the one of the tier of level + 1. */
export const arcBonusAt = (arc: ArcBonus, def: GreatBuildingDef | undefined, level: number, tiers?: TierStart[]) =>
  arc[levelTier(def, level + 1, tiers)];
