// What both sections of the box, the calculator and the snipe list, look up about buildings and players.
import { foestatsDay } from '../../../shared/foestats';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import type { GreatBuildingDef } from '../../model/catalog';
import { FOESTATS_SETTING, type FoestatsRecord } from '../../stores/foestats';
import { type GbLookups, gbLookups } from '../shared/gb-lookups';

/** what the calculator and the snipe list look up: what every list of great buildings does, and foestats */
export interface GbCalcLookups extends GbLookups {
  /** the owner's days at foestats; undefined while foestats is off or was not asked yet */
  foestats(id: PlayerId): FoestatsRecord | undefined;
  /** the current foestats day, `YYYY-MM-DD` */
  today: string;
}

/** what both sections read on a redraw: the lookups as of `now`, the building definitions and the own Arc bonus */
export interface GbShared {
  lookups: GbCalcLookups;
  /** era and level costs of a building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
  arcBonus: number;
  now: number;
}

export function gbShared(ctx: FeatureContext, now: number): GbShared {
  return {
    lookups: {
      ...gbLookups(ctx),
      foestats: (id) => (ctx.settings.of(FOESTATS_SETTING).get() ? ctx.foestats.get(id) : undefined),
      today: foestatsDay(now),
    },
    greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
    arcBonus: ctx.playerBonuses.arcBonus(),
    now,
  };
}
