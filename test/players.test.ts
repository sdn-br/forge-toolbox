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

describe('PlayerStore: time of the marks', () => {
  function clocked(persisted: Player[] = []) {
    let clock = 1000;
    const put = vi.fn(async (_rows: Player[]) => {});
    const store = new PlayerStore(createBus(), { load: async () => persisted, put }, () => clock);
    return {
      store,
      put,
      at: (t: number) => {
        clock = t;
      },
      marksAt: () => store.get(playerId(1))?.marksAt,
    };
  }

  it('is set on every change of the star and the ignore, also when one clears the other', async () => {
    const { store, put, at, marksAt } = clocked();
    store.apply(world, [obs(1)], 'visit');
    expect(marksAt()).toBeUndefined();
    const steps: [number, () => boolean][] = [
      [2000, () => store.setMarked(playerId(1), true)],
      [3000, () => store.setMarked(playerId(1), false)],
      [4000, () => store.setIgnored(playerId(1), true)],
      [5000, () => store.setIgnored(playerId(1), false)],
      [6000, () => store.setIgnored(playerId(1), true)],
      // marking clears the ignore
      [7000, () => store.setMarked(playerId(1), true)],
    ];
    for (const [time, step] of steps) {
      at(time);
      step();
      expect(marksAt()).toBe(time);
    }
    expect(store.get(playerId(1))).not.toHaveProperty('ignored');
    await Promise.resolve();
    expect(put.mock.calls.at(-1)?.[0][0]).toMatchObject({ marked: true, marksAt: 7000 });
    // nothing changes, so the time stays
    at(8000);
    store.setMarked(playerId(1), true);
    expect(marksAt()).toBe(7000);
  });

  it('stays through every other source and every change of relations', () => {
    const { store, at, marksAt } = clocked();
    store.applySocialList(world, { neighbor: [obs(1)], guildMember: [], friend: [] });
    store.setMarked(playerId(1), true);
    at(2000);
    store.apply(world, [obs(1, 'Visited')], 'visit');
    store.applySocialList(world, { neighbor: [], guildMember: [], friend: [obs(1)] });
    store.addFriend(world, obs(1));
    store.removeFriend(world, playerId(1));
    expect(store.get(playerId(1))).toMatchObject({ seenAt: 2000, marked: true });
    expect(marksAt()).toBe(1000);
  });

  it('comes from the database with its flag, and a change this session wins over it', async () => {
    const row = (over: Partial<Player>): Player => ({
      ...obs(1),
      score: 1,
      rank: 1,
      world,
      guild: undefined,
      relations: { neighbor: false, guildMember: false, friend: false },
      firstSeenAt: 1,
      seenAt: 1,
      source: 'visit',
      ...over,
    });
    const loaded = clocked([row({ marked: true, marksAt: 500 })]);
    loaded.store.apply(world, [obs(1)], 'visit');
    await loaded.store.load(world);
    expect(loaded.store.get(playerId(1))).toMatchObject({ marked: true, marksAt: 500 });
    // a star removed earlier leaves only the time, which still counts
    const released = clocked([row({ marksAt: 500 })]);
    released.store.apply(world, [obs(1)], 'visit');
    await released.store.load(world);
    expect(released.marksAt()).toBe(500);
    const changed = clocked([row({ ignored: true, marksAt: 500 })]);
    changed.store.apply(world, [obs(1)], 'visit');
    changed.store.setMarked(playerId(1), true);
    await changed.store.load(world);
    expect(changed.store.get(playerId(1))).toMatchObject({ marked: true, marksAt: 1000 });
  });
});

