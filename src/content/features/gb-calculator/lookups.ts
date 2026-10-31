// What both sections of the box, the calculator and the snipe list, look up about buildings and players.
import { foestatsDay, foestatsPlayerUrl } from '../../../shared/foestats';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import type { GreatBuildingDef } from '../../model/catalog';
import { FOESTATS_SETTING, type FoestatsRecord } from '../../stores/foestats';
import type { OwnerLookups } from '../../ui/owner-line';

/** what the calculator and the snipe list look up about buildings and players */
export interface GbLookups extends OwnerLookups {
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** the owner's name when the rankings or the list do not tell it */
  playerName(id: PlayerId): string | undefined;
  isMarked(owner: PlayerId, entityId: number): boolean;
  isIgnored(owner: PlayerId, entityId: number): boolean;
  /** the owner's days at foestats; undefined while foestats is off or was not asked yet */
  foestats(id: PlayerId): FoestatsRecord | undefined;
  /** the current foestats day, `YYYY-MM-DD` */
  today: string;
}

/** what both sections read on a redraw: the lookups as of `now`, the building definitions and the own Arc bonus */
export interface GbShared {
  lookups: GbLookups;
  /** era and level costs of a building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
  arcBonus: number;
  now: number;
}

export function gbShared(ctx: FeatureContext, now: number): GbShared {
  return {
    lookups: {
      greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
      playerName: (id) => ctx.players.get(id)?.name,
      playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
      isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
      playerMarked: (id) => ctx.players.marked(id),
      isIgnored: (owner, entityId) => ctx.greatBuildings.isIgnored(owner, entityId),
      ownerIgnored: (id) => ctx.players.ignored(id),
      foestats: (id) => (ctx.settings.of(FOESTATS_SETTING).get() ? ctx.foestats.get(id) : undefined),
      today: foestatsDay(now),
    },
    greatBuilding: (def) => ctx.catalog.get(def)?.greatBuilding,
    arcBonus: ctx.playerBonuses.arcBonus(),
    now,
  };
}

/** the building, or its owner, is ignored */
export const ignores = (ctx: FeatureContext, owner: PlayerId, entityId: number): boolean =>
  ctx.greatBuildings.isIgnored(owner, entityId) || ctx.players.ignored(owner) === true;
