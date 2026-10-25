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
