// What the features that show other players look up about them (name, foestats pages, guild, relations, star and eye, the PvP marks),
// and the actions on a player: star, eye and the PvP marks.
import { foestatsGuildUrl, foestatsPlayerUrl } from '../../../shared/foestats';
import type { PlayerId } from '../../../shared/ids';
import type { Relations } from '../../../shared/model';
import type { FeatureContext } from '../../core/feature';
import type { OwnerLookups } from '../../ui/owner-line';

export interface PlayerLookups extends OwnerLookups {
  /** the player's name; undefined for a player the store does not know */
  playerName(id: PlayerId): string | undefined;
  /** undefined for a player the player store does not know */
  relations(id: PlayerId): Relations | undefined;
}

/** the lookups of the PvP features, with the two PvP marks the great building features do not use */
export interface PvpPlayerLookups extends PlayerLookups {
  /** whether the player is good to plunder; undefined for a player the store does not know */
  plunderWorthy(id: PlayerId): boolean | undefined;
  /** whether the player is not to be attacked; undefined for a player the store does not know */
  noAttack(id: PlayerId): boolean | undefined;
}

/** the lookups read the stores on each call, so one set serves every redraw */
export const playerLookups = (ctx: FeatureContext): PvpPlayerLookups => ({
  playerName: (id) => ctx.players.get(id)?.name,
  playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
  playerGuild: (id) => {
    const guild = ctx.players.get(id)?.guild;
    return guild && { name: guild.name, url: foestatsGuildUrl(ctx.world, guild.id) };
  },
  relations: (id) => ctx.players.get(id)?.relations,
  playerMarked: (id) => ctx.players.marked(id),
  ownerIgnored: (id) => ctx.players.ignored(id),
  plunderWorthy: (id) => ctx.players.plunderWorthy(id),
  noAttack: (id) => ctx.players.noAttack(id),
});

/** what a row with a player does with their star and eye */
export interface PlayerRowActions {
  /** puts the star on a player or takes it away */
  markPlayer(player: PlayerId, marked: boolean): void;
  /** ignores a player or releases them */
  ignorePlayer(player: PlayerId, ignored: boolean): void;
}

/** the actions of the PvP features, with the two PvP marks */
export interface PvpRowActions extends PlayerRowActions {
  /** marks a player as good to plunder or takes it away */
  plunderPlayer(player: PlayerId, plunderWorthy: boolean): void;
  /** marks a player as not to attack or takes it away */
  noAttackPlayer(player: PlayerId, noAttack: boolean): void;
}

export const playerRowActions = (ctx: FeatureContext): PvpRowActions => ({
  markPlayer: (player, marked) => ctx.players.setMarked(player, marked),
  ignorePlayer: (player, ignored) => ctx.players.setIgnored(player, ignored),
  plunderPlayer: (player, value) => ctx.players.setPlunderWorthy(player, value),
  noAttackPlayer: (player, value) => ctx.players.setNoAttack(player, value),
});
