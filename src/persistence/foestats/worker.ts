import type { Table } from 'dexie';
import type { HandlerDeps } from '../../background/handlers';
import type { DataSource } from '../../shared/activity-source';
import { fetchDue, foestatsDay, RETRY_AFTER } from '../../shared/foestats';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsFetch } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { FoestatsApi } from './contract';

export type FoestatsTables = {
  foestatsDays: Table<FoestatsDay, [WorldId, PlayerId, string]>;
  foestatsFetches: Table<FoestatsFetch, [WorldId, PlayerId]>;
};

/** a claimed request that was never stored (the tab closed meanwhile) blocks no longer than this */
export const CLAIM_TIMEOUT = 60_000;

/**
 * The rules of asking foestats or ScoreDB live here, the request itself elsewhere (foestats from the content script,
 * ScoreDB through `scoredb.player`): the service worker decides when a request is due and keeps what came back. Both
 * sites share the tables, their points and battles are the game's. A player the site does not know is kept per player
 * and site until the next foestats day; days of the day told by one site stand for both. An unreachable site holds back
 * every player for `RETRY_AFTER`, per site, so switching to the other site asks at once; that is kept in memory only, a
 * restarted service worker just asks again.
 */
export function foestatsHandlers(db: FoestatsTables, { now }: Pick<HandlerDeps, 'now'>): Handlers<FoestatsApi> {
  /** claimed requests not stored yet, with the time of the claim */
  const claims = new Map<string, number>();
  const key = (world: WorldId, player: PlayerId) => `${world}:${player}`;
  /** when each site last did not answer; cleared by any answer of that site */
  const unreachableAt = new Map<DataSource, number>();
  /** whether `source` does not know the player; older records without a site are foestats' */
  const unknownTo = (last: FoestatsFetch | undefined, source: DataSource) =>
    last?.unknown === true && (last.source ?? 'foestats') === source;

  return {
    'foestats.claim': async ({ world, player, source = 'foestats' }) => {
      const last = await db.foestatsFetches.get([world, player]);
      const at = now();
      const down = unreachableAt.get(source);
      const state = { unreachable: down !== undefined, unknown: unknownTo(last, source) };
      const claimed = claims.get(key(world, player));
      const fetch = !(
        (down !== undefined && at - down < RETRY_AFTER) ||
        !fetchDue(last, at, source) ||
        (claimed !== undefined && at - claimed < CLAIM_TIMEOUT)
      );
      if (fetch) claims.set(key(world, player), at);
      return { fetch, ...state };
    },
    'foestats.store': async ({ world, player, outcome, source = 'foestats' }) => {
      const at = now();
      try {
        if (outcome === 'unreachable') {
          unreachableAt.set(source, at);
          return { unreachable: true, unknown: unknownTo(await db.foestatsFetches.get([world, player]), source) };
        }
        unreachableAt.delete(source);
        const days = outcome !== 'unknown' && outcome.days.length > 0 && outcome;
        if (days) {
          // what the site tells for a day beats a worked out value; a worked out day only fills a gap
          await db.foestatsDays.bulkPut(days.days);
          const { before } = days;
          if (before && !(await db.foestatsDays.get([world, player, before.date]))) await db.foestatsDays.put(before);
        }
        // an answer without a day with points and battles tells as little as a player the site does not know
        await db.foestatsFetches.put({
          world,
          player,
          day: foestatsDay(at),
          at,
          ok: true,
          source,
          ...(!days && { unknown: true }),
        });
        return { unreachable: false, unknown: !days };
      } finally {
        claims.delete(key(world, player));
      }
    },
    'foestats.history': ({ world, player }) =>
      db.foestatsDays.where('[world+player]').equals([world, player]).sortBy('date'),
  };
}
