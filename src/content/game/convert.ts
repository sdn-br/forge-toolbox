// Game format → own model. Nothing outside src/content/game sees the game format.

import type { GreatBuildingListRow } from '../../persistence/great-buildings/contract';
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
import type { LimitedBonus } from '../domain/gb-calculator';
import type { CityGrid } from '../stores/catalog';
import type { VisitInfo } from '../stores/cities';
import type { Area, Building, BuildingState, City, ExpansionOffer, Product } from '../stores/city-model';
import type { GreatBuildingEntity, PlaceReward, RankingRow } from '../stores/great-building-model';
import type { InventoryItem, ItemPayload } from '../stores/inventory';
import type { PlayerObservation } from '../stores/players';
import type { ResearchExpansion } from '../stores/research';
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
  GameGreatBuildingConstruction,
  GameGreatBuildingListRow,
  GameGreatBuildingName,
  GameGreatBuildingRankingRow,
  GameGreatBuildingReward,
  GameGrid,
  GameInventoryItem,
  GameLimitedBonus,
  GamePlayer,
  GamePlunderResult,
  GameProduct,
  GameProductionOption,
  GameResearchProgress,
  GameResearchTechnology,
  GameResources,
  GameState,
  GameTileset,
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

function toProduct(p: GameProduct | undefined): Product | undefined {
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

function toState(s: GameState | undefined): BuildingState {
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
function toAreas(areas: GameCityMapArea[] | undefined): Area[] | undefined {
  if (!Array.isArray(areas)) return undefined;
  return areas.map(toArea).filter((a): a is Area => a !== null);
}

/** Blocked areas come as bare positions of 4 × 4 blocks, x and y left out when 0 (seen 2026-10-21). */
function toBlockedAreas(positions: { x?: number; y?: number }[] | undefined): Area[] | undefined {
  if (!Array.isArray(positions)) return undefined;
  return positions.map((p) => ({ x: p?.x ?? 0, y: p?.y ?? 0, width: 4, length: 4 }));
}

export function toCity(world: WorldId, owner: PlayerId, era: string, map: GameCityMap | undefined, now: number): City {
  const buildings = new Map<number, Building>();
  for (const e of map?.entities ?? []) {
    const b = toBuilding(e, owner);
    if (b) buildings.set(b.id, b);
  }
  const areas = toAreas(map?.unlocked_areas);
  const blocked = toBlockedAreas(map?.blocked_areas);
  const expansions = Array.isArray(map?.tilesets) ? toExpansionOffers(map.tilesets) : undefined;
  return {
    world,
    owner,
    era: eraId(era),
    map: map?.gridId ?? 'main',
    takenAt: now,
    buildings,
    ...(areas && { areas }),
    ...(blocked && { blocked }),
    ...(expansions && { expansions }),
  };
}

const numbers = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  }
  return out;
};

function toExpansionOffers(tilesets: GameTileset[]): ExpansionOffer[] {
  return tilesets.flatMap((t) => {
    if (typeof t?.type !== 'string') return [];
    const cost = numbers((t.requirements?.cost ?? t.cost)?.resources);
    const minEra = t.requirements?.min_era;
    return [{ kind: t.type, ...(minEra && { minEra: eraId(minEra) }), cost }];
  });
}

/** The resource bag of the player, `{ resources: { resources: { money: … } } }` (seen 2026-10-21); null when it is not one. */
export function toResourceBag(data: unknown): Record<string, number> | null {
  const bag = data as { type?: { value?: unknown }; resources?: { resources?: unknown } } | null;
  // other bag types (seen only PlayerMain) belong to other stocks, not the player's
  const type = bag?.type?.value;
  if (type !== undefined && type !== 'PlayerMain') return null;
  const resources = bag?.resources?.resources;
  return resources && typeof resources === 'object' && !Array.isArray(resources) ? numbers(resources) : null;
}

/** ResourceService.getPlayerResources (not recorded yet): `{ resources: { money, strategy_points, … } }`, the full stock */
export function toPlayerResources(data: unknown): Record<string, number> | null {
  const resources = (data as { resources?: unknown } | null)?.resources;
  return resources && typeof resources === 'object' && !Array.isArray(resources) ? numbers(resources) : null;
}

