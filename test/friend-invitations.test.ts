import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import type { CityAssessment } from '../src/content/domain/assess-city';
import { sabotageViewModel } from '../src/content/features/sabotage/view-model';
import { registerGameHandlers } from '../src/content/game/handlers';
import { CatalogStore } from '../src/content/stores/catalog';
import type { VisitedCity } from '../src/content/stores/cities';
import { eraId, playerId, worldId } from '../src/shared/ids';
import fixture from './fixtures/friend-invitations.json';
import { playerLookups } from './helpers/player-lookups';
import { testStores } from './helpers/stores';

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores({ now: () => 1_000_000 });
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const send = (e: { requestClass: string; requestMethod: string; responseData: unknown }) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([e]),
      at: 0,
    });
  const social = (friends: unknown[], neighbours: unknown[] = []) =>
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getSocialList',
      responseData: { friends, neighbours, guildMembers: [] },
    });
  return { players: stores.players, send, social, world };
}

const SELF = playerId(1000);
const FRIEND = playerId(1001);
const NEIGHBOUR = playerId(1002);
const STRANGER = playerId(1003);
const INVITED_LATER = playerId(1004);
const { friends, neighbours } = fixture.socialList.responseData;

describe('friend invitations in the social list', () => {
  it('takes only is_friend entries as friends and flags the pending invitations', () => {
    const { players, social } = setup();
    social(friends, neighbours);
    expect(players.get(FRIEND)).toMatchObject({ relations: { friend: true, neighbor: false } });
    expect(players.get(FRIEND)?.friendInvited).toBeUndefined();
    // the own player stays a friend, as before
    expect(players.get(SELF)?.relations).toEqual({ neighbor: false, guildMember: false, friend: true });
    // an invited neighbour stays a neighbour and is no friend
    expect(players.get(NEIGHBOUR)).toMatchObject({
      friendInvited: true,
      relations: { friend: false, neighbor: true, guildMember: false },
    });
    // an invited player who is no neighbour has no relation at all
    expect(players.get(STRANGER)).toMatchObject({
      friendInvited: true,
      relations: { friend: false, neighbor: false, guildMember: false },
    });
    expect(players.list({ relation: 'friend' }).map((p) => p.id)).toEqual([SELF, FRIEND]);
  });

  it('clears the invitation when the list no longer has it, and when the player became a friend', () => {
    const { players, social } = setup();
    social(friends, neighbours);
    const accepted = { ...friends[2], is_friend: true, isInvitedFriend: undefined, accepted: true, activity: 2 };
    social([friends[0], friends[1], accepted], neighbours);
    expect(players.get(NEIGHBOUR)?.friendInvited).toBeUndefined();
    expect(players.get(NEIGHBOUR)?.relations.friend).toBe(true);
    expect(players.get(STRANGER)?.friendInvited).toBeUndefined();
    expect(players.get(STRANGER)?.relations.friend).toBe(false);
  });

  it('heals a player stored as friend only because of an invitation', () => {
    const { players, social, world } = setup();
    // before the fix every entry of the friend list was a friend
    players.applySocialList(world, {
      neighbor: [],
      guildMember: [],
      friend: [{ id: STRANGER, name: 'x', avatar: '', cityName: '', era: eraId(''), active: true, guild: null }],
    });
    expect(players.get(STRANGER)?.relations.friend).toBe(true);
    social(friends, neighbours);
    expect(players.get(STRANGER)).toMatchObject({ friendInvited: true, relations: { friend: false } });
  });
});

describe('FriendService.invitePlayerById', () => {
  it('flags the player at once and brings the player data', () => {
    const { players, send } = setup();
    send(fixture.invite);
    expect(players.get(INVITED_LATER)).toMatchObject({
      name: 'Anderer Nachbar',
      score: 100,
      guild: { id: 1, name: 'Testgilde' },
      friendInvited: true,
      relations: { neighbor: true, friend: false, guildMember: false },
    });
  });

  it('is cleared by the acceptance and kept by other sightings', () => {
    const { players, send, social } = setup();
    send(fixture.invite);
    players.apply(
      worldId('de10'),
      [{ id: INVITED_LATER, name: 'Neu', avatar: '', cityName: '', era: eraId(''), active: true, guild: null }],
      'visit',
    );
    expect(players.get(INVITED_LATER)?.friendInvited).toBe(true);
    send({
      requestClass: 'FriendService',
      requestMethod: 'acceptInvitation',
      responseData: { ...fixture.invite.responseData, isInvitedFriend: undefined, is_friend: true },
    });
    expect(players.get(INVITED_LATER)?.friendInvited).toBeUndefined();
    expect(players.get(INVITED_LATER)?.relations).toMatchObject({ friend: true, neighbor: true });
    social([]);
    expect(players.get(INVITED_LATER)?.friendInvited).toBeUndefined();
  });

  it('ignores an answer that is no invitation', () => {
    const { players, send } = setup();
    send({ ...fixture.invite, responseData: { ...fixture.invite.responseData, isInvitedFriend: false } });
    send({ ...fixture.invite, responseData: null });
    expect(players.get(INVITED_LATER)).toBeUndefined();
  });

  it('is removed by a social list that does not name it', () => {
    const { players, send, social } = setup();
    send(fixture.invite);
    social([]);
    expect(players.get(INVITED_LATER)?.friendInvited).toBeUndefined();
  });
});

describe('attack status of an invited neighbour', () => {
  it('is attackable, not "friend"', () => {
    const { players, social } = setup();
    social(friends, neighbours);
    const city: VisitedCity = {
      world: worldId('de10'),
      owner: NEIGHBOUR,
      era: eraId('VirtualFuture'),
      map: 'main',
      takenAt: 0,
      buildings: new Map(),
      // the visit of a pending invitation: neighbour, no is_friend
      visit: { neighbor: true, friend: false, guildMember: false },
    };
    const assessment: CityAssessment = {
      army: { attacker: { attack: 1, defense: 1 }, defender: { attack: 1, defense: 1 } },
      plunderRepel: 0,
      plunderable: [],
      missingDefs: [],
      boostTotals: {},
    };
    const vm = (id: typeof NEIGHBOUR) =>
      sabotageViewModel({
        city: { ...city, owner: id },
        player: players.get(id),
        lookups: playerLookups({ friendInvited: (p) => players.get(p)?.friendInvited === true }),
        assessment,
        catalog: new CatalogStore(createBus()),
        showArmy: false,
        now: 0,
        record: {},
      } as never);
    expect(vm(NEIGHBOUR).attack.kind).toBe('attackable');
    expect(vm(NEIGHBOUR).lootable).toBe(true);
    expect(vm(NEIGHBOUR).player.friendInvited).toBe(true);
    // a real friend still is not attackable
    expect(vm(FRIEND).attack.kind).toBe('friend');
    expect(vm(FRIEND).player.friendInvited).toBeUndefined();
  });
});
