import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { type PlayerObservation, PlayerStore } from '../src/content/stores/players';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Player } from '../src/shared/model';

const world = worldId('de20');
const obs = (id: number, name = `P${id}`): PlayerObservation => ({
  id: playerId(id),
  name,
  avatar: '',
  cityName: '',
  era: eraId('IronAge'),
  score: 1,
  rank: 1,
  active: true,
  guild: null,
});

function setup(persisted: Player[] = []) {
  const bus = createBus();
  const put = vi.fn(async (_rows: Player[]) => {});
  const store = new PlayerStore(bus, { load: async () => persisted, put }, () => 1000);
  const events: unknown[] = [];
  bus.on('player.updated', (e) => events.push(e));
  return { store, put, events };
}

describe('PlayerStore', () => {
  it('sets relations from the social list and emits one event for all players', () => {
    const { store, events } = setup();
    store.applySocialList(world, { neighbor: [obs(1), obs(2)], guildMember: [obs(2)], friend: [] });
    expect(store.get(playerId(2))?.relations).toEqual({ neighbor: true, guildMember: true, friend: false });
    expect(store.list({ relation: 'neighbor' })).toHaveLength(2);
    expect(events).toEqual([{ ids: [playerId(1), playerId(2)], source: 'socialList' }]);
  });

  it('drops relations of players missing from a new social list', () => {
    const { store } = setup();
    store.applySocialList(world, { neighbor: [obs(1), obs(2)], guildMember: [], friend: [] });
    store.applySocialList(world, { neighbor: [obs(2)], guildMember: [], friend: [] });
    expect(store.get(playerId(1))?.relations.neighbor).toBe(false);
    expect(store.get(playerId(2))?.relations.neighbor).toBe(true);
  });

  it('updates fields from a visit without changing relations', () => {
    const { store } = setup();
    store.applySocialList(world, { neighbor: [obs(1)], guildMember: [], friend: [] });
    store.apply(world, [obs(1, 'Renamed')], 'visit');
    const p = store.get(playerId(1));
    expect(p?.name).toBe('Renamed');
    expect(p?.relations.neighbor).toBe(true);
    expect(p?.source).toBe('visit');
  });

  it('writes changed players in one batch', async () => {
    const { store, put } = setup();
    store.apply(world, [obs(1), obs(2)], 'visit');
    await Promise.resolve();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0].map((p) => p.id)).toEqual([1, 2]);
  });

  it('keeps live data over persisted data when loading late', async () => {
    const old: Player = {
      ...obs(1, 'Old'),
      score: 1,
      rank: 1,
      world,
      guild: undefined,
      relations: { neighbor: true, guildMember: false, friend: false },
      firstSeenAt: 1,
      seenAt: 1,
      source: 'socialList',
    };
    const { store } = setup([old, { ...old, id: playerId(9), name: 'Only persisted' }]);
    store.apply(world, [obs(1, 'New')], 'visit');
    await store.load(world);
    expect(store.get(playerId(1))?.name).toBe('New');
    expect(store.get(playerId(9))?.name).toBe('Only persisted');
  });

  it('sets friend from an accepted invitation, keeps the other relations and what the message lacks', () => {
    const { store, events } = setup();
    store.applySocialList(world, { neighbor: [{ ...obs(1), score: 500, rank: 7 }], guildMember: [], friend: [] });
    const { score: _score, rank: _rank, ...friend } = obs(1, 'Friend');
    store.addFriend(world, friend);
    expect(store.get(playerId(1))).toMatchObject({
      name: 'Friend',
      score: 500,
      rank: 7,
      relations: { neighbor: true, guildMember: false, friend: true },
      source: 'friend',
    });
    expect(events.at(-1)).toEqual({ ids: [playerId(1)], source: 'friend' });
  });

  it('takes only friend away on a deleted friendship and ignores players it does not know', () => {
    const { store, events } = setup();
    store.applySocialList(world, { neighbor: [], guildMember: [obs(1)], friend: [obs(1)] });
    store.removeFriend(world, playerId(1));
    expect(store.get(playerId(1))?.relations).toEqual({ neighbor: false, guildMember: true, friend: false });
    expect(events.at(-1)).toEqual({ ids: [playerId(1)], source: 'friend' });
    const before = events.length;
    store.removeFriend(world, playerId(1));
    store.removeFriend(world, playerId(9));
    expect(store.get(playerId(9))).toBeUndefined();
    expect(events).toHaveLength(before);
  });
});

