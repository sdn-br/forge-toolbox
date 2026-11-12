// Game format → own model. Nothing outside src/content/game sees the game format.

import {
  type BuildingDefId,
  buildingDefId,
  type EraId,
  eraId,
  guildId,
  type PlayerId,
  playerId,
  type WorldId,
} from '../../shared/ids';
import type {
  AttackTimer,
  BattleResult,
  BattleSide,
  CityShield,
  FoughtBattle,
  GreatBuildingListRow,
  GuildRef,
  IncomingAttack,
  InventoryItem,
  ItemPayload,
  Plunder,
  Session,
} from '../../shared/model';
import { SECOND_MS } from '../../shared/time';
import type { ArmyBattleKind } from '../core/events';
import type { LimitedBonus } from '../model/bonus';
import type { CityGrid, UnitType } from '../model/catalog';
import type {
  Area,
  Building,
  BuildingCategory,
  BuildingState,
  City,
  ExpansionKind,
  ExpansionOffer,
  GreatBuildingBonus,
  Product,
  VisitInfo,
} from '../model/city';
import type { GreatBuildingEntity, PlaceReward, RankingRow } from '../model/great-building';
import type { ListedPlayer, PlayerObservation } from '../model/player';
import type { ResearchExpansion } from '../model/research';
import type {
  GameArmyContext,
  GameBattle,
  GameBattleState,
  GameBattleUnit,
  GameCityEntity,
  GameCityMap,
  GameCityMapArea,
  GameCityProtection,
  GameEntityIcon,
  GameEra,
  GameEvent,
  GameGreatBuildingConstruction,
  GameGreatBuildingListRow,
  GameGreatBuildingName,
  GameGreatBuildingRanking,
  GameGreatBuildingRankingRow,
  GameGreatBuildingReward,
  GameGrid,
  GameInventoryItem,
  GameLimitedBonus,
  GamePlayer,
  GamePlunderResult,
  GameProduct,
  GameProductionOption,
  GameRankingList,
  GameResearchProgress,
  GameResearchTechnology,
  GameStartup,
  GameState,
  GameTileset,
  GameUnitType,
  GameUserData,
} from './game-types';
import { list, num, numbers, numbersOrNull } from './json';

// In visited cities the game hides all times behind the largest 32 bit integer (seen 2026-10-19).
const HIDDEN = 2147483647;
const seconds = (s: number | undefined) => (typeof s === 'number' && s > 0 && s < HIDDEN ? s * SECOND_MS : undefined);

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
  return { resources: numbers(p.product?.resources) };
}

