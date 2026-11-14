// ScoreDB (foe.scoredb.io): links to its pages, which also carry the daily points and battles of a player.
import type { GuildId, PlayerId, WorldId } from './ids';

/**
 * The code of a game world at ScoreDB, as in `/DE10/Player/<id>`.
 *
 * ASSUMPTION, not yet checked for every world: it is the game's world id as the toolbox knows it, upper-cased
 * (`de10` → `DE10`). Every ScoreDB link and request goes through here, so a wrong guess is fixed in this one place.
 */
export const scoredbWorld = (world: WorldId): string => world.toUpperCase();

/** the page of a player; the service worker reads the days from the same page */
export const scoredbPlayerUrl = (world: WorldId, player: PlayerId) =>
  `https://foe.scoredb.io/${scoredbWorld(world)}/Player/${player}`;

export const scoredbGuildUrl = (world: WorldId, guild: GuildId) =>
  `https://foe.scoredb.io/${scoredbWorld(world)}/Guild/${guild}`;
