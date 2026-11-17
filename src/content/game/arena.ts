// Game format → own model for the PvP arena: the overview, the log, the own points and the opponents on offer. The
// arena's battles are read with the neighbourhood battles in pvp.ts, since both share the manual battle in progress.

import { eraId, type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { ArenaLogEntry, ArenaOpponent } from '../../shared/model';
import { SECOND_MS } from '../../shared/time';
import type { Ingestion } from '../core/ingestion';
import type { ListedPlayer } from '../model/player';
import type { GameHandlerDeps } from './deps';
import type { GameArenaAction, GameArenaOpponent, GameArenaOverview, GameArenaPlayer } from './game-types';
import { isObject, list, num } from './json';
import { arenaDifficulty } from './pvp';

/** the player the arena names, with what it tells about them: id, name and avatar */
function listed(p: GameArenaPlayer | undefined): ListedPlayer | null {
  const id = num(p?.player?.player_id);
  const name = p?.player?.name;
  if (id === undefined || typeof name !== 'string' || name === '') return null;
  const avatar = p?.player?.avatar;
  return { id: playerId(id), name, ...(typeof avatar === 'string' && avatar !== '' && { avatar }) };
}

/** A line of the arena log; null when a field is missing or of another kind. */
export function toArenaLogEntry(world: WorldId, a: GameArenaAction | null): ArenaLogEntry | null {
  const opponent = num(a?.otherPlayer?.player?.player_id);
  const time = num(a?.time);
  const points = num(a?.rankingPointsChange);
  const kind = a?.type;
  if (opponent === undefined || time === undefined || points === undefined) return null;
  if (kind !== 'attack' && kind !== 'defense') return null;
  return { world, at: time * SECOND_MS, opponent: playerId(opponent), kind, points };
}

/** An opponent on offer; null when a field is missing. */
export function toArenaOpponent(o: GameArenaOpponent | null): ArenaOpponent | null {
  const opponentId = num(o?.opponentId);
  const player = num(o?.opposingPlayer?.player?.player_id);
  const rewardPoints = num(o?.rewardPoints);
  const difficulty = arenaDifficulty(o?.difficulty);
  if (opponentId === undefined || player === undefined || rewardPoints === undefined || !difficulty) return null;
  return {
    opponentId,
    player: playerId(player),
    rewardPoints,
    difficulty,
    era: eraId(typeof o?.era === 'string' ? o.era : ''),
    attackBoost: num(o?.defenseArmyBoosts?.attackBoost) ?? 0,
    defenseBoost: num(o?.defenseArmyBoosts?.defenseBoost) ?? 0,
  };
}

/** the own arena points of a `PVPArenaPlayer` (getOverview's currentPlayer, updatePlayer) */
export const arenaPoints = (p: unknown): number | undefined =>
  isObject(p) ? num((p as GameArenaPlayer).rankingPoints) : undefined;

/** Registers the arena handlers. */
export function registerArena(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, bus, session, players, arena } = deps;

  /** the players other than the session player, to the player store */
  const learn = (named: (GameArenaPlayer | undefined)[]) => {
    const me: PlayerId | undefined = session.current?.playerId;
    const known = named.flatMap((p) => {
      const l = listed(p);
      return l && l.id !== me ? [l] : [];
    });
    if (known.length) players.applyListed(world, known);
  };

  const recordLog = (actions: (GameArenaAction | null)[]) => {
    learn(actions.map((a) => a?.otherPlayer));
    for (const a of actions) {
      const entry = toArenaLogEntry(world, a);
      if (entry) arena.log.record(entry);
    }
  };

  const recordOpponents = (opponents: (GameArenaOpponent | null)[]) => {
    learn(opponents.map((o) => o?.opposingPlayer));
    arena.opponents.replace(opponents.flatMap((o) => toArenaOpponent(o) ?? []));
  };

  const recordPoints = (p: unknown) => {
    const points = arenaPoints(p);
    if (points !== undefined) arena.points.record(points);
  };

  // Opening the arena sends the overview (seen 2026-11-10): own points, the three opponents on offer and the log of
  // about two days, newest first.
  ingestion.on('PVPArenaService', 'getOverview', ({ data }) => {
    if (!isObject(data)) return;
    const overview = data as GameArenaOverview;
    recordPoints(overview.currentPlayer);
    if (Array.isArray(overview.opponents)) recordOpponents(overview.opponents);
    recordLog(list(overview.actions));
    bus.emit('arena.opened', {});
  });
  // Every arena battle comes with addLog (its line), updatePlayer (own points) and updateOpponents (the new draw) in
  // the same response, for an auto battle with the start, for a manual one with the final move.
  ingestion.on('PVPArenaService', 'addLog', ({ data }) => {
    if (isObject(data)) recordLog([data as GameArenaAction]);
  });
  ingestion.on('PVPArenaService', 'updatePlayer', ({ data }) => recordPoints(data));
  ingestion.on('PVPArenaService', 'updateOpponents', ({ data }) => {
    if (Array.isArray(data)) recordOpponents(data);
  });
  // The button "Erneuern" draws three new opponents without a battle (seen 2026-11-17): the opponents in the shape of
  // the overview, with `nextRefreshAt` and a current player without points.
  ingestion.on('PVPArenaService', 'refreshOpponents', ({ data }) => {
    if (isObject(data) && Array.isArray(data.opponents))
      recordOpponents(data.opponents as (GameArenaOpponent | null)[]);
  });
}
