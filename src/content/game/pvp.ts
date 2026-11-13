// Game format → own model for pvp: battles, army window, plunder, incoming attacks and city shields. Nothing outside src/content/game sees the game format.

import { type BuildingDefId, buildingDefId, eraId, type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { BattleResult, BattleSide, CityShield, FoughtBattle, IncomingAttack, Plunder } from '../../shared/model';
import { SECOND_MS } from '../../shared/time';
import type { ArmyBattleKind } from '../core/events';
import type { Ingestion } from '../core/ingestion';
import { logInfo } from '../core/log';
import type { GameHandlerDeps } from './deps';
import { parseEventDate } from './event-date';
import type {
  GameArmyContext,
  GameBattle,
  GameBattleState,
  GameBattleUnit,
  GameCityEntity,
  GameCityProtection,
  GameEntityIcon,
  GameEvent,
  GameEventPage,
  GamePlunderResult,
} from './game-types';
import { list, numbers } from './json';
import { observations } from './players';

/** The buildings the game marks with the Double Loot icon (`showEntityIcons`). */
export function doubledLootIds(data: unknown): number[] {
  return list<GameEntityIcon>(data).flatMap((icon) =>
    icon.type === 'citymap_icon_plunder_and_pillage' && typeof icon.id === 'number' ? [icon.id] : [],
  );
}

const ATTACKER_TEAM = 1;
const DEFENDER_TEAM = 2;

function bonusesOf(units: GameBattleUnit[], team: number): Record<string, number> {
  const bonuses: Record<string, number> = {};
  for (const b of units.find((u) => u.teamFlag === team)?.bonuses ?? []) {
    if (b.type && typeof b.value === 'number') bonuses[b.type] = (bonuses[b.type] ?? 0) + b.value;
  }
  return bonuses;
}

/** units and end hit points from the final state; bonuses from the start, else from the final state */
function toSide(start: GameBattleUnit[], final: GameBattleUnit[], team: number): BattleSide {
  const fromStart = bonusesOf(start, team);
  return {
    bonuses: Object.keys(fromStart).length ? fromStart : bonusesOf(final, team),
    units: final
      .filter((u) => u.teamFlag === team)
      .map((u) => ({
        unitTypeId: u.unitTypeId ?? 'unknown',
        startHp: u.startHitpoints ?? 0,
        endHp: u.currentHitpoints ?? 0,
      })),
  };
}

function resultOf(state: GameBattleState): BattleResult | null {
  if (state.surrenderBit) return 'surrendered';
  if (state.winnerBit === 1) return 'won';
  if (state.winnerBit) return 'lost';
  return null;
}

/** A battle that passed isOwnPvpBattle: the fields it checks are there. */
export type OwnPvpBattle = GameBattle & { battleId: number; defenderPlayerId: number; state: GameBattleState };

/** A PvP battle the session player attacks in, finished or still running. */
export function isOwnPvpBattle(b: GameBattle, me: PlayerId): b is OwnPvpBattle {
  return (
    b.battleType?.type === 'pvp' &&
    b.attackerPlayerId === me &&
    typeof b.battleId === 'number' &&
    typeof b.defenderPlayerId === 'number' &&
    b.state !== undefined
  );
}

/** A response that is a battle state, for example the answer to a move of a manual battle. */
export function isBattleState(data: unknown): data is GameBattleState {
  return typeof data === 'object' && data !== null && (data as GameBattleState).__class__ === 'BattleRealmState';
}

/**
 * A finished PvP battle the session player attacked in; anything else is null. Without `end` the start must carry
 * the result (auto battle). With `end`, the final state of a manual battle, the result comes from there.
 */
export function toBattle(world: WorldId, b: GameBattle, me: PlayerId, end?: GameBattleState): FoughtBattle | null {
  if (!isOwnPvpBattle(b, me)) return null;
  const final = end ?? b.state;
  const result = resultOf(final);
  if (!result) return null;
  return {
    world,
    battleId: b.battleId,
    at: (b.startTime ?? 0) * SECOND_MS,
    opponent: playerId(b.defenderPlayerId),
    result,
    auto: end ? false : b.isAutoBattle === true,
    // the game counts rounds from 0 and omits the field while it is 0
    rounds: (final.round ?? 0) + 1,
    era: eraId(b.battleType?.era ?? ''),
    attacker: toSide(b.state.unitsOrder ?? [], final.unitsOrder ?? [], ATTACKER_TEAM),
    defender: toSide(b.state.unitsOrder ?? [], final.unitsOrder ?? [], DEFENDER_TEAM),
  };
}

/** What the army window is opened for, from the request of getArmyInfo; undefined when the request names no type. */
export function armyBattleKind(request: unknown): ArmyBattleKind | undefined {
  const context = list(request).find(
    (r): r is GameArmyContext => (r as GameArmyContext | null)?.__class__ === 'ArmyContext',
  );
  const type = context?.battleType;
  if (typeof type !== 'string') return undefined;
  return type === 'pvp' ? 'pvp' : type === 'pvp_arena' ? 'pvpArena' : 'other';
}

/** The loot of a successful plunder; other results are unknown and give null. */
export function plunderLoot(data: unknown): Record<string, number> | null {
  const r = data as GamePlunderResult | null;
  return r?.result === 'success' ? numbers(r.product?.product?.resources) : null;
}

/** An entity that passed isPlunderedEntity: the fields it checks are there. */
export type PlunderedEntity = GameCityEntity & { id: number; player_id: number; cityentity_id: string };

/** A building in another player's city that the game reports as just plundered. */
export function isPlunderedEntity(e: GameCityEntity, me: PlayerId): e is PlunderedEntity {
  return (
    e.state?.__class__ === 'PlunderedState' &&
    typeof e.id === 'number' &&
    typeof e.player_id === 'number' &&
    e.player_id !== me &&
    typeof e.cityentity_id === 'string'
  );
}

/** A plunder the opponent's defense repelled; the game sends neither building nor loot with it. */
export const isRepelledPlunder = (data: unknown) => (data as GamePlunderResult | null)?.result === 'repelled';

/** `[playerId, entityId]` the player sends with plunderById */
export function plunderTarget(request: unknown): { opponent: PlayerId; entityId: number } | null {
  if (!Array.isArray(request)) return null;
  const [opponent, entityId] = request;
  return typeof opponent === 'number' && typeof entityId === 'number'
    ? { opponent: playerId(opponent), entityId }
    : null;
}

export const toRepelledPlunder = (
  world: WorldId,
  at: number,
  opponent: PlayerId,
  building?: { entityId: number; def?: BuildingDefId },
): Plunder => ({
  world,
  at,
  opponent,
  outcome: 'repelled',
  ...building,
  resources: {},
  doubleLoot: false,
});

/** The loot comes already doubled with Double Loot. */
export function toPlunder(
  world: WorldId,
  at: number,
  entity: PlunderedEntity,
  resources: Record<string, number>,
  doubleLoot: boolean,
): Plunder {
  return {
    world,
    at,
    opponent: playerId(entity.player_id),
    outcome: 'plundered',
    entityId: entity.id,
    def: buildingDefId(entity.cityentity_id),
    resources,
    doubleLoot,
  };
}

// A battle event tells the result from the attacked player's view. "lost": the defense was broken (seen 2026-10-20,
// the game says "Leider wurde deine Verteidigung durchbrochen"). "won" is assumed to mean the defense held.
const DEFENSE: Record<string, IncomingAttack['defense']> = { lost: 'broken', won: 'held' };

/**
 * An attack on the session player's city from an event; any other event is null. A plunder comes as a
 * social_interaction with interaction_type "plunder" and the building definition as entity_id, next to the lost
 * battle before it (seen 2026-10-26).
 */
export function toIncoming(world: WorldId, e: GameEvent, me: PlayerId, at: number): IncomingAttack | null {
  const attacker = e.other_player?.player_id;
  if (typeof attacker !== 'number' || attacker === me || (e.player_id !== undefined && e.player_id !== me)) return null;
  const base = { world, at, attacker: playerId(attacker) };
  const defense = e.type === 'battle' && e.status ? DEFENSE[e.status] : undefined;
  if (defense && typeof e.battle_id === 'number') return { ...base, kind: 'battle', key: e.battle_id, defense };
  if (e.type === 'social_interaction' && e.interaction_type === 'plunder' && typeof e.id === 'number' && e.entity_id) {
    return { ...base, kind: 'plunder', key: e.id, def: buildingDefId(e.entity_id) };
  }
  return null;
}

/**
 * City shields from getCityProtections. The format is unconfirmed, so entries without a numeric player and end are
 * skipped, as is `expireTime` -1 (cannot be attacked at all, which is no shield).
 */
export function toShields(world: WorldId, data: unknown): CityShield[] {
  return list<GameCityProtection | null>(data).flatMap((e) => {
    const player = e?.playerId;
    const end = e?.expireTime;
    if (typeof player !== 'number' || typeof end !== 'number' || !(end > 0)) return [];
    return [{ world, player: playerId(player), expiresAt: end * SECOND_MS }];
  });
}

/** Registers the pvp handlers. */
export function registerPvp(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, bus, now, session, cities, battles, plunders, incoming, shields } = deps;

  // A manual battle starts without a result. Its result comes with a later BattlefieldService response that is a
  // battle state (seen: submitMove). Only the latest start counts, it is the battle on screen.
  let running: GameBattle | null = null;
  ingestion.on('BattlefieldService', 'startByBattleType', ({ data }) => {
    bus.emit('battle.started', {});
    running = null;
    const me = session.current?.playerId;
    if (me === undefined) return;
    const start = data as GameBattle;
    const battle = toBattle(world, start, me);
    if (battle) battles.record(battle);
    else if (isOwnPvpBattle(start, me)) running = start;
  });
  ingestion.onService('BattlefieldService', ({ method, data }) => {
    const me = session.current?.playerId;
    if (method === 'startByBattleType' || !running || me === undefined || !isBattleState(data)) return;
    const battle = toBattle(world, running, me, data);
    if (!battle) return;
    battles.record(battle);
    running = null;
  });

  // The army window before a battle asks for the army with the battle type in the request. It names no opponent;
  // that comes only with startByBattleType once the battle runs.
  ingestion.on('ArmyUnitManagementService', 'getArmyInfo', ({ request }) => {
    const kind = armyBattleKind(request);
    if (kind) bus.emit('army.opened', { kind });
  });

  // A plunder comes as several entries of one response (seen 2026-10-19): plunderById has the loot, the reset the
  // plundered building with its owner, and showEntityIcons marks the building when Double Loot doubled the loot.
  // The order varies, so they are joined once the response is done. rewardPlunder repeats the loot and is ignored.
  // A repelled plunder (seen 2026-10-20) has no reset and no loot. Opponent and building come from the request
  // (`[playerId, entityId]`), the building definition from the visited city. Without the request only the
  // updatePlayer of the same response names the opponent, so it counts only when that names exactly one player.
  let loot: Record<string, number> | null = null;
  let repelled = false;
  let target: ReturnType<typeof plunderTarget> = null;
  let plundered: PlunderedEntity | undefined;
  const doubled = new Set<number>();
  const updated: PlayerId[] = [];
  ingestion.on('OtherPlayerService', 'plunderById', ({ data, request }) => {
    loot = plunderLoot(data);
    repelled = isRepelledPlunder(data);
    target = plunderTarget(request);
  });
  ingestion.on('OtherPlayerService', 'updatePlayer', ({ data }) => {
    updated.push(...observations(data).map((o) => o.id));
  });
  ingestion.on('CityMapService', 'reset', ({ data }) => {
    const me = session.current?.playerId;
    if (me === undefined || !Array.isArray(data)) return;
    plundered = list<GameCityEntity>(data).find((e): e is PlunderedEntity => isPlunderedEntity(e, me)) ?? plundered;
  });
  ingestion.on('CityMapService', 'showEntityIcons', ({ data }) => {
    for (const id of doubledLootIds(data)) doubled.add(id);
  });
  ingestion.onBatchEnd(() => {
    const tried = target ?? (plundered && { opponent: playerId(plundered.player_id), entityId: plundered.id });
    if ((loot || repelled) && tried) bus.emit('plunder.attempted', tried);
    if (loot && plundered) {
      plunders.record(toPlunder(world, now(), plundered, loot, doubled.has(plundered.id)));
    }
    const me = session.current?.playerId;
    if (repelled && target && target.opponent !== me) {
      const { opponent, entityId } = target;
      const visited = cities.visited();
      const def = visited?.owner === opponent ? visited.buildings.get(entityId)?.def : undefined;
      plunders.record(toRepelledPlunder(world, now(), opponent, { entityId, ...(def && { def }) }));
    } else if (repelled) {
      const [opponent, ...more] = updated;
      if (opponent !== undefined && more.length === 0 && me !== undefined && opponent !== me) {
        plunders.record(toRepelledPlunder(world, now(), opponent));
      }
    }
    loot = null;
    repelled = false;
    target = null;
    plundered = undefined;
    doubled.clear();
    updated.length = 0;
  });

  // Attacks on the own city come live over the websocket (newEvent, one event) and in the event history the player
  // opens (getEventsPaginated, a page of events). The history names its times only as text relative to today.
  // other_player of an event lacks era, score and guild, so it would blank out what the player store knows; skipped.
  const recordIncoming = (events: GameEvent[], at: (e: GameEvent) => number | undefined) => {
    const me = session.current?.playerId;
    if (me === undefined) return;
    for (const e of events) {
      const time = at(e);
      const attack = time === undefined ? null : toIncoming(world, e, me, time);
      if (attack) incoming.record(attack);
    }
  };
  ingestion.on('OtherPlayerService', 'newEvent', ({ data }) => {
    if (data && typeof data === 'object') recordIncoming([data as GameEvent], () => now());
  });
  ingestion.on('OtherPlayerService', 'getEventsPaginated', ({ data }) => {
    const events = (data as GameEventPage | null)?.events;
    if (Array.isArray(events)) recordIncoming(events, (e) => (e.date ? parseEventDate(e.date, now()) : undefined));
  });

  // City shields of other players. Only the old toolbox's concept names this method; assumed: it comes at the start
  // when a neighbour has a shield, and over the websocket when one buys a shield. Ingestion routes both the same way.
  // A start without the list deletes nothing, ended shields are ignored when read.
  ingestion.on('OtherPlayerService', 'getCityProtections', ({ data, via }) => {
    // debt: logs every getCityProtections raw. ceiling: console noise once the format is confirmed.
    // upgrade: remove after the format and the trigger are confirmed in the game.
    logInfo('getCityProtections (format unconfirmed)', via, data);
    shields.record(toShields(world, data));
  });
}
