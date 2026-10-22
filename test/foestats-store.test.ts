import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { FoestatsStore } from '../src/content/stores/foestats';
import type { FetchLike } from '../src/persistence/foestats/api';
import { RETRY_AFTER } from '../src/shared/foestats';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const player = playerId(4711);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

type Series = Record<string, number>;

/** foestats with the given histories; `down` makes it refuse like a Cloudflare block */
function fakeFoestats(points: Series, battles: Series) {
  const state = { points, battles, down: false };
  const answer = (series: Series) =>
    JSON.stringify({ success: true, data: Object.entries(series).map(([date, value]) => ({ date, value })) });
  const fetch = vi.fn<FetchLike>(async (url) => {
    if (state.down) return { ok: false, status: 403, text: async () => '<html>' };
    const body = url.endsWith('/points-history') ? answer(state.points) : answer(state.battles);
    return { ok: true, status: 200, text: async () => body };
  });
  return { state, fetch };
}

function setup(points: Series, battles: Series, start = at(22, 9)) {
  const clock = { now: start };
  const foestats = fakeFoestats(points, battles);
  const db = testDb({ fetch: foestats.fetch, now: () => clock.now });
  const bus = createBus();
  const updated: number[] = [];
  bus.on('foestats.updated', ({ player }) => updated.push(player));
  const store = new FoestatsStore(bus, world, db.foestats);
  const values = () => store.get(player)?.days.map((d) => [d.date, d.points, d.battles]);
  return { ...foestats, clock, db, store, updated, values };
}

describe('foestats store', () => {
  it('keeps both histories as one row per day, oldest first, and tells the views', async () => {
    const { store, fetch, updated, values } = setup(
      { '2026-10-21': 120, '2026-10-20': 100 },
      { '2026-10-20': 5, '2026-10-21': 7 },
    );
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-20', 100, 5],
      ['2026-10-21', 120, 7],
    ]);
    expect(store.get(player)?.unreachable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(updated).toEqual([player]);
  });

  it('asks once per day and reads the stored days on the next view', async () => {
    const { store, fetch, clock, values } = setup({ '2026-10-22': 100 }, { '2026-10-22': 5 });
    await store.view(player);
    clock.now = at(22, 23);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(values()).toEqual([['2026-10-22', 100, 5]]);
  });

  it('remembers the last request in the database, so a new page does not ask again', async () => {
    const { store, fetch, db, clock } = setup({ '2026-10-22': 100 }, { '2026-10-22': 5 });
    await store.view(player);
    const reopened = new FoestatsStore(createBus(), world, db.foestats);
    clock.now = at(22, 12);
    await reopened.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reopened.get(player)?.days).toHaveLength(1);
  });

  it('waits for the daily update at 05:40 before asking for the next day', async () => {
    const { store, fetch, clock } = setup({ '2026-10-22': 100 }, { '2026-10-22': 5 });
    await store.view(player);
    clock.now = at(23, 5, 39);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
    clock.now = at(23, 5, 40);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('only adds new days and leaves the known ones as they are', async () => {
    const { store, state, clock, values } = setup({ '2026-10-21': 100 }, { '2026-10-21': 5 });
    await store.view(player);
    state.points = { '2026-10-21': 999, '2026-10-22': 130 };
    state.battles = { '2026-10-21': 999, '2026-10-22': 9 };
    clock.now = at(23, 8);
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-21', 100, 5],
      ['2026-10-22', 130, 9],
    ]);
  });

  it('marks foestats unreachable, keeps the known days and tries again only after a while', async () => {
    const { store, state, fetch, clock, values } = setup({ '2026-10-21': 100 }, { '2026-10-21': 5 });
    await store.view(player);
    state.down = true;
    clock.now = at(23, 8);
    await store.view(player);
    expect(store.get(player)?.unreachable).toBe(true);
    expect(values()).toEqual([['2026-10-21', 100, 5]]);
    expect(fetch).toHaveBeenCalledTimes(4);

    clock.now += RETRY_AFTER - 1;
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(store.get(player)?.unreachable).toBe(true);

    state.down = false;
    clock.now += 1;
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(store.get(player)?.unreachable).toBe(false);
  });

  it('keeps nothing when only one history arrives', async () => {
    const { store, fetch } = setup({ '2026-10-21': 100 }, {});
    fetch.mockImplementation(async (url) =>
      url.endsWith('/points-history')
        ? { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: [] }) }
        : { ok: false, status: 500, text: async () => '' },
    );
    await store.view(player);
    expect(store.get(player)).toEqual({ days: [], unreachable: true });
  });

  it('asks only once when two views open the same player together', async () => {
    const { store, fetch } = setup({ '2026-10-22': 100 }, { '2026-10-22': 5 });
    await Promise.all([store.view(player), store.view(player)]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
