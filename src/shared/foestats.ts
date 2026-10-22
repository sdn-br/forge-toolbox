// foestats.com: links to its pages and the place of a world in its unofficial API (api.forge-db.com).
import type { GuildId, PlayerId, WorldId } from './ids';
import type { FoestatsFetch } from './model';

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

/** foestats takes its daily snapshot early in the morning; from this local time on, today's data counts */
const UPDATE_MINUTE = 5 * 60 + 40;
/** after a failed request, foestats is asked again about the same player no sooner than this */
export const RETRY_AFTER = 30 * 60_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** The local day of the newest foestats data at `now`, `YYYY-MM-DD`: before 05:40 that is still yesterday. */
export function foestatsDay(now: number): string {
  const d = new Date(now);
  if (d.getHours() * 60 + d.getMinutes() < UPDATE_MINUTE) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** At most once per player and foestats day; after a failure again once `RETRY_AFTER` has passed. */
export function fetchDue(last: FoestatsFetch | undefined, now: number): boolean {
  if (!last || last.day < foestatsDay(now)) return true;
  return !last.ok && now - last.at >= RETRY_AFTER;
}
