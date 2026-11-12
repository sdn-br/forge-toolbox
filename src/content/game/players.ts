// Game format → own model for players: social list, friends, player updates. Nothing outside src/content/game sees the game format.

import { eraId, guildId, type PlayerId, playerId } from '../../shared/ids';
import type { AttackTimer, GuildRef } from '../../shared/model';
import { SECOND_MS } from '../../shared/time';
import type { Ingestion } from '../core/ingestion';
import type { VisitInfo } from '../model/city';
import type { PlayerObservation } from '../model/player';
import type { GameHandlerDeps } from './deps';
import type { GamePlayer, GameSocialList } from './game-types';
import { list } from './json';

function toGuild(p: GamePlayer): GuildRef | null {
  const id = p.clan?.id ?? p.clan_id;
  if (!id) return null;
  return { id: guildId(id), name: p.clan?.name ?? '', flag: p.clan?.flag };
}

export function toObservation(p: GamePlayer): PlayerObservation | null {
  if (typeof p.player_id !== 'number') return null;
  return {
    id: playerId(p.player_id),
    name: p.name ?? '',
    avatar: p.avatar ?? '',
    cityName: p.city_name ?? '',
    era: eraId(p.era ?? ''),
    score: p.score ?? 0,
    rank: p.rank ?? 0,
    active: p.is_active ?? true,
    guild: toGuild(p),
  };
}

/** The new friend of an accepted invitation (recorded 2026-10-20): the whole player with `is_friend`, no score or rank. */
export function toNewFriend(data: unknown): PlayerObservation | null {
  const p = data as GamePlayer | null;
  if (!p || typeof p !== 'object' || p.is_friend !== true) return null;
  const o = toObservation(p);
  if (!o) return null;
  const { score, rank, ...rest } = o;
  return { ...rest, ...(typeof p.score === 'number' && { score }), ...(typeof p.rank === 'number' && { rank }) };
}

/**
 * The player of an own friend invitation, from the answer to `FriendService.invitePlayerById` (recorded 2026-11-03):
 * the player with `isInvitedFriend`, `is_neighbor` and score and rank.
 */
export function toInvitedFriend(data: unknown): { player: PlayerObservation; neighbor: boolean } | null {
  const p = data as GamePlayer | null;
  if (!p || typeof p !== 'object' || p.isInvitedFriend !== true) return null;
  const player = toObservation(p);
  return player && { player, neighbor: p.is_neighbor === true };
}

/** The player of a deleted friendship: the response is the bare player id (recorded 2026-10-25). */
export function toFormerFriend(data: unknown): PlayerId | null {
  return typeof data === 'number' && Number.isInteger(data) && data > 0 ? playerId(data) : null;
}

/**
 * The attack timers of a player that the game sends whole. A missing field means it is not set: after a plunder
 * `canSabotage` is gone (seen 2026-10-21), so the player is no longer plunderable.
 */
function toAttackTimer(p: GamePlayer, now: number): AttackTimer {
  const wait = p.next_interaction_in;
  return {
    canPlunder: p.canSabotage === true,
    ...(typeof wait === 'number' && wait > 0 && { nextInteractionAt: now + wait * SECOND_MS }),
  };
}

/** An observation with the attack timers, for sources that carry the whole player. */
export function toObservationWithAttack(p: GamePlayer, now: number): PlayerObservation | null {
  const o = toObservation(p);
  return o && { ...o, attack: toAttackTimer(p, now) };
}

/** The observations of a list of players; with `now` they carry the attack timers. Players without id are skipped. */
export function toObservations(players: GamePlayer[], now?: number): PlayerObservation[] {
  return players.flatMap((p) => {
    const o = now === undefined ? toObservation(p) : toObservationWithAttack(p, now);
    return o ? [o] : [];
  });
}

/** The visit carries no attack timers (seen 2026-10-21); they come from the player store. */
export function toVisitInfo(p: GamePlayer): VisitInfo {
  return {
    neighbor: p.is_neighbor === true,
    friend: p.is_friend === true,
    guildMember: p.is_guild_member === true,
  };
}

export const observations = (data: unknown) => toObservations(list<GamePlayer>(data));

/** the entries of a list that pass `keep`, as observations */
const observationsWhere = (data: unknown, keep: (p: GamePlayer) => boolean) =>
  toObservations(list<GamePlayer>(data).filter((p) => p && typeof p === 'object' && keep(p)));

/** For sources that carry the whole player: a missing timer field there clears what the store knows. */
const withAttack = (data: unknown, now: number) => toObservations(list<GamePlayer>(data), now);

/** Registers the players handlers. */
export function registerPlayers(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, now, players } = deps;

  // Attack timers come whole with the neighbours (30 of 75 had next_interaction_in, seen 2026-10-21). Friends and
  // guild members cannot be attacked; their entries are taken as without timers and leave them untouched.
  ingestion.on('OtherPlayerService', 'getSocialList', ({ data }) => {
    const d = data as GameSocialList;
    players.applySocialList(world, {
      neighbor: withAttack(d.neighbours, now()),
      guildMember: observations(d.guildMembers),
      // the list of friends holds the own pending invitations too (`isInvitedFriend`, no `is_friend`, recorded
      // 2026-11-03): only `is_friend` makes a friend, an invitation is a flag of its own
      friend: observationsWhere(d.friends, (p) => p.is_friend === true),
      invited: observationsWhere(d.friends, (p) => p.is_friend !== true && p.isInvitedFriend === true),
    });
  });

  // Single friend messages change only `friend`; the social list stays the full truth. An accepted invitation brings
  // the new friend as a whole player (recorded 2026-10-20). A deleted friendship answers with the player id, as only
  // the old toolbox names it.
  ingestion.on('FriendService', 'acceptInvitation', ({ data }) => {
    const friend = toNewFriend(data);
    if (friend) players.addFriend(world, friend);
  });
  ingestion.on('FriendService', 'invitePlayerById', ({ data }) => {
    const invited = toInvitedFriend(data);
    if (invited) players.addInvitation(world, invited.player, invited.neighbor);
  });
  ingestion.on('FriendService', 'deleteFriend', ({ data }) => {
    const id = toFormerFriend(data);
    if (id !== null) players.removeFriend(world, id);
  });
  // comes with battles and other interactions, for example in the same response as the battle against that player.
  // It carries the whole player with the attack timers (seen 2026-10-21: after a battle next_interaction_in 86400 and
  // canSabotage, after the plunder only next_interaction_in), so it also clears them.
  ingestion.on('OtherPlayerService', 'updatePlayer', ({ data }) => {
    players.apply(world, withAttack(data, now()), 'update');
  });
}