function productOfOption(o: GameProductionOption | undefined): Product | undefined {
  if (!o?.products) return undefined;
  const resources: Record<string, number> = {};
  const guildGoods: Record<string, number> = {};
  for (const p of o.products) {
    for (const [k, v] of Object.entries(numbers(p.playerResources?.resources))) resources[k] = (resources[k] ?? 0) + v;
    for (const [k, v] of Object.entries(numbers(p.guildResources?.resources))) guildGoods[k] = (guildGoods[k] ?? 0) + v;
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

/** whether the game type (of an entity or a building definition) is a great building */
export const isGreatBuildingType = (type: string | undefined): boolean => type === 'greatbuilding';

/** Groups by the game type of the entity; types the toolbox does not know are `other`. */
const CATEGORY_OF: Record<string, BuildingCategory> = {
  residential: 'residential',
  production: 'production',
  goods: 'goods',
  culture: 'culture',
  decoration: 'culture',
  military: 'military',
  greatbuilding: 'greatBuilding',
  street: 'street',
  generic_building: 'special',
  random_production: 'special',
  tower: 'special',
  clan_power_production: 'special',
};

// Entities the game lists with the city but places beside the grid (seen in the own city, 2026-10-19). The hubs are the
// Arctic Harbour and the Ocean Terminal with their parts (seen 2026-10-29).
const OFF_GRID = new Set(['off_grid', 'outpost_ship', 'friends_tavern', 'hub_main', 'hub_part']);

/**
 * Whether a city entity has a road connection. The game leaves out fields that are 0, so an unconnected building can
 * come without `connected`. That alone says nothing for most buildings: 70 `generic_building` entities without
 * `connected` were producing in a visited city (recording 2026-11-10), they need no road. So only two signals count:
 * the state `UnconnectedState` (seen on great buildings, residential and production buildings), and for a great
 * building a missing or 0 `connected`. In the own city at start (StartupService.getData) all 11 great buildings had no
 * `connected` and `UnconnectedState`, while an earlier CityMapService.getEntities showed `connected: 1` for them
 * (the 6 great buildings of a visit, OtherPlayerService.visitPlayer, came without it too). Every other building keeps
 * the rule that a missing `connected` means connected.
 */
function isConnected(e: GameCityEntity): boolean {
  if (e.state?.__class__ === 'UnconnectedState') return false;
  if (isGreatBuildingType(e.type)) return (num(e.connected) ?? 0) > 0;
  return e.connected !== 0;
}

export function toBuilding(e: GameCityEntity, owner: PlayerId): Building | null {
  if (typeof e.id !== 'number' || !e.cityentity_id) return null;
  const building: Building = {
    id: e.id,
    owner: typeof e.player_id === 'number' ? playerId(e.player_id) : owner,
    def: buildingDefId(e.cityentity_id),
    category: CATEGORY_OF[e.type ?? ''] ?? 'other',
    ...(OFF_GRID.has(e.type ?? '') && { offGrid: true }),
    x: e.x ?? 0,
    y: e.y ?? 0,
    level: e.level,
    connected: isConnected(e),
    state: toState(e.state),
  };
  if (isGreatBuildingType(e.type)) {
    building.greatBuilding = {
      level: e.level ?? 0,
      maxLevel: e.max_level ?? 0,
      investedFp: e.state?.invested_forge_points,
      fpForLevelUp: e.state?.forge_points_for_level_up,
      bonuses: toGreatBuildingBonuses(e),
    };
  }
  return building;
}

/**
 * The bonuses of a great building: the list `bonuses` since 2026-11-05 (the Arc there has `contribution_boost` and
 * `contribution_boost_gold`), else the single passive `bonus` of older data as a list of one. Older data send an empty
 * `bonuses` beside `bonus` (seen 2026-10-19), so only a list with entries counts.
 */
function toGreatBuildingBonuses(e: GameCityEntity): GreatBuildingBonus[] {
  const bonuses = Array.isArray(e.bonuses) && e.bonuses.length > 0 ? e.bonuses : e.bonus ? [e.bonus] : [];
  return bonuses.flatMap((b) =>
    b?.type
      ? [
          {
            type: b.type,
            value: b.value ?? 0,
            ...(b.amount !== undefined && { amount: b.amount }),
            ...(b.targetedFeature !== undefined && { feature: b.targetedFeature }),
          },
        ]
      : [],
  );
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

/** The buildings of a list of city entities; entries that are no building are skipped, anything but a list gives none. */
export function toBuildings(data: unknown, owner: PlayerId): Building[] {
  return list<GameCityEntity>(data)
    .map((e) => toBuilding(e, owner))
    .filter((b): b is Building => b !== null);
}

/** Whether the request of a map service names the main map; no request or an empty one counts as main. */
export const isMainMap = (request: unknown): boolean =>
  !Array.isArray(request) || request.length === 0 || request[0] === 'main';

export function toCity(world: WorldId, owner: PlayerId, era: string, map: GameCityMap | undefined, now: number): City {
  const buildings = new Map(toBuildings(map?.entities, owner).map((b) => [b.id, b]));
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

/**
 * Expansion kinds by the game type of a tileset: `tileset_premium` (diamonds), `tileset_reward` (coins or diamonds, yet
 * only won as a reward), `raidMedals` (medals of the Quantum Incursions).
 */
const EXPANSION_KIND: Record<string, ExpansionKind> = {
  tileset_premium: 'diamonds',
  tileset_reward: 'reward',
  raidMedals: 'quantum',
};

function toExpansionOffers(tilesets: GameTileset[]): ExpansionOffer[] {
  return tilesets.flatMap((t): ExpansionOffer[] => {
    if (typeof t?.type !== 'string') return [];
    const cost = numbers((t.requirements?.cost ?? t.cost)?.resources);
    const minEra = t.requirements?.min_era;
    const era = minEra ? { minEra: eraId(minEra) } : {};
    const kind = Object.hasOwn(EXPANSION_KIND, t.type) ? EXPANSION_KIND[t.type] : undefined;
    return [kind ? { kind, ...era, cost } : { kind: 'unknown', gameType: t.type, ...era, cost }];
  });
}

/** The resource bag of the player, `{ resources: { resources: { money: … } } }` (seen 2026-10-21); null when it is not one. */
export function toResourceBag(data: unknown): Record<string, number> | null {
  const bag = data as { type?: { value?: unknown }; resources?: { resources?: unknown } } | null;
  // other bag types (seen only PlayerMain) belong to other stocks, not the player's
  const type = bag?.type?.value;
  if (type !== undefined && type !== 'PlayerMain') return null;
  return numbersOrNull(bag?.resources?.resources);
}

/** ResourceService.getPlayerResources (not recorded yet): `{ resources: { money, strategy_points, … } }`, the full stock */
export function toPlayerResources(data: unknown): Record<string, number> | null {
  return numbersOrNull((data as { resources?: unknown } | null)?.resources);
}

/**
 * The technologies of the metadata file `research-<hash>` that reward main city expansions, in the order of the file.
 * Only `type: 'expansion'` with `subType: 'main'` counts; outposts and other cities have their own types.
 */
export function toResearchExpansions(json: unknown): ResearchExpansion[] {
  return list<GameResearchTechnology>(json).flatMap((tech) => {
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
  const grid = list<GameGrid>(json).find((g) => g?.id === 'main');
  if (!grid) return null;
  const blocks = (grid.sectors ?? [])
    .filter((s) => s?.type?.value === 'Regular')
    .flatMap((s) => (s.tilePositions ?? []).map((p) => ({ x: p?.x ?? 0, y: p?.y ?? 0 })));
  return { width: grid.width ?? 0, height: grid.height ?? 0, blocks };
}

/**
 * The unit types of the metadata file `unit_types-<hash>` by their id; entries without id or name are skipped. A unit
 * of every era (`NoAge`: agent, guild raids, event units, legends) has no era.
 */
export function toUnitTypes(json: unknown): UnitType[] {
  return list<GameUnitType>(json).flatMap((u) =>
    typeof u?.unitTypeId === 'string' && typeof u.name === 'string'
      ? [
          {
            id: u.unitTypeId,
            name: u.name,
            ...(typeof u.minEra === 'string' && u.minEra !== 'NoAge' && { era: eraId(u.minEra) }),
            ...(typeof u.unitClass === 'string' && { unitClass: u.unitClass }),
          },
        ]
      : [],
  );
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

/** Display names of the goods by id, from the `goodsList` of the startup data. */
export function toGoodsNames(startup: GameStartup): Record<string, string> {
  const goods: Record<string, string> = {};
  for (const g of startup.goodsList ?? []) if (g.id && g.name) goods[g.id] = g.name;
  return goods;
}

/** The era of each good by id, from the `goodsList` of the startup data; a good without an era is left out. */
export function toGoodEras(startup: GameStartup): Record<string, EraId> {
  const eras: Record<string, EraId> = {};
  for (const g of startup.goodsList ?? []) if (g.id && g.era) eras[g.id] = eraId(g.era);
  return eras;
}

/** The buildings the game marks with the Double Loot icon (`showEntityIcons`). */
export function doubledLootIds(data: unknown): number[] {
  return list<GameEntityIcon>(data).flatMap((icon) =>
    icon.type === 'citymap_icon_plunder_and_pillage' && typeof icon.id === 'number' ? [icon.id] : [],
  );
}

/** The buildings a production result brings in their new state, to be read like `CityMapService.updateEntity`. */
export const updatedEntities = (data: unknown): unknown =>
  (data as { updatedEntities?: unknown } | null)?.updatedEntities;

/** The eras of the metadata file `research_eras`; an entry without an id is skipped. */
export function toEras(json: unknown): { id: EraId; name: string }[] {
  return list<GameEra>(json).flatMap((e) => (e.era ? [{ id: eraId(e.era), name: e.name ?? e.era }] : []));
}

/** The game's own sum of Forge points in packages: `[108198]`. */
export const toPackageForgePoints = (data: unknown): number | undefined =>
  num(Array.isArray(data) ? data[0] : undefined);

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

/**
 * The production of the next level from `getConstruction` (`next_production_bonus`); undefined when the answer has
 * none. Forge points only when the game names strategy points.
 */
export function toNextProduction(data: GameGreatBuildingConstruction | null | undefined): { fp?: number } | undefined {
  const bonus = data?.next_production_bonus;
  const value = num(bonus?.value);
  if (typeof bonus?.type !== 'string' || value === undefined) return undefined;
  return bonus.type === 'strategy_points' ? { fp: value } : {};
}

/**
 * A great building from a city entity, for example `OtherPlayerService.getOtherPlayerCityMapEntity`. The game leaves
 * out fields that are 0 (seen: `y`, `invested_forge_points`), so a missing `connected` means not connected.
 */
export function toGreatBuildingEntity(e: GameCityEntity | null | undefined): GreatBuildingEntity | null {
  const id = num(e?.id);
  const owner = num(e?.player_id);
  if (!e || !isGreatBuildingType(e.type) || id === undefined || owner === undefined || !e.cityentity_id) return null;
  return {
    owner: playerId(owner),
    entityId: id,
    def: buildingDefId(e.cityentity_id),
    level: num(e.level) ?? 0,
    maxLevel: num(e.max_level) ?? 0,
    invested: num(e.state?.invested_forge_points) ?? 0,
    required: num(e.state?.forge_points_for_level_up) ?? 0,
    connected: isConnected(e),
  };
}

/** A great building of a known city, for constructions that come without an opening (the own ones). */
export function greatBuildingOfBuilding(b: Building | undefined): GreatBuildingEntity | undefined {
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

/** The fields a row of a great building list or of the ranking needs, however the source names them. */
interface RowKey {
  owner: PlayerId;
  entityId: number;
  def: BuildingDefId;
  level: number;
  required: number;
}

/**
 * The session player (`except`) is left out of what the lists tell: its own rows and entry say nothing new. Every
 * great building list converter takes the rule from here.
 */
const isExcepted = (owner: number, except?: PlayerId): boolean => owner === except;

/** The key of a row; null when building, owner, level or costs are missing, or when the owner is `except`. */
function rowKey(
  fields: { entityId: unknown; owner: unknown; level: unknown; required: unknown; def: string | undefined },
  except?: PlayerId,
): RowKey | null {
  const entityId = num(fields.entityId);
  const owner = num(fields.owner);
  const level = num(fields.level);
  const required = num(fields.required);
  const def = fields.def;
  if (entityId === undefined || owner === undefined || level === undefined || required === undefined || !def) {
    return null;
  }
  if (isExcepted(owner, except)) return null;
  return { owner: playerId(owner), entityId, def: buildingDefId(def), level, required };
}

/**
 * The rows of a great building list (getOtherPlayerOverview, getContributions) as known buildings' state. Rows without
 * building, owner or costs are skipped, so are those of `except` (the session player: its own list says nothing new).
 */
export function toGreatBuildingListRows(data: unknown, except?: PlayerId): GreatBuildingListRow[] {
  return list<GameGreatBuildingListRow | null>(data).flatMap((r) => {
    const key = rowKey(
      {
        entityId: r?.entity_id,
        owner: r?.player?.player_id,
        level: r?.level,
        required: r?.max_progress,
        def: r?.city_entity_id,
      },
      except,
    );
    if (!key) return [];
    const rank = num(r?.rank);
    const forgePoints = num(r?.forge_points);
    const reward = num(r?.reward?.strategy_point_amount);
    return [
      {
        ...key,
        invested: num(r?.current_progress) ?? 0,
        ...(rank !== undefined && { rank }),
        ...(rank !== undefined && forgePoints !== undefined && { forgePoints, reward: reward ?? 0 }),
      },
    ];
  });
}

/** The owners of the rows of a great building list as the list gives them, each once; `except` (the own id) is left out. */
export function toListedPlayers(data: unknown, except?: PlayerId): ListedPlayer[] {
  return uniqueOwners(
    list<GameGreatBuildingListRow | null>(data).flatMap((r) => {
      const id = num(r?.player?.player_id);
      const name = r?.player?.name;
      if (id === undefined || isExcepted(id, except) || typeof name !== 'string' || name === '') return [];
      const avatar = r?.player?.avatar;
      return [{ id: playerId(id), name, ...(typeof avatar === 'string' && avatar !== '' && { avatar }) }];
    }),
  );
}

/** What a great building list (getOtherPlayerOverview, getContributions) tells: the building names, the owners, the rows. */
export interface GreatBuildingList {
  names: Record<string, string>;
  /** the owners of all rows, also of those without costs that `rows` drops */
  owners: ListedPlayer[];
  rows: GreatBuildingListRow[];
}

export function toGreatBuildingList(data: unknown, except?: PlayerId): GreatBuildingList {
  return {
    names: toGreatBuildingNames(data),
    owners: toListedPlayers(data, except),
    rows: toGreatBuildingListRows(data, except),
  };
}

/** Each owner once, in the order of first appearance; a later entry of the same player replaces the earlier one. */
const uniqueOwners = (owners: ListedPlayer[]): ListedPlayer[] => [...new Map(owners.map((o) => [o.id, o])).values()];

/** What a page of the great building ranking tells: the rows as list rows, their owners and the building names. */
export interface GreatBuildingRanking {
  rows: GreatBuildingListRow[];
  owners: ListedPlayer[];
  names: Record<string, string>;
}

/**
 * A page of the ranking window (RankingService.searchRanking, getRanking), when it is the great building tab; any other
 * tab gives null. Rows without building, owner or costs are skipped, so are those of `except` (the session player).
 * The ranking's own `rank` is the place in the ranking, not an own contribution, so it is not passed on.
 */
export function toGreatBuildingRanking(data: unknown, except?: PlayerId): GreatBuildingRanking | null {
  const page = data as GameRankingList | null;
  if (page?.category?.value !== 'great_building') return null;
  const result: GreatBuildingRanking = { rows: [], owners: [], names: {} };
  const owners: ListedPlayer[] = [];
  for (const r of list<GameGreatBuildingRanking | null>(page.rankings)) {
    const key = rowKey(
      {
        entityId: r?.entityId,
        owner: r?.player?.player_id,
        level: r?.level,
        required: r?.requiredPoints,
        def: r?.cityEntityId,
      },
      except,
    );
    if (!r || !key) continue;
    const tier = r.currentTier?.value;
    result.rows.push({
      ...key,
      invested: num(r.points) ?? 0,
      ...((tier === 'copper' || tier === 'gold') && { tier }),
    });
    if (typeof r.name === 'string' && r.name !== '') result.names[key.def] = r.name;
    const p = r.player;
    if (typeof p?.name !== 'string' || p.name === '') continue;
    const guild = num(r.clan?.id);
    owners.push({
      id: key.owner,
      name: p.name,
      // a missing field keeps what the player store knows
      avatar: p.avatar,
      cityName: p.city_name,
      era: p.era as EraId | undefined,
      guild: guild === undefined ? null : { id: guildId(guild), name: r.clan?.name ?? '' },
    });
  }
  result.owners = uniqueOwners(owners);
  return result;
}

/** Display names of great buildings by definition, from the inventory list or the overview of a player. */
export function toGreatBuildingNames(data: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  for (const g of list<GameGreatBuildingName | null>(data)) {
    const id = g?.cityentity_id ?? g?.city_entity_id;
    if (id && typeof g?.name === 'string') names[id] = g.name;
  }
  return names;
}

/** The active limited bonuses; `isActive: false` ones are dropped. */
export function toLimitedBonuses(data: unknown): LimitedBonus[] {
  return list<GameLimitedBonus | null>(data).flatMap((b) => {
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
  const other = { kind: 'other', gameClass: p?.__class__ ?? 'missing' } as const;
  switch (p?.__class__) {
    case 'ForgePointPackagePayload': {
      const gain = num(p.resource_package?.gain);
      return gain === undefined ? other : { kind: 'forgePoints', gain };
    }
    case 'BuildingItemPayload': {
      if (!p.cityEntityId) return other;
      const level = num(p.level);
      return { kind: 'building', def: buildingDefId(p.cityEntityId), ...(level !== undefined && { level }) };
    }
    case 'BoostItemPayload': {
      const value = num(p.value);
      if (!p.boostType || value === undefined) return other;
      const duration = num(p.duration);
      return { kind: 'boost', boostType: p.boostType, value, ...(duration !== undefined && { duration }) };
    }
    default:
      return other;
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
