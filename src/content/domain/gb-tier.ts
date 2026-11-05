// The tier of a great building level: copper or gold (seen 2026-11-05). The Arc pays its two bonuses by it.
import type { GreatBuildingDef, GreatBuildingTier, TierStart } from '../model/catalog';

/** the tiers as the metadata file `great_building_tiers` lists them on 2026-11-05, while it is not loaded */
export const DEFAULT_TIERS: TierStart[] = [
  { tier: 'copper', startLevel: 1 },
  { tier: 'gold', startLevel: 101 },
];

/**
 * The tier of `level`, the level a contribution goes to (the building's level + 1): the tier with the highest start
 * the level reaches, up to the building's `maxTier`. The ranges of the file overlap (copper 1 to 200, gold from 101),
 * so the start alone decides. Without a definition `fallback`; a definition without `maxTier` stays copper.
 */
export function levelTier(
  def: GreatBuildingDef | undefined,
  level: number,
  tiers: TierStart[] = DEFAULT_TIERS,
  fallback: GreatBuildingTier = 'copper',
): GreatBuildingTier {
  if (!def) return fallback;
  const max = tiers.findIndex((t) => t.tier === (def.maxTier ?? 'copper'));
  let best: TierStart | undefined;
  tiers.forEach((t, i) => {
    if (i <= max && t.startLevel <= level && (!best || t.startLevel > best.startLevel)) best = t;
  });
  return best?.tier ?? 'copper';
}