describe('PlayerStore: marks', () => {
  it('marks a known player, saves it and tells the bus; unmarking removes the field', async () => {
    const { store, put, events } = setup();
    store.apply(world, [obs(1)], 'visit');
    await Promise.resolve();
    put.mockClear();
    expect(store.setMarked(playerId(1), true)).toBe(true);
    expect(store.get(playerId(1))?.marked).toBe(true);
    // the data came from a visit and stay that way
    expect(store.get(playerId(1))?.source).toBe('visit');
    expect(events.at(-1)).toEqual({ ids: [playerId(1)], source: 'mark' });
    await Promise.resolve();
    expect(put.mock.calls[0]?.[0][0]).toMatchObject({ id: 1, marked: true });
    expect(store.setMarked(playerId(1), false)).toBe(true);
    expect(store.get(playerId(1))).not.toHaveProperty('marked');
    await Promise.resolve();
    expect(put.mock.calls[1]?.[0][0]).not.toHaveProperty('marked');
  });

  it('does not mark a player the store does not know', () => {
    const { store, events } = setup();
    expect(store.setMarked(playerId(9), true)).toBe(false);
    expect(store.get(playerId(9))).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('tells nothing when the mark does not change', () => {
    const { store, events } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setMarked(playerId(1), true);
    const before = events.length;
    store.setMarked(playerId(1), true);
    store.setMarked(playerId(2), false);
    expect(events).toHaveLength(before);
  });

  it('keeps the mark through every other source and every change of relations', () => {
    const { store } = setup();
    store.applySocialList(world, { neighbor: [obs(1)], guildMember: [], friend: [] });
    store.setMarked(playerId(1), true);
    store.apply(world, [obs(1, 'Visited')], 'visit');
    expect(store.get(playerId(1))).toMatchObject({ name: 'Visited', marked: true });
    store.applySocialList(world, { neighbor: [obs(1)], guildMember: [], friend: [obs(1, 'Social')] });
    expect(store.get(playerId(1))?.marked).toBe(true);
    const { score: _score, rank: _rank, ...friend } = obs(1, 'Friend');
    store.addFriend(world, friend);
    expect(store.get(playerId(1))?.marked).toBe(true);
    store.removeFriend(world, playerId(1));
    expect(store.get(playerId(1))?.marked).toBe(true);
    // the player left the neighbourhood, friends and guild: gone from the social list, still marked
    store.applySocialList(world, { neighbor: [], guildMember: [], friend: [] });
    expect(store.get(playerId(1))).toMatchObject({
      relations: { neighbor: false, guildMember: false, friend: false },
      marked: true,
    });
  });

  it('reads the marks of the database', async () => {
    const old: Player = {
      ...obs(1, 'Old'),
      score: 1,
      rank: 1,
      world,
      guild: undefined,
      relations: { neighbor: false, guildMember: false, friend: false },
      marked: true,
      firstSeenAt: 1,
      seenAt: 1,
      source: 'socialList',
    };
    const { store } = setup([old]);
    await store.load(world);
    expect(store.get(playerId(1))?.marked).toBe(true);
  });

  it('keeps the persisted mark of a player the game reported before the load finished', async () => {
    const old: Player = {
      ...obs(1, 'Old'),
      score: 1,
      rank: 1,
      world,
      guild: undefined,
      relations: { neighbor: true, guildMember: false, friend: false },
      marked: true,
      firstSeenAt: 1,
      seenAt: 1,
      source: 'socialList',
    };
    const { store, put } = setup([old]);
    store.apply(world, [obs(1, 'New')], 'visit');
    await Promise.resolve();
    // the row of the visit went to the database without the mark; the load writes it back
    expect(put.mock.calls[0]?.[0][0]).not.toHaveProperty('marked');
    await store.load(world);
    expect(store.get(playerId(1))).toMatchObject({ name: 'New', marked: true });
    await Promise.resolve();
    expect(put.mock.calls.at(-1)?.[0][0]).toMatchObject({ id: 1, marked: true });
  });

  it('keeps a mark set while the load runs', async () => {
    const old: Player = {
      ...obs(1, 'Old'),
      score: 1,
      rank: 1,
      world,
      guild: undefined,
      relations: { neighbor: true, guildMember: false, friend: false },
      firstSeenAt: 1,
      seenAt: 1,
      source: 'socialList',
    };
    const { store } = setup([old]);
    store.apply(world, [obs(1, 'New')], 'visit');
    store.setMarked(playerId(1), true);
    await store.load(world);
    expect(store.get(playerId(1))?.marked).toBe(true);
  });
});

describe('PlayerStore: ignores', () => {
  const persistedPlayer = (over: Partial<Player> = {}): Player => ({
    ...obs(1, 'Old'),
    score: 1,
    rank: 1,
    world,
    guild: undefined,
    relations: { neighbor: true, guildMember: false, friend: false },
    firstSeenAt: 1,
    seenAt: 1,
    source: 'socialList',
    ...over,
  });

  it('ignores a known player, saves it and tells the bus; releasing removes the field', async () => {
    const { store, put, events } = setup();
    store.apply(world, [obs(1)], 'visit');
    await Promise.resolve();
    put.mockClear();
    expect(store.setIgnored(playerId(1), true)).toBe(true);
    expect(store.get(playerId(1))?.ignored).toBe(true);
    expect(store.get(playerId(1))?.source).toBe('visit');
    expect(events.at(-1)).toEqual({ ids: [playerId(1)], source: 'ignore' });
    await Promise.resolve();
    expect(put.mock.calls[0]?.[0][0]).toMatchObject({ id: 1, ignored: true });
    expect(store.setIgnored(playerId(1), false)).toBe(true);
    expect(store.get(playerId(1))).not.toHaveProperty('ignored');
    await Promise.resolve();
    expect(put.mock.calls[1]?.[0][0]).not.toHaveProperty('ignored');
  });

  it('does not ignore a player the store does not know, and stays quiet when nothing changes', () => {
    const { store, events } = setup();
    expect(store.setIgnored(playerId(9), true)).toBe(false);
    store.apply(world, [obs(1)], 'visit');
    store.setIgnored(playerId(1), false);
    expect(events).toEqual([{ ids: [playerId(1)], source: 'visit' }]);
  });

  it('clears the star when ignoring and tells the bus about both flags', async () => {
    const { store, events, put } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setMarked(playerId(1), true);
    events.length = 0;
    store.setIgnored(playerId(1), true);
    expect(store.get(playerId(1))).toMatchObject({ ignored: true });
    expect(store.get(playerId(1))).not.toHaveProperty('marked');
    expect(events).toEqual([
      { ids: [playerId(1)], source: 'mark' },
      { ids: [playerId(1)], source: 'ignore' },
    ]);
    await Promise.resolve();
    expect(put.mock.calls.at(-1)?.[0][0]).not.toHaveProperty('marked');
    expect(put.mock.calls.at(-1)?.[0][0]).toMatchObject({ ignored: true });
  });

  it('clears the ignore when marking and tells the bus about both flags', () => {
    const { store, events } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setIgnored(playerId(1), true);
    events.length = 0;
    store.setMarked(playerId(1), true);
    expect(store.get(playerId(1))).toMatchObject({ marked: true });
    expect(store.get(playerId(1))).not.toHaveProperty('ignored');
    expect(events).toEqual([
      { ids: [playerId(1)], source: 'ignore' },
      { ids: [playerId(1)], source: 'mark' },
    ]);
  });

  it('keeps the other flag when a flag is only released', () => {
    const { store } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setIgnored(playerId(1), true);
    store.setMarked(playerId(1), false);
    expect(store.get(playerId(1))?.ignored).toBe(true);
  });

  it('lets the choice of this session win over the other flag the database holds', async () => {
    const { store } = setup([persistedPlayer({ ignored: true })]);
    store.apply(world, [obs(1)], 'visit');
    store.setMarked(playerId(1), true);
    await store.load(world);
    expect(store.get(playerId(1))).toMatchObject({ marked: true });
    expect(store.get(playerId(1))).not.toHaveProperty('ignored');
    const other = setup([persistedPlayer({ marked: true })]);
    other.store.apply(world, [obs(1)], 'visit');
    other.store.setIgnored(playerId(1), true);
    await other.store.load(world);
    expect(other.store.get(playerId(1))).toMatchObject({ ignored: true });
    expect(other.store.get(playerId(1))).not.toHaveProperty('marked');
  });

  it('survives every source and the loss of every relation', () => {
    const { store } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setIgnored(playerId(1), true);
    store.apply(world, [obs(1, 'Renamed')], 'update');
    expect(store.get(playerId(1))).toMatchObject({ name: 'Renamed', ignored: true });
    store.applySocialList(world, { neighbor: [obs(1)], guildMember: [], friend: [] });
    expect(store.get(playerId(1))?.ignored).toBe(true);
    store.addFriend(world, obs(1));
    expect(store.get(playerId(1))?.ignored).toBe(true);
    store.removeFriend(world, playerId(1));
    expect(store.get(playerId(1))?.ignored).toBe(true);
    store.applySocialList(world, { neighbor: [], guildMember: [], friend: [] });
    expect(store.get(playerId(1))).toMatchObject({
      relations: { neighbor: false, guildMember: false, friend: false },
      ignored: true,
    });
  });

  it('reads the ignores of the database', async () => {
    const { store } = setup([persistedPlayer({ ignored: true })]);
    await store.load(world);
    expect(store.get(playerId(1))?.ignored).toBe(true);
  });

  it('keeps the persisted ignore of a player the game reported before the load finished', async () => {
    const { store, put } = setup([persistedPlayer({ ignored: true })]);
    store.apply(world, [obs(1, 'New')], 'visit');
    await Promise.resolve();
    expect(put.mock.calls[0]?.[0][0]).not.toHaveProperty('ignored');
    await store.load(world);
    expect(store.get(playerId(1))).toMatchObject({ name: 'New', ignored: true });
    await Promise.resolve();
    expect(put.mock.calls.at(-1)?.[0][0]).toMatchObject({ id: 1, ignored: true });
  });
});
