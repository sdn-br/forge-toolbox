// What both sections of the box, the calculator and the snipe list, look up about buildings and players.
import { type DataSource, linkSource } from '../../../shared/activity-source';
import { foestatsDay } from '../../../shared/foestats';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import type { ArcBonus } from '../../domain/arc-bonus';
import type { LevelCosts } from '../../domain/gb-level-cost';
import type { GreatBuildingDef, TierStart } from '../../model/catalog';
import type { FoestatsRecord } from '../../stores/foestats';
import { type GbLookups, gbLookups } from '../shared/gb-lookups';
import { activitySource, FOESTATS_SETTING } from '../shared/settings';

/** what the calculator and the snipe list look up: what every list of great buildings does, and foestats */
export interface GbCalcLookups extends GbLookups {
  /** the owner's days at foestats or ScoreDB; undefined while no site is asked or it was not asked yet */
  foestats(id: PlayerId): FoestatsRecord | undefined;
  /** the site chosen now, which the activity texts name */
  activitySource: DataSource;
  /** the current foestats day, `YYYY-MM-DD` */
  today: string;
}

/** what both sections read on a redraw: the lookups as of `now`, the building definitions and the own Arc bonus */
export interface GbShared {
  lookups: GbCalcLookups;
  /** era and level costs of a building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
  /** the cost of each level of a building that is not open: the definition, then the shipped costs */
  levelCosts(def: BuildingDefId, gb: GreatBuildingDef): LevelCosts;
  /** per tier; a building takes the one of the level it goes to */
  arcBonus: ArcBonus;
  /** the tiers of great building levels */
  tiers: TierStart[];
  now: number;
}

export function gbShared(ctx: FeatureContext, now: number): GbShared {
  return {
    lookups: {
      ...gbLookups(ctx),
      foestats: (id) => (ctx.settings.of(FOESTATS_SETTING).get() !== 'none' ? ctx.foestats.get(id) : undefined),
      activitySource: linkSource(activitySource(ctx.settings)),
      today: foestatsDay(now),
    },
    greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
    levelCosts: ctx.gbLevelCosts,
    arcBonus: ctx.playerBonuses.arcBonus(),
    tiers: ctx.catalog.greatBuildingTiers(),
    now,
  };
}