describe('PlayerStore: owners of great building lists', () => {
  const NONE = { neighbor: false, guildMember: false, friend: false };
  function clocked(persisted: Player[] = []) {
    let clock = 1000;
    const bus = createBus();
    const put = vi.fn(async (_rows: Player[]) => {});
    const store = new PlayerStore(bus, { load: async () => persisted, put }, () => clock);
    const events: unknown[] = [];
    bus.on('player.updated', (e) => events.push(e));
    return {
      store,
      put,
      events,
      at: (t: number) => {
        clock = t;
      },
    };
  }

  it('learns an unknown owner with the name, the avatar and no relation, in one event for the list', async () => {
    const { store, put, events } = clocked();
    store.applyListed(world, [
      { id: playerId(1), name: 'Anna', avatar: 'portrait_1' },
      { id: playerId(2), name: 'Bert' },
    ]);
    expect(store.get(playerId(1))).toEqual({
      world,
      id: playerId(1),
      name: 'Anna',
      avatar: 'portrait_1',
      relations: NONE,
      firstSeenAt: 1000,
      seenAt: 1000,
      source: 'list',
    });
    // the fields a list does not carry stay missing
    expect(store.get(playerId(2))).not.toHaveProperty('avatar');
    expect(store.get(playerId(2))).not.toHaveProperty('cityName');
    expect(store.get(playerId(2))).not.toHaveProperty('score');
    expect(events).toEqual([{ ids: [playerId(1), playerId(2)], source: 'list' }]);
    await Promise.resolve();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('gives a known player only the newest name and a new avatar, never the richer fields, relations, timers or marks', () => {
    const { store, at } = clocked();
    store.applySocialList(world, {
      neighbor: [{ ...obs(1, 'Anna'), avatar: 'portrait_1', attack: { canPlunder: true } }],
      guildMember: [],
      friend: [],
    });
    store.setMarked(playerId(1), true);
    const before = store.get(playerId(1));
    at(2000);
    store.applyListed(world, [{ id: playerId(1), name: 'Anna II' }]);
    expect(store.get(playerId(1))).toEqual({ ...before, name: 'Anna II', seenAt: 2000 });
    store.applyListed(world, [{ id: playerId(1), name: 'Anna II', avatar: 'portrait_2' }]);
    expect(store.get(playerId(1))).toMatchObject({
      avatar: 'portrait_2',
      source: 'socialList',
      relations: before?.relations,
    });
  });

  it('keeps no relation for a learned owner until the social list names them, and the social list still takes it away', () => {
    const { store } = clocked();
    store.applySocialList(world, { neighbor: [], guildMember: [], friend: [obs(1)] });
    store.applyListed(world, [{ id: playerId(1), name: 'P1' }]);
    expect(store.get(playerId(1))?.relations.friend).toBe(true);
    store.applyListed(world, [{ id: playerId(2), name: 'P2' }]);
    store.applySocialList(world, { neighbor: [obs(2)], guildMember: [], friend: [] });
    expect(store.get(playerId(2))).toMatchObject({ relations: { ...NONE, neighbor: true }, source: 'socialList' });
    expect(store.get(playerId(2))?.cityName).toBe('');
  });

  it('saves a known player seen again with the same name without an event', async () => {
    const { store, put, events, at } = clocked();
    store.applyListed(world, [{ id: playerId(1), name: 'Anna' }]);
    await Promise.resolve();
    events.length = 0;
    at(5000);
    store.applyListed(world, [{ id: playerId(1), name: 'Anna' }]);
    expect(events).toEqual([]);
    await Promise.resolve();
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1]?.[0]).toEqual([expect.objectContaining({ id: playerId(1), seenAt: 5000 })]);
  });

  it('takes the database row of an owner learned from a list before the load, with the name and the marks of the session', async () => {
    const stored: Player = {
      ...obs(1, 'Old name'),
      score: 77,
      world,
      guild: undefined,
      relations: { ...NONE, neighbor: true },
      ignored: true,
      marksAt: 10,
      firstSeenAt: 5,
      seenAt: 500,
      source: 'socialList',
    };
    const { store, put } = clocked([stored]);
    store.applyListed(world, [{ id: playerId(1), name: 'New name' }]);
    store.setMarked(playerId(1), true);
    await store.load(world);
    const { ignored: _, ...rest } = stored;
    expect(store.get(playerId(1))).toEqual({ ...rest, name: 'New name', marked: true, marksAt: 1000, seenAt: 1000 });
    await Promise.resolve();
    expect(put.mock.calls.at(-1)?.[0]).toEqual([store.get(playerId(1))]);
  });

  it('loads rows of the old shape and rows learned from a list alike', async () => {
    const lean: Player = {
      world,
      id: playerId(2),
      name: 'B',
      relations: NONE,
      firstSeenAt: 1,
      seenAt: 1,
      source: 'list',
    };
    const { store } = clocked([
      { ...obs(1), world, guild: undefined, relations: NONE, firstSeenAt: 1, seenAt: 1, source: 'visit' } as Player,
      lean,
    ]);
    await store.load(world);
    expect(store.get(playerId(1))?.score).toBe(1);
    expect(store.get(playerId(2))).toEqual(lean);
  });
});

