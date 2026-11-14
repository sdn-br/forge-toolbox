// Where the activity of other players comes from (setting "Abfrage") and where their names link to.
import { foestatsGuildUrl, foestatsPlayerUrl } from './foestats';
import type { GuildId, PlayerId, WorldId } from './ids';
import { scoredbGuildUrl, scoredbPlayerUrl } from './scoredb';

/** a site that is asked about players */
export type DataSource = 'foestats' | 'scoredb';
/** the choice of the setting: a site, or none at all */
export type ActivitySource = 'none' | DataSource;

/** where player and guild names link to: the chosen site, foestats when none is asked */
export const linkSource = (source: ActivitySource): DataSource => (source === 'none' ? 'foestats' : source);

export const sourcePlayerUrl = (source: ActivitySource, world: WorldId, player: PlayerId) =>
  linkSource(source) === 'scoredb' ? scoredbPlayerUrl(world, player) : foestatsPlayerUrl(world, player);

export const sourceGuildUrl = (source: ActivitySource, world: WorldId, guild: GuildId) =>
  linkSource(source) === 'scoredb' ? scoredbGuildUrl(world, guild) : foestatsGuildUrl(world, guild);
