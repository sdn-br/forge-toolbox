// foestats.com: links to its pages and the place of a world in its unofficial API (api.forge-db.com).
import type { GuildId, PlayerId, WorldId } from './ids';

/**
 * Where a game world lives at foestats: `<server>/<world>`.
 *
 * ASSUMPTION, not yet checked in the browser: the world is the game's world id as the toolbox knows it (`de20`) and
 * the server is its language prefix (`de`). Every foestats link and API call goes through here, so a wrong guess is
 * fixed in this one place.
 */
export function foestatsWorld(world: WorldId): { server: string; world: string } {
  const id = world.toLowerCase();
  return { server: /^[a-z]+/.exec(id)?.[0] ?? id, world: id };
}

const path = (world: WorldId) => {
  const w = foestatsWorld(world);
  return `${w.server}/${w.world}`;
};

export const foestatsPlayerUrl = (world: WorldId, player: PlayerId) =>
  `https://foestats.com/${path(world)}/players/${player}`;

export const foestatsGuildUrl = (world: WorldId, guild: GuildId) =>
  `https://foestats.com/${path(world)}/guilds/${guild}`;
