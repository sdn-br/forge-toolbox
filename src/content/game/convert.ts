// Game format → own model. Nothing outside src/content/game sees the game format.
import {
  type BuildingDefId,
  buildingDefId,
  eraId,
  guildId,
  type PlayerId,
  playerId,
  type WorldId,
} from '../../shared/ids';
import type {
  AttackTimer,
  Battle,
  BattleResult,
  BattleSide,
  CityShield,
  GuildRef,
  IncomingAttack,
  Plunder,
} from '../../shared/model';
import type { VisitInfo } from '../stores/cities';
import type { Area, Building, BuildingState, City, Product } from '../stores/city-model';
import type { PlayerObservation } from '../stores/players';
import type { Session } from '../stores/session';
import type {
  GameArmyContext,
  GameBattle,
  GameBattleState,
  GameBattleUnit,
  GameCityEntity,
  GameCityMap,
  GameCityMapArea,
  GameCityProtection,
  GameEvent,
  GamePlayer,
  GamePlunderResult,
  GameProduct,
  GameProductionOption,
  GameResources,
  GameState,
  GameUserData,
} from './game-types';

// In visited cities the game hides all times behind the largest 32 bit integer (seen 2026-10-19).
const HIDDEN = 2147483647;
const seconds = (s: number | undefined) => (typeof s === 'number' && s > 0 && s < HIDDEN ? s * 1000 : undefined);

function resourcesOf(r: GameResources | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (r?.resources && !Array.isArray(r.resources)) {
    for (const [k, v] of Object.entries(r.resources)) if (typeof v === 'number') out[k] = v;
  }
  return out;
}

export function toProduct(p: GameProduct | undefined): Product | undefined {
  if (!p) return undefined;
  if (p.__class__ === 'CityEntityClanGoodsProduct') {
    const guildGoods: Record<string, number> = {};
    for (const g of p.goods ?? []) if (g.good_id && typeof g.value === 'number') guildGoods[g.good_id] = g.value;
    return { resources: {}, guildGoods };
  }
  if (p.__class__ === 'CityEntityMilitaryProduct') {
    return { resources: {}, units: { type: p.name ?? 'unknown', amount: p.amount ?? 0 } };
  }
  return { resources: resourcesOf(p.product) };
}

function productOfOption(o: GameProductionOption | undefined): Product | undefined {
  if (!o?.products) return undefined;
  const resources: Record<string, number> = {};
  const guildGoods: Record<string, number> = {};
  for (const p of o.products) {
    for (const [k, v] of Object.entries(resourcesOf(p.playerResources))) resources[k] = (resources[k] ?? 0) + v;
    for (const [k, v] of Object.entries(resourcesOf(p.guildResources))) guildGoods[k] = (guildGoods[k] ?? 0) + v;
  }
  return Object.keys(guildGoods).length ? { resources, guildGoods } : { resources };
}

function motivated(s: GameState): boolean | undefined {
  return s.socialInteractionId === 'motivate' ? true : s.is_motivated;
}

export function toState(s: GameState | undefined): BuildingState {
  const product = () => toProduct(s?.current_product) ?? productOfOption(s?.productionOption);
  switch (s?.__class__) {
    case 'IdleState':
      return { kind: 'idle' };
    case 'ProducingState':
      return {
        kind: 'producing',
        readyAt: seconds(s.next_state_transition_at),
        product: product(),
        motivated: motivated(s),
        boosted: s.boosted,
      };
    case 'ProductionFinishedState':
      return { kind: 'finished', product: product(), motivated: motivated(s) };
    case 'PlunderedState':
      return { kind: 'plundered' };
    case 'UnconnectedState':
      return { kind: 'unconnected' };
    case 'ConstructionState':
      return { kind: 'constructing', readyAt: seconds(s.next_state_transition_at) };
    default:
      return { kind: 'unknown', gameClass: s?.__class__ ?? 'missing' };
  }
}

