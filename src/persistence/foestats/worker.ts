import type { Table } from 'dexie';
import type { HandlerDeps } from '../../background/handlers';
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
 * The rules of asking foestats live here, the request itself in the content script: the service worker decides when
 * a request is due and keeps what came back. A player foestats does not know is kept per player until the next
 * foestats day. An unreachable foestats holds back every player for `RETRY_AFTER`; that is kept in memory only, a
 * restarted service worker just asks again.
 */
export function foestatsHandlers(db: FoestatsTables, { now }: Pick<HandlerDeps, 'now'>): Handlers<FoestatsApi> {
  /** claimed requests not stored yet, with the time of the claim */
  const claims = new Map<string, number>();
  const key = (world: WorldId, player: PlayerId) => `${world}:${player}`;
  /** when foestats last did not answer; cleared by any answer */
  let unreachableAt: number | undefined;
  const unknown = async (world: WorldId, player: PlayerId) =>
    (await db.foestatsFetches.get([world, player]))?.unknown === true;

  return {
    'foestats.claim': async ({ world, player }) => {
      const last = await db.foestatsFetches.get([world, player]);
      const at = now();
      const state = { unreachable: unreachableAt !== undefined, unknown: last?.unknown === true };
      const claimed = claims.get(key(world, player));
      const fetch = !(
        (unreachableAt !== undefined && at - unreachableAt < RETRY_AFTER) ||
        !fetchDue(last, at) ||
        (claimed !== undefined && at - claimed < CLAIM_TIMEOUT)
      );
      if (fetch) claims.set(key(world, player), at);
      return { fetch, ...state };
    },
    'foestats.store': async ({ world, player, outcome }) => {
      const at = now();
      try {
        if (outcome === 'unreachable') {
          unreachableAt = at;
          return { unreachable: true, unknown: await unknown(world, player) };
        }
        unreachableAt = undefined;
        const days = outcome !== 'unknown' && outcome;
        if (days) {
          // what foestats tells for the snapshot day beats a worked out value; a worked out day only fills a gap
          await db.foestatsDays.put(days.day);
          const { before } = days;
          if (before && !(await db.foestatsDays.get([world, player, before.date]))) await db.foestatsDays.put(before);
        }
        // a snapshot without its day, points or battles tells as little as a player foestats does not know
        await db.foestatsFetches.put({
          world,
          player,
          day: foestatsDay(at),
          at,
          ok: true,
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
