import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { playerId } from '../src/shared/ids';
import fixture from './fixtures/friend-accept.json';
import { testStores } from './helpers/stores';

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores({ now: () => 1_000_000 });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const { players } = stores;
  const send = (requestClass: string, requestMethod: string, responseData: unknown) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([{ requestClass, requestMethod, responseData }]),
      at: 0,
    });
  const ws = (requestClass: string, requestMethod: string, responseData: unknown) =>
    ingestion.accept({ kind: 'ws', data: JSON.stringify([{ requestClass, requestMethod, responseData }]), at: 0 });
  const social = (friends: unknown[], neighbours: unknown[] = []) =>
    send('OtherPlayerService', 'getSocialList', { friends, neighbours, guildMembers: [] });
  return { players, send, ws, social };
}

const FRIEND = playerId(1001);
const player = (id: number) => ({ player_id: id, name: `P${id}`, era: 'FutureEra', score: 900, rank: 12 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('friend messages', () => {
  it('takes the new friend of an accepted invitation as a whole player with friend set', () => {
    const { players, send } = setup();
    const { requestClass, requestMethod, responseData } = fixture.accept;
    send(requestClass, requestMethod, responseData);
    expect(players.get(FRIEND)).toMatchObject({
      name: 'Neuer Freund',
      cityName: 'Freundesstadt',
      era: 'FutureEra',
      guild: { id: 1, name: 'Testgilde' },
      relations: { neighbor: false, guildMember: false, friend: true },
    });
  });

  it('keeps the score, rank and relations a neighbour had when it becomes a friend', () => {
    const { players, send, social } = setup();
    social([], [player(1001)]);
    send('FriendService', 'acceptInvitation', fixture.accept.responseData);
    expect(players.get(FRIEND)).toMatchObject({
      score: 900,
      rank: 12,
      relations: { neighbor: true, guildMember: false, friend: true },
    });
  });

  it('ignores an accepted invitation that is no friend', () => {
    const { players, send } = setup();
    send('FriendService', 'acceptInvitation', { ...fixture.accept.responseData, is_friend: false });
    send('FriendService', 'acceptInvitation', null);
    expect(players.get(FRIEND)).toBeUndefined();
  });

  it.each([
    ['the player id', 1001],
    ['a list', [1001]],
    ['a player', { player_id: 1001 }],
  ])('takes friend away on a deleted friendship given as %s', (_shape, responseData) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { players, send, social } = setup();
    social([player(1001)], [player(1001)]);
    send('FriendService', 'deleteFriend', responseData);
    expect(players.get(FRIEND)?.relations).toEqual({ neighbor: true, guildMember: false, friend: false });
  });

  it('logs the raw deleteFriend once per message and skips a shape without a player id', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { players, ws, social } = setup();
    social([player(1001)]);
    ws('FriendService', 'deleteFriend', 'gone');
    ws('FriendService', 'deleteFriend', { ok: true });
    expect(players.get(FRIEND)?.relations.friend).toBe(true);
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[0]).toEqual(['[Forge Toolbox]', 'deleteFriend (format unconfirmed)', 'ws', 'gone']);
  });
});