export function toBuilding(e: GameCityEntity, owner: PlayerId): Building | null {
  if (typeof e.id !== 'number' || !e.cityentity_id) return null;
  const building: Building = {
    id: e.id,
    owner: typeof e.player_id === 'number' ? playerId(e.player_id) : owner,
    def: buildingDefId(e.cityentity_id),
    type: e.type ?? 'unknown',
    x: e.x ?? 0,
    y: e.y ?? 0,
    level: e.level,
    connected: e.connected !== 0,
    state: toState(e.state),
  };
  if (e.type === 'greatbuilding') {
    building.greatBuilding = {
      level: e.level ?? 0,
      maxLevel: e.max_level ?? 0,
      investedFp: e.state?.invested_forge_points,
      fpForLevelUp: e.state?.forge_points_for_level_up,
      bonus: e.bonus?.type ? { type: e.bonus.type, value: e.bonus.value ?? 0, amount: e.bonus.amount } : undefined,
    };
  }
  return building;
}

function toArea(a: GameCityMapArea): Area | null {
  if (typeof a.width !== 'number' || typeof a.length !== 'number' || a.width <= 0 || a.length <= 0) return null;
  return { x: a.x ?? 0, y: a.y ?? 0, width: a.width, length: a.length };
}

/** `areas` stays undefined when the game sends none, so a map can tell "unknown" from "nothing unlocked". */
export function toAreas(areas: GameCityMapArea[] | undefined): Area[] | undefined {
  if (!Array.isArray(areas)) return undefined;
  return areas.map(toArea).filter((a): a is Area => a !== null);
}

export function toCity(world: WorldId, owner: PlayerId, era: string, map: GameCityMap | undefined, now: number): City {
  const buildings = new Map<number, Building>();
  for (const e of map?.entities ?? []) {
    const b = toBuilding(e, owner);
    if (b) buildings.set(b.id, b);
  }
  const areas = toAreas(map?.unlocked_areas);
  return {
    world,
    owner,
    era: eraId(era),
    map: map?.gridId ?? 'main',
    takenAt: now,
    buildings,
    ...(areas && { areas }),
  };
}

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

/**
 * The attack timers of a player that the game sends whole. A missing field means it is not set: after a plunder
 * `canSabotage` is gone (seen 2026-10-21), so the player is no longer plunderable.
 */
export function toAttackTimer(p: GamePlayer, now: number): AttackTimer {
  const seconds = p.next_interaction_in;
  return {
    canPlunder: p.canSabotage === true,
    ...(typeof seconds === 'number' && seconds > 0 && { nextInteractionAt: now + seconds * 1000 }),
  };
}

/** An observation with the attack timers, for sources that carry the whole player. */
export function toObservationWithAttack(p: GamePlayer, now: number): PlayerObservation | null {
  const o = toObservation(p);
  return o && { ...o, attack: toAttackTimer(p, now) };
}

/** The visit carries no attack timers (seen 2026-10-21); they come from the player store. */
export function toVisitInfo(p: GamePlayer): VisitInfo {
  return {
    neighbor: p.is_neighbor === true,
    friend: p.is_friend === true,
    guildMember: p.is_guild_member === true,
  };
}

