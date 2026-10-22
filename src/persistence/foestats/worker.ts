import type { Table } from 'dexie';
import { fetchDue, foestatsDay } from '../../shared/foestats';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsFetch } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import { type FetchLike, foestatsApi, type HistoryPoint } from './api';
import type { FoestatsApi, FoestatsStatus } from './contract';

export type FoestatsTables = {
  foestatsDays: Table<FoestatsDay, [WorldId, PlayerId, string]>;
  foestatsFetches: Table<FoestatsFetch, [WorldId, PlayerId]>;
};

/** what the handlers need from outside; tests pass a fake fetch and their own clock */
export interface FoestatsDeps {
  fetch: FetchLike;
  now: () => number;
}

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

export function foestatsHandlers(db: FoestatsTables, { fetch, now }: FoestatsDeps): Handlers<FoestatsApi> {
  const api = foestatsApi(fetch);
  const history = (world: WorldId, player: PlayerId) =>
    db.foestatsDays.where('[world+player]').equals([world, player]).sortBy('date');
  /** one request per player at a time, even when two views open it together */
  const running = new Map<string, Promise<{ status: FoestatsStatus }>>();

  async function update(world: WorldId, player: PlayerId): Promise<{ status: FoestatsStatus }> {
    const last = await db.foestatsFetches.get([world, player]);
    const at = now();
    if (!fetchDue(last, at)) return { status: last?.ok ? 'fresh' : 'unreachable' };
    const [points, battles] = await Promise.all([api.pointsHistory(world, player), api.battlesHistory(world, player)]);
    const fetched: FoestatsFetch = { world, player, day: foestatsDay(at), at, ok: !!points && !!battles };
    // only both together: a day with one value would never get the other, past days are not asked again
    if (points && battles) {
      const known = new Set((await history(world, player)).map((d) => d.date));
      await db.foestatsDays.bulkPut(newDays(world, player, known, points, battles));
    }
    await db.foestatsFetches.put(fetched);
    return { status: fetched.ok ? 'fetched' : 'unreachable' };
  }

  return {
    'foestats.update': ({ world, player }) => {
      const key = `${world}:${player}`;
      let pending = running.get(key);
      if (!pending) {
        pending = update(world, player).finally(() => running.delete(key));
        running.set(key, pending);
      }
      return pending;
    },
    'foestats.history': ({ world, player }) => history(world, player),
  };
}
