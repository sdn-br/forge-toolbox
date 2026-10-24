// The double harvest of a Forge point great building: a building harvested just before its level up produces again
// right after it, now on the new level, so the Forge points of level X + 1 come on top of the level up.
import type { GreatBuildingDef } from '../stores/catalog';

/** the Ark and the Temple of Relics do not count, as in the old toolbox */
const EXCLUDED: readonly string[] = ['X_FutureEra_Landmark1', 'X_AllAge_Expedition'];

/** the definition lists the production of levels 0 to 10, later ones are estimated from the last */
const LISTED_LEVEL = 10;

export interface DoubleHarvest {
  /** Forge points the building produces on the level after the construction */
  fp: number;
  /** computed from level 10, not game data */
  estimate: boolean;
}

/** what `GreatBuildingsService.getConstruction` told about the level after the one being built */
export interface NextProduction {
  /** the building's level when the construction was opened */
  level: number;
  type: string;
  value: number;
}

/** The building takes part in the double harvest: it produces Forge points by its definition and is not excluded. */
export const hasDoubleHarvest = (def: string, greatBuilding: GreatBuildingDef): boolean =>
  greatBuilding.fpProduction !== undefined && !EXCLUDED.includes(def);

/**
 * The Forge points the building produces on level `level + 1`, for the construction from `level` to `level + 1`: exact
 * from the open construction for the level being built, else from the definition up to level 10, above estimated as
 * the production of level 10 times (level + 1) / 10, rounded. Undefined when the building takes no part or the
 * definition lacks the value.
 */
export function doubleHarvest(
  def: string,
  greatBuilding: GreatBuildingDef,
  level: number,
  next?: NextProduction,
): DoubleHarvest | undefined {
  if (!hasDoubleHarvest(def, greatBuilding)) return undefined;
  if (next && next.level === level && next.type === 'strategy_points') return { fp: next.value, estimate: false };
  const production = greatBuilding.fpProduction as number[];
  const target = level + 1;
  if (target <= LISTED_LEVEL) {
    const fp = production[target];
    return fp === undefined ? undefined : { fp, estimate: false };
  }
  const top = production[LISTED_LEVEL];
  return top === undefined ? undefined : { fp: Math.round((top * target) / LISTED_LEVEL), estimate: true };
}