describe('PlayerStore: PvP marks', () => {
  const row = (over: Partial<Player>): Player => ({
    ...obs(1),
    score: 1,
    rank: 1,
    world,
    guild: undefined,
    relations: { neighbor: false, guildMember: false, friend: false },
    firstSeenAt: 1,
    seenAt: 1,
    source: 'visit',
    ...over,
  });

  it('answers undefined for an unknown player and false for a known one without the marks', () => {
    const { store } = setup();
    expect(store.plunderWorthy(playerId(1))).toBeUndefined();
    expect(store.noAttack(playerId(1))).toBeUndefined();
    expect(store.setPlunderWorthy(playerId(1), true)).toBe(false);
    expect(store.setNoAttack(playerId(1), true)).toBe(false);
    store.apply(world, [obs(1)], 'visit');
    expect(store.plunderWorthy(playerId(1))).toBe(false);
    expect(store.noAttack(playerId(1))).toBe(false);
  });

  it('excludes the two marks, keeps the great building marks apart and times them on their own', () => {
    const { store, events } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setMarked(playerId(1), true);
    events.length = 0;
    store.setPlunderWorthy(playerId(1), true);
    expect(store.get(playerId(1))).toMatchObject({
      marked: true,
      marksAt: 1000,
      plunderWorthy: true,
      pvpMarksAt: 1000,
    });
    store.setNoAttack(playerId(1), true);
    const p = store.get(playerId(1));
    expect(p).toMatchObject({ marked: true, noAttack: true });
    expect(p).not.toHaveProperty('plunderWorthy');
    // the clearing mark and the new one each announce themselves
    expect(events.map((e) => (e as { source: string }).source)).toEqual(['plunderWorthy', 'plunderWorthy', 'noAttack']);
    store.setNoAttack(playerId(1), false);
    expect(store.get(playerId(1))).not.toHaveProperty('noAttack');
    expect(store.get(playerId(1))).toMatchObject({ marked: true });
  });

  it('survive every game source and a list', () => {
    const { store } = setup();
    store.apply(world, [obs(1)], 'visit');
    store.setPlunderWorthy(playerId(1), true);
    store.applySocialList(world, { neighbor: [], guildMember: [], friend: [] });
    store.apply(world, [obs(1, 'New')], 'update');
    store.applyListed(world, [{ id: playerId(1), name: 'Listed' }]);
    expect(store.get(playerId(1))).toMatchObject({ name: 'Listed', plunderWorthy: true, pvpMarksAt: 1000 });
  });

  it('come from the database with their time, a mark of this session wins', async () => {
    const kept = setup([row({ noAttack: true, pvpMarksAt: 500 })]);
    kept.store.apply(world, [obs(1)], 'visit');
    await kept.store.load(world);
    expect(kept.store.get(playerId(1))).toMatchObject({ noAttack: true, pvpMarksAt: 500 });
    const changed = setup([row({ noAttack: true, pvpMarksAt: 500 })]);
    changed.store.apply(world, [obs(1)], 'visit');
    changed.store.setPlunderWorthy(playerId(1), true);
    await changed.store.load(world);
    const p = changed.store.get(playerId(1));
    expect(p).toMatchObject({ plunderWorthy: true, pvpMarksAt: 1000 });
    expect(p).not.toHaveProperty('noAttack');
  });

  it('stay with a player known only from a list when the database row arrives', async () => {
    const { store } = setup([row({ noAttack: true, pvpMarksAt: 5, ignored: true, marksAt: 5 })]);
    store.applyListed(world, [{ id: playerId(1), name: 'Listed' }]);
    store.setPlunderWorthy(playerId(1), true);
    await store.load(world);
    expect(store.get(playerId(1))).toMatchObject({ name: 'Listed', plunderWorthy: true, ignored: true, marksAt: 5 });
    expect(store.get(playerId(1))).not.toHaveProperty('noAttack');
  });
});
