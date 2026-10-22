import type { Table } from 'dexie';
import { fetchDue, foestatsDay } from '../../shared/foestats';
import type { HistoryPoint } from '../../shared/foestats-api';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsFetch } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { FoestatsApi } from './contract';

export type FoestatsTables = {
  foestatsDays: Table<FoestatsDay, [WorldId, PlayerId, string]>;
  foestatsFetches: Table<FoestatsFetch, [WorldId, PlayerId]>;
};

/** the clock of the handlers; tests pass their own */
export interface FoestatsDeps {
  now: () => number;
}

/** a claimed request that was never stored (the tab closed meanwhile) blocks no longer than this */
export const CLAIM_TIMEOUT = 60_000;

/** the days of both histories that are not known yet; past days never change, so known ones stay as they are */
export function newDays(
  world: WorldId,
  player: PlayerId,
  known: ReadonlySet<string>,
  points: HistoryPoint[],
  battles: HistoryPoint[],
): FoestatsDay[] {
  const days = new Map<string, FoestatsDay>();
  const day = (date: string) => {
    const d = days.get(date) ?? { world, player, date };
    days.set(date, d);
    return d;
  };
  for (const p of points) if (!known.has(p.date)) day(p.date).points = p.value;
  for (const b of battles) if (!known.has(b.date)) day(b.date).battles = b.value;
  return [...days.values()];
}

/**
 * The rules of asking foestats live here, the request itself in the content script: the service worker decides when
 * a request is due and keeps what came back.
 */
export function foestatsHandlers(db: FoestatsTables, { now }: FoestatsDeps): Handlers<FoestatsApi> {
  const history = (world: WorldId, player: PlayerId) =>
    db.foestatsDays.where('[world+player]').equals([world, player]).sortBy('date');
  /** claimed requests not stored yet, with the time of the claim */
  const claims = new Map<string, number>();
  const key = (world: WorldId, player: PlayerId) => `${world}:${player}`;

  return {
    'foestats.claim': async ({ world, player }) => {
      const last = await db.foestatsFetches.get([world, player]);
      const at = now();
      const unreachable = last?.ok === false;
      const claimed = claims.get(key(world, player));
      if (!fetchDue(last, at) || (claimed !== undefined && at - claimed < CLAIM_TIMEOUT)) {
        return { fetch: false, unreachable };
      }
      claims.set(key(world, player), at);
      return { fetch: true, unreachable };
    },
    'foestats.store': async ({ world, player, points, battles }) => {
      const at = now();
      const ok = !!points && !!battles;
      try {
        // only both together: a day with one value would never get the other, past days are not asked again
        if (points && battles) {
          const known = new Set((await history(world, player)).map((d) => d.date));
          await db.foestatsDays.bulkPut(newDays(world, player, known, points, battles));
        }
        await db.foestatsFetches.put({ world, player, day: foestatsDay(at), at, ok });
      } finally {
        claims.delete(key(world, player));
      }
      return { unreachable: !ok };
    },
    'foestats.history': ({ world, player }) => history(world, player),
  };
}
