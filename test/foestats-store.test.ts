import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { FoestatsStore } from '../src/content/stores/foestats';
import { CLAIM_TIMEOUT } from '../src/persistence/foestats/worker';
import { RETRY_AFTER } from '../src/shared/foestats';
import { type FetchLike, foestatsApi } from '../src/shared/foestats-api';
import { playerId, worldId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');
const player = playerId(4711);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

/** the `data` of a player snapshot as foestats sends it, numbers partly as strings */
type Snapshot = Record<string, unknown>;

const snapshot = (date: string, points: number, pointsChange: number, battles: number, battlesChange: number) => ({
  rank: '1234',
  points,
  points_change: String(pointsChange),
  points_change_percent: '0.4',
  battles: String(battles),
  battles_change: battlesChange,
  era: 'SpaceAgeMars',
  guild_id: '77',
  guild_name: 'Gilde',
  is_active: 1,
  data_date: date,
});

/**
 * foestats with the given snapshot for every player; `down` makes it refuse like since 2026-10-28 for the histories,
 * `missing` answers 404 like for a player it does not know
 */
function fakeFoestats(data: Snapshot) {
  const state = { data, down: false, missing: false };
  const fetch = vi.fn<FetchLike>(async () => {
    if (state.missing) return { ok: false, status: 404, text: async () => '{"error":"Player not found"}' };
    if (state.down) {
      const body = JSON.stringify({ error: 'Session required', sessionRequired: true, reason: 'missing' });
      return { ok: false, status: 403, text: async () => body };
    }
    const body = JSON.stringify({ success: true, data: state.data });
    return { ok: true, status: 200, text: async () => body };
  });
  return { state, fetch };
}

function setup(data: Snapshot, start = at(22, 9)) {
  const clock = { now: start };
  const foestats = fakeFoestats(data);
  const db = testDb({ now: () => clock.now });
  const bus = createBus();
  const updated: number[] = [];
  bus.on('foestats.updated', ({ player }) => updated.push(player));
  /** a store as one tab of the game has it; the requests go out from there, the database is shared */
  const tab = () => new FoestatsStore(createBus(), world, db.foestats, foestatsApi(foestats.fetch));
  const store = new FoestatsStore(bus, world, db.foestats, foestatsApi(foestats.fetch));
  const values = () => store.get(player)?.days.map((d) => [d.date, d.points, d.battles]);
  return { ...foestats, clock, db, store, tab, updated, values };
}

const day22 = snapshot('2026-10-22', 1200, 50, 70, 3);

describe('foestats store', () => {
  it('keeps the snapshot day and the day before worked out from the changes, and tells the views', async () => {
    const { store, fetch, updated, values } = setup(day22);
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-21', 1150, 67],
      ['2026-10-22', 1200, 70],
    ]);
    expect(store.get(player)?.days.map((d) => d.active)).toEqual([undefined, true]);
    expect(store.get(player)?.unreachable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    // once when the request starts, once with the answer
    expect(updated).toEqual([player, player]);
  });

  it('keeps only the snapshot day when a change is missing', async () => {
    const { store, values } = setup({ ...day22, battles_change: null });
    await store.view(player);
    expect(values()).toEqual([['2026-10-22', 1200, 70]]);
  });

  it('keeps foestats saying the player is inactive', async () => {
    const { store } = setup({ ...day22, is_active: 0 });
    await store.view(player);
    expect(store.get(player)?.days.at(-1)?.active).toBe(false);
  });

  it('builds up the history from one snapshot a day', async () => {
    const { store, state, clock, values } = setup(day22);
    await store.view(player);
    clock.now = at(24, 9);
    state.data = snapshot('2026-10-24', 1300, 0, 75, 0);
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-21', 1150, 67],
      ['2026-10-22', 1200, 70],
      ['2026-10-23', 1300, 75],
      ['2026-10-24', 1300, 75],
    ]);
  });

  it('does not overwrite a snapshot day with a worked out value', async () => {
    const { store, state, clock, values } = setup(day22);
    await store.view(player);
    clock.now = at(23, 9);
    // the changes do not add up with the day before, the snapshot of the 22nd stays
    state.data = snapshot('2026-10-23', 1260, 100, 72, 5);
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-21', 1150, 67],
      ['2026-10-22', 1200, 70],
      ['2026-10-23', 1260, 72],
    ]);
    expect(store.get(player)?.days.find((d) => d.date === '2026-10-22')?.active).toBe(true);
  });

  it('lets a snapshot day replace a worked out value of the same day', async () => {
    const { store, state, clock, values } = setup(snapshot('2026-10-23', 1260, 100, 72, 5));
    clock.now = at(23, 9);
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-22', 1160, 67],
      ['2026-10-23', 1260, 72],
    ]);
    // a late snapshot of the 22nd, e.g. foestats was a day behind before
    clock.now = at(24, 9);
    state.data = day22;
    await store.view(player);
    expect(values()).toEqual([
      ['2026-10-21', 1150, 67],
      ['2026-10-22', 1200, 70],
      ['2026-10-23', 1260, 72],
    ]);
  });

  it('counts a snapshot without day, points or battles as a player foestats does not know', async () => {
    const { store } = setup({ ...day22, data_date: null });
    await store.view(player);
    expect(store.get(player)).toEqual({ days: [], unreachable: false, unknown: true, loading: false });
  });

  it('asks about a player foestats does not know again on the next foestats day only', async () => {
    const { store, state, fetch, clock } = setup(day22);
    state.missing = true;
    await store.view(player);
    expect(store.get(player)).toEqual({ days: [], unreachable: false, unknown: true, loading: false });

    clock.now = at(23, 5, 39);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.get(player)?.unknown).toBe(true);

    state.missing = false;
    clock.now = at(23, 5, 40);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.get(player)?.unknown).toBe(false);
  });

  it('asks at once about a player whose failed request an older version kept', async () => {
    const { db, store, fetch, clock } = setup(day22);
    await db.db.foestatsFetches.put({ world, player, day: '2026-10-22', at: clock.now, ok: false });
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.get(player)).toMatchObject({ unreachable: false, unknown: false, days: [{}, {}] });
  });

  it('marks the player as loading while foestats is asked, keeping what was known', async () => {
    const { store, state, clock } = setup(day22);
    await store.view(player);
    clock.now = at(23, 9);
    state.data = snapshot('2026-10-23', 1210, 10, 70, 0);
    const pending = store.view(player);
    expect(store.get(player)).toMatchObject({ loading: true, days: [{ date: '2026-10-21' }, { date: '2026-10-22' }] });
    await pending;
    expect(store.get(player)?.loading).toBe(false);
    expect(store.get(player)?.days).toHaveLength(3);
  });

  it('asks once per day and reads the stored days on the next view', async () => {
    const { store, fetch, clock, values } = setup(day22);
    await store.view(player);
    clock.now = at(22, 23);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(values()).toHaveLength(2);
  });

  it('remembers the last request in the database, so a new page does not ask again', async () => {
    const { store, fetch, tab, clock } = setup(day22);
    await store.view(player);
    const reopened = tab();
    clock.now = at(22, 12);
    await reopened.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reopened.get(player)?.days).toHaveLength(2);
  });

  it('waits for the daily update at 05:40 before asking for the next day', async () => {
    const { store, fetch, clock } = setup(day22);
    await store.view(player);
    clock.now = at(23, 5, 39);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.now = at(23, 5, 40);
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('marks foestats unreachable, keeps the known days and tries again only after a while', async () => {
    const { store, state, fetch, clock, values } = setup(day22);
    await store.view(player);
    state.down = true;
    clock.now = at(23, 8);
    await store.view(player);
    expect(store.get(player)?.unreachable).toBe(true);
    expect(values()).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);

    clock.now += RETRY_AFTER - 1;
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.get(player)?.unreachable).toBe(true);

    state.down = false;
    clock.now += 1;
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(store.get(player)?.unreachable).toBe(false);
  });

  it('holds back every player while foestats was unreachable a short while ago', async () => {
    const { store, state, fetch, clock } = setup(day22);
    const other = playerId(4712);
    state.down = true;
    await store.view(player);
    clock.now += RETRY_AFTER - 1;
    await store.view(other);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.get(other)).toEqual({ days: [], unreachable: true, unknown: false, loading: false });

    state.down = false;
    clock.now += 1;
    await store.view(other);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.get(other)?.unreachable).toBe(false);
  });

  it('asks every player again as soon as foestats answers', async () => {
    const { db, store, fetch } = setup(day22);
    const [a, b] = [playerId(1), playerId(2)];
    // two requests out at the same time, the first is refused, the second answered
    expect(await db.foestats.claim(world, a)).toMatchObject({ fetch: true });
    expect(await db.foestats.claim(world, b)).toMatchObject({ fetch: true });
    expect(await db.foestats.store(world, a, 'unreachable')).toEqual({ unreachable: true, unknown: false });
    expect(await db.foestats.claim(world, player)).toEqual({ fetch: false, unreachable: true, unknown: false });
    expect(await db.foestats.store(world, b, 'unknown')).toEqual({ unreachable: false, unknown: true });
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.foestats.claim(world, a)).toEqual({ fetch: true, unreachable: false, unknown: false });
  });

  it('asks only once when two views open the same player together', async () => {
    const { store, fetch } = setup(day22);
    await Promise.all([store.view(player), store.view(player)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks only once when two tabs view the same player together', async () => {
    const { store, tab, fetch } = setup(day22);
    const other = tab();
    await Promise.all([store.view(player), other.view(player)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('frees a claimed request that was never stored after a while', async () => {
    const { db, store, fetch, clock } = setup(day22);
    // a tab claimed the request and closed before it stored the answer
    expect(await db.foestats.claim(world, player)).toEqual({ fetch: true, unreachable: false, unknown: false });
    await store.view(player);
    expect(fetch).not.toHaveBeenCalled();
    clock.now += CLAIM_TIMEOUT;
    await store.view(player);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
