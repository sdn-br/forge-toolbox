// What the features that show other players look up about them (name, foestats pages, guild, relations, star and eye),
// and the two actions on a player: star and eye.
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

/** the lookups read the stores on each call, so one set serves every redraw */
export const playerLookups = (ctx: FeatureContext): PlayerLookups => ({
  playerName: (id) => ctx.players.get(id)?.name,
  playerUrl: (id) => foestatsPlayerUrl(ctx.world, id),
  playerGuild: (id) => {
    const guild = ctx.players.get(id)?.guild;
    return guild && { name: guild.name, url: foestatsGuildUrl(ctx.world, guild.id) };
  },
  relations: (id) => ctx.players.get(id)?.relations,
  playerMarked: (id) => ctx.players.marked(id),
  ownerIgnored: (id) => ctx.players.ignored(id),
});

/** what a row with a player does with their star and eye */
export interface PlayerRowActions {
  /** puts the star on a player or takes it away */
  markPlayer(player: PlayerId, marked: boolean): void;
  /** ignores a player or releases them */
  ignorePlayer(player: PlayerId, ignored: boolean): void;
}

export const playerRowActions = (ctx: FeatureContext): PlayerRowActions => ({
  markPlayer: (player, marked) => ctx.players.setMarked(player, marked),
  ignorePlayer: (player, ignored) => ctx.players.setIgnored(player, ignored),
});
