// What the features that list great buildings of other players (GB calculator, snipe helper, investments) look up about
// buildings and their owners, and the four actions on a row: star and eye of the building and of its owner.
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { FeatureContext } from '../../core/feature';
import { countsIgnored } from '../../ui/ignore';
import { type PlayerLookups, type PlayerRowActions, playerLookups, playerRowActions } from './player-lookups';

export interface GbLookups extends PlayerLookups {
  greatBuildingName(def: BuildingDefId): string | undefined;
  isMarked(owner: PlayerId, entityId: number): boolean;
  isIgnored(owner: PlayerId, entityId: number): boolean;
}

/** the lookups read the stores on each call, so one set serves every redraw */
export const gbLookups = (ctx: FeatureContext): GbLookups => ({
  ...playerLookups(ctx),
  greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
  isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
  isIgnored: (owner, entityId) => ctx.greatBuildings.isIgnored(owner, entityId),
});

/** the building, or its owner, is ignored */
export const ignores = (ctx: FeatureContext, owner: PlayerId, entityId: number): boolean =>
  countsIgnored(ctx.greatBuildings.isIgnored(owner, entityId), ctx.players.ignored(owner));

/** what a row of great buildings does with its stars and eyes */
export interface GbRowActions extends PlayerRowActions {
  /** puts the star on a building or takes it away */
  mark(owner: PlayerId, entityId: number, marked: boolean): void;
  /** ignores a building or releases it */
  ignore(owner: PlayerId, entityId: number, ignored: boolean): void;
}

export const gbRowActions = (ctx: FeatureContext): GbRowActions => ({
  ...playerRowActions(ctx),
  mark: (owner, entityId, marked) => ctx.greatBuildings.setMarked(owner, entityId, marked),
  ignore: (owner, entityId, ignored) => ctx.greatBuildings.setIgnored(owner, entityId, ignored),
});