export function toSession(world: WorldId, u: GameUserData | undefined): Session | null {
  if (typeof u?.player_id !== 'number') return null;
  return {
    world,
    playerId: playerId(u.player_id),
    name: u.user_name ?? '',
    era: eraId(u.era ?? ''),
    guild: u.clan_id ? { id: guildId(u.clan_id), name: u.clan_name ?? '' } : undefined,
  };
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

/** A PvP battle the session player attacks in, finished or still running. */
export function isOwnPvpBattle(b: GameBattle, me: PlayerId): boolean {
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
export function toBattle(world: WorldId, b: GameBattle, me: PlayerId, end?: GameBattleState): Battle | null {
  if (!isOwnPvpBattle(b, me) || !b.state) return null;
  const final = end ?? b.state;
  const result = resultOf(final);
  if (!result) return null;
  return {
    world,
    battleId: b.battleId as number,
    at: (b.startTime ?? 0) * 1000,
    opponent: playerId(b.defenderPlayerId as number),
    result,
    auto: end ? false : b.isAutoBattle === true,
    // the game counts rounds from 0 and omits the field while it is 0
    rounds: (final.round ?? 0) + 1,
    era: eraId(b.battleType?.era ?? ''),
    attacker: toSide(b.state.unitsOrder ?? [], final.unitsOrder ?? [], ATTACKER_TEAM),
    defender: toSide(b.state.unitsOrder ?? [], final.unitsOrder ?? [], DEFENDER_TEAM),
  };
}

/** The battle type the army window is opened for, from the request of getArmyInfo. */
export function armyBattleType(request: unknown): string | undefined {
  const context = (Array.isArray(request) ? request : []).find(
    (r): r is GameArmyContext => (r as GameArmyContext | null)?.__class__ === 'ArmyContext',
  );
  return typeof context?.battleType === 'string' ? context.battleType : undefined;
}

/** The loot of a successful plunder; other results are unknown and give null. */
export function plunderLoot(data: unknown): Record<string, number> | null {
  const r = data as GamePlunderResult | null;
  return r?.result === 'success' ? resourcesOf(r.product?.product) : null;
}

/** A building in another player's city that the game reports as just plundered. */
export function isPlunderedEntity(e: GameCityEntity, me: PlayerId): boolean {
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
  building?: { entityId: number; cityEntityId?: BuildingDefId },
): Plunder => ({
  world,
  at,
  opponent,
  outcome: 'repelled',
  ...building,
  resources: {},
  doubleLoot: false,
});

/** `entity` must pass isPlunderedEntity. The loot comes already doubled with Double Loot. */
export function toPlunder(
  world: WorldId,
  at: number,
  entity: GameCityEntity,
  resources: Record<string, number>,
  doubleLoot: boolean,
): Plunder {
  return {
    world,
    at,
    opponent: playerId(entity.player_id as number),
    outcome: 'plundered',
    entityId: entity.id as number,
    cityEntityId: buildingDefId(entity.cityentity_id as string),
    resources,
    doubleLoot,
  };
}

// A battle event tells the result from the attacked player's view. "lost": the defense was broken (seen 2026-10-20,
// the game says "Leider wurde deine Verteidigung durchbrochen"). "won" is assumed to mean the defense held.
const DEFENSE: Record<string, IncomingAttack['defense']> = { lost: 'broken', won: 'held' };

/**
 * An attack on the session player's city from an event; any other event is null. Assumption, not yet seen: a plunder
 * comes like a polish of an own building (seen 2026-10-20), as a social_interaction with interaction_type "plunder"
 * and the building definition as entity_id.
 */
export function toIncoming(world: WorldId, e: GameEvent, me: PlayerId, at: number): IncomingAttack | null {
  const attacker = e.other_player?.player_id;
  if (typeof attacker !== 'number' || attacker === me || (e.player_id !== undefined && e.player_id !== me)) return null;
  const base = { world, at, attacker: playerId(attacker) };
  const defense = e.type === 'battle' && e.status ? DEFENSE[e.status] : undefined;
  if (defense && typeof e.battle_id === 'number') return { ...base, kind: 'battle', key: e.battle_id, defense };
  if (e.type === 'social_interaction' && e.interaction_type === 'plunder' && typeof e.id === 'number' && e.entity_id) {
    return { ...base, kind: 'plunder', key: e.id, cityEntityId: buildingDefId(e.entity_id) };
  }
  return null;
}

/**
 * City shields from getCityProtections. The format is unconfirmed, so entries without a numeric player and end are
 * skipped, as is `expireTime` -1 (cannot be attacked at all, which is no shield).
 */
export function toShields(world: WorldId, data: unknown): CityShield[] {
  return (Array.isArray(data) ? data : []).flatMap((e: GameCityProtection | null) => {
    const player = e?.playerId;
    const end = e?.expireTime;
    if (typeof player !== 'number' || typeof end !== 'number' || !(end > 0)) return [];
    return [{ world, player: playerId(player), expiresAt: end * 1000 }];
  });
}