/**
 * The technologies of the metadata file `research-<hash>` that reward main city expansions, in the order of the file.
 * Only `type: 'expansion'` with `subType: 'main'` counts; outposts and other cities have their own types.
 */
export function toResearchExpansions(json: unknown): ResearchExpansion[] {
  return (Array.isArray(json) ? (json as GameResearchTechnology[]) : []).flatMap((tech) => {
    if (typeof tech?.id !== 'string') return [];
    const amount = (tech.rewards ?? [])
      .filter((r) => r?.type === 'expansion' && r.subType === 'main' && typeof r.amount === 'number')
      .reduce((sum, r) => sum + (r.amount as number), 0);
    return amount > 0 ? [{ tech: tech.id, name: tech.name ?? tech.id, amount }] : [];
  });
}

/** The unlocked technologies from ResearchService.getProgress; null when the response is no progress object. */
export function toUnlockedNodes(data: unknown): string[] | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const nodes = (data as GameResearchProgress).unlockedNodes;
  return Array.isArray(nodes) ? nodes.filter((n): n is string => typeof n === 'string') : null;
}

/** The main grid of the metadata file `grid-<hash>`, its blocks from the sectors of type `Regular`. */
export function toCityGrid(json: unknown): CityGrid | null {
  const grid = (Array.isArray(json) ? (json as GameGrid[]) : []).find((g) => g?.id === 'main');
  if (!grid) return null;
  const blocks = (grid.sectors ?? [])
    .filter((s) => s?.type?.value === 'Regular')
    .flatMap((s) => (s.tilePositions ?? []).map((p) => ({ x: p?.x ?? 0, y: p?.y ?? 0 })));
  return { width: grid.width ?? 0, height: grid.height ?? 0, blocks };
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

/** The new friend of an accepted invitation (recorded 2026-10-20): the whole player with `is_friend`, no score or rank. */
export function toNewFriend(data: unknown): PlayerObservation | null {
  const p = data as GamePlayer | null;
  if (!p || typeof p !== 'object' || p.is_friend !== true) return null;
  const o = toObservation(p);
  if (!o) return null;
  const { score, rank, ...rest } = o;
  return { ...rest, ...(typeof p.score === 'number' && { score }), ...(typeof p.rank === 'number' && { rank }) };
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

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function toPlaceReward(r: GameGreatBuildingReward | undefined): PlaceReward | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const pieces = (r.blueprintRewards ?? []).reduce((sum, b) => sum + (num(b?.amount) ?? 0), 0);
  return {
    fp: num(r.strategy_point_amount) ?? 0,
    blueprints: num(r.blueprints) ?? pieces,
    medals: num(r.resources?.medals) ?? 0,
  };
}

/** The ranking rows of a construction, in the order the game sends them; null when `data` is no list. */
export function toRankingRows(data: unknown): RankingRow[] | null {
  if (!Array.isArray(data)) return null;
  return data.flatMap((r: GameGreatBuildingRankingRow | null) => {
    if (!r || typeof r !== 'object') return [];
    const id = num(r.player?.player_id);
    const rank = num(r.rank);
    const fp = num(r.forge_points);
    const reward = toPlaceReward(r.reward);
    const row: RankingRow = { name: r.player?.name ?? '', self: r.player?.is_self === true };
    if (rank !== undefined) row.rank = rank;
    if (id !== undefined) row.player = playerId(id);
    if (fp !== undefined) row.fp = fp;
    if (reward) row.reward = reward;
    return [row];
  });
}

/** The production of the next level from `getConstruction`; undefined when the answer has none. */
export function toNextProduction(data: GameGreatBuildingConstruction | null | undefined) {
  const bonus = data?.next_production_bonus;
  const value = num(bonus?.value);
  return typeof bonus?.type === 'string' && value !== undefined ? { type: bonus.type, value } : undefined;
}

/**
 * A great building from a city entity, for example `OtherPlayerService.getOtherPlayerCityMapEntity`. The game leaves
 * out fields that are 0 (seen: `y`, `invested_forge_points`), so a missing `connected` means not connected.
 */
export function toGreatBuildingEntity(e: GameCityEntity | null | undefined): GreatBuildingEntity | null {
  const id = num(e?.id);
  const owner = num(e?.player_id);
  if (e?.type !== 'greatbuilding' || id === undefined || owner === undefined || !e.cityentity_id) return null;
  return {
    owner: playerId(owner),
    entityId: id,
    def: buildingDefId(e.cityentity_id),
    level: num(e.level) ?? 0,
    maxLevel: num(e.max_level) ?? 0,
    invested: num(e.state?.invested_forge_points) ?? 0,
    required: num(e.state?.forge_points_for_level_up) ?? 0,
    connected: (num(e.connected) ?? 0) > 0,
  };
}

/** A great building of a known city, for constructions that come without an opening (the own ones). */
export function greatBuildingOf(b: Building | undefined): GreatBuildingEntity | undefined {
  const gb = b?.greatBuilding;
  if (!b || !gb) return undefined;
  return {
    owner: b.owner,
    entityId: b.id,
    def: b.def,
    level: gb.level,
    maxLevel: gb.maxLevel,
    invested: gb.investedFp ?? 0,
    required: gb.fpForLevelUp ?? 0,
    connected: b.connected,
  };
}

/** `[entityId, playerId, level?]` of the GreatBuildingsService requests (seen 2026-10-21) */
export function greatBuildingRequest(request: unknown): { entityId: number; owner: PlayerId; level?: number } | null {
  if (!Array.isArray(request)) return null;
  const [entityId, owner, level] = request.map(num);
  if (entityId === undefined || owner === undefined) return null;
  return { entityId, owner: playerId(owner), ...(level !== undefined && { level }) };
}

/**
 * The rows of a great building list (getOtherPlayerOverview, getContributions) as known buildings' state. Rows without
 * building, owner or costs are skipped, so are those of `except` (the session player: its own list says nothing new).
 */
export function toGreatBuildingListRows(data: unknown, except?: PlayerId): GreatBuildingListRow[] {
  return ((Array.isArray(data) ? data : []) as (GameGreatBuildingListRow | null)[]).flatMap((r) => {
    const entityId = num(r?.entity_id);
    const owner = num(r?.player?.player_id);
    const level = num(r?.level);
    const required = num(r?.max_progress);
    const def = r?.city_entity_id;
    if (entityId === undefined || owner === undefined || level === undefined || required === undefined || !def)
      return [];
    if (owner === except) return [];
    const rank = num(r?.rank);
    const forgePoints = num(r?.forge_points);
    const reward = num(r?.reward?.strategy_point_amount);
    return [
      {
        owner: playerId(owner),
        entityId,
        cityEntityId: buildingDefId(def),
        level,
        invested: num(r?.current_progress) ?? 0,
        required,
        ...(rank !== undefined && { rank }),
        ...(rank !== undefined && forgePoints !== undefined && { forgePoints, reward: reward ?? 0 }),
      },
    ];
  });
}

/** The owners of the rows of a great building list with the names the list gives them. */
export function toListOwners(data: unknown): { id: PlayerId; name: string }[] {
  const owners = new Map<PlayerId, string>();
  for (const r of (Array.isArray(data) ? data : []) as (GameGreatBuildingListRow | null)[]) {
    const id = num(r?.player?.player_id);
    const name = r?.player?.name;
    if (id !== undefined && typeof name === 'string' && name !== '') owners.set(playerId(id), name);
  }
  return [...owners].map(([id, name]) => ({ id, name }));
}

/** Display names of great buildings by definition, from the inventory list or the overview of a player. */
export function toGreatBuildingNames(data: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  for (const g of (Array.isArray(data) ? data : []) as (GameGreatBuildingName | null)[]) {
    const id = g?.cityentity_id ?? g?.city_entity_id;
    if (id && typeof g?.name === 'string') names[id] = g.name;
  }
  return names;
}

/** The active limited bonuses; `isActive: false` ones are dropped. */
export function toLimitedBonuses(data: unknown): LimitedBonus[] {
  return ((Array.isArray(data) ? data : []) as (GameLimitedBonus | null)[]).flatMap((b) => {
    const value = num(b?.value);
    if (!b?.type || value === undefined || b.isActive === false) return [];
    const entityId = num(b.entityId);
    return [{ type: b.type, value, ...(entityId !== undefined && { entityId }) }];
  });
}

/**
 * A great building the session player invested in levelled up (`newEvent` of type great_building_contribution). Not
 * recorded yet, the fields are assumed. The event names the building only by its display name.
 */
export function toGreatBuildingLevelUp(
  e: GameEvent | null,
): { owner: PlayerId; name: string; level: number; rank?: number } | null {
  const owner = num(e?.other_player?.player_id);
  const level = num(e?.level);
  if (e?.type !== 'great_building_contribution' || owner === undefined || level === undefined) return null;
  if (typeof e.great_building_name !== 'string') return null;
  const rank = num(e.rank);
  return { owner: playerId(owner), name: e.great_building_name, level, ...(rank !== undefined && { rank }) };
}

function toItemPayload(p: GameInventoryItem['item']): ItemPayload {
  switch (p?.__class__) {
    case 'ForgePointPackagePayload': {
      const gain = num(p.resource_package?.gain);
      return gain === undefined ? { kind: 'other' } : { kind: 'forgePoints', gain };
    }
    case 'BuildingItemPayload': {
      if (!p.cityEntityId) return { kind: 'other' };
      const level = num(p.level);
      return { kind: 'building', def: buildingDefId(p.cityEntityId), ...(level !== undefined && { level }) };
    }
    case 'BoostItemPayload': {
      const value = num(p.value);
      if (!p.boostType || value === undefined) return { kind: 'other' };
      const duration = num(p.duration);
      return { kind: 'boost', boostType: p.boostType, value, ...(duration !== undefined && { duration }) };
    }
    default:
      return { kind: 'other' };
  }
}

/** One full item (InventoryService.getItem); null when it has no id. */
export function toInventoryItem(data: unknown): InventoryItem | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return toInventory([data])?.[0] ?? null;
}

