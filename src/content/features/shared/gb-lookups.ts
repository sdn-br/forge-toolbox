// What the features that list great buildings of other players (GB calculator, snipe helper, investments) look up about
// buildings and their owners, and the four actions on a row: star and eye of the building and of its owner.
import { foestatsPlayerUrl } from '../../../shared/foestats';
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Relations } from '../../../shared/model';
import type { FeatureContext } from '../../core/feature';
import { countsIgnored } from '../../ui/ignore';
import type { OwnerLookups } from '../../ui/owner-line';

export interface GbLookups extends OwnerLookups {
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** the owner's name; undefined for a player the store does not know */
  playerName(id: PlayerId): string | undefined;
  /** undefined for an owner the player store does not know */
  relations(id: PlayerId): Relations | undefined;
  isMarked(owner: PlayerId, entityId: number): boolean;
  isIgnored(owner: PlayerId, entityId: number): boolean;
}

/** the lookups read the stores on each call, so one set serves every redraw */
export const gbLookups = (ctx: FeatureContext): GbLookups => ({
  greatBuildingName: (def) => ctx.catalog.greatBuildingName(def),
  playerName: (id) => ctx.players.get(id)?.name,
  playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
  relations: (id) => ctx.players.get(id)?.relations,
  isMarked: (owner, entityId) => ctx.greatBuildings.isMarked(owner, entityId),
  playerMarked: (id) => ctx.players.marked(id),
  isIgnored: (owner, entityId) => ctx.greatBuildings.isIgnored(owner, entityId),
  ownerIgnored: (id) => ctx.players.ignored(id),
});

/** the building, or its owner, is ignored */
export const ignores = (ctx: FeatureContext, owner: PlayerId, entityId: number): boolean =>
  countsIgnored(ctx.greatBuildings.isIgnored(owner, entityId), ctx.players.ignored(owner));

/** what a row of great buildings does with its stars and eyes */
export interface GbRowActions {
  /** puts the star on a building or takes it away */
  mark(owner: PlayerId, entityId: number, marked: boolean): void;
  /** puts the star on a player or takes it away */
  markPlayer(player: PlayerId, marked: boolean): void;
  /** ignores a building or releases it */
  ignore(owner: PlayerId, entityId: number, ignored: boolean): void;
  /** ignores a player or releases them */
  ignorePlayer(player: PlayerId, ignored: boolean): void;
}

export const gbRowActions = (ctx: FeatureContext): GbRowActions => ({
  mark: (owner, entityId, marked) => ctx.greatBuildings.setMarked(owner, entityId, marked),
  markPlayer: (player, marked) => ctx.players.setMarked(player, marked),
  ignore: (owner, entityId, ignored) => ctx.greatBuildings.setIgnored(owner, entityId, ignored),
  ignorePlayer: (player, ignored) => ctx.players.setIgnored(player, ignored),
});