/** `[id, amount]` of InventoryService.getItemAmount (not recorded yet) */
export function toItemAmount(data: unknown): { id: number; inStock: number } | null {
  if (!Array.isArray(data)) return null;
  const [id, inStock] = data.map(num);
  return id === undefined || inStock === undefined ? null : { id, inStock };
}

/**
 * InventoryService.updateItem (recorded 2026-10-21 and 2026-10-23): one `{ id, amount, receivedAt? }` per entry,
 * `amount` the new stock, not a difference. A contribution brings two per package item in one batch: the packages
 * used, then the reward with `receivedAt`; the last one counts. A list of them is read as well.
 */
export function toItemUpdates(data: unknown): { id: number; inStock: number }[] {
  return (Array.isArray(data) ? data : [data]).flatMap((u: { id?: unknown; amount?: unknown } | null) => {
    const id = num(u?.id);
    const inStock = num(u?.amount);
    return id === undefined || inStock === undefined ? [] : [{ id, inStock }];
  });
}

/** The items of InventoryService.getItems; null when `data` is no list. Items without id are skipped. */
export function toInventory(data: unknown): InventoryItem[] | null {
  if (!Array.isArray(data)) return null;
  return (data as (GameInventoryItem | null)[]).flatMap((i) => {
    const id = num(i?.id);
    if (!i || id === undefined) return [];
    return [
      {
        id,
        name: i.name ?? '',
        inStock: num(i.inStock) ?? 0,
        gameClass: i.item?.__class__ ?? 'missing',
        ...(i.itemAssetName && { asset: i.itemAssetName }),
        payload: toItemPayload(i.item),
      },
    ];
  });
}

/**
 * Another player accepted a trade offer of the session player (`newEvent` of type trade_accepted, not recorded yet):
 * the player gets the good he asked for.
 */
export function toAcceptedTrade(e: GameEvent | null): { good: string; amount: number } | null {
  const amount = num(e?.need?.value);
  if (e?.type !== 'trade_accepted' || !e.need?.good_id || amount === undefined) return null;
  return { good: e.need.good_id, amount };
}
