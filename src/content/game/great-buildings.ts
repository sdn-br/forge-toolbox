// Game format → own model for great buildings: entities, constructions, contributions, lists and ranking. Nothing outside src/content/game sees the game format.

import type { GbWindowState } from '../../shared/gb-window-protocol';
import { type BuildingDefId, buildingDefId, type EraId, guildId, type PlayerId, playerId } from '../../shared/ids';
import type { GreatBuildingListRow } from '../../shared/model';
import type { Ingestion } from '../core/ingestion';
import { logInfo } from '../core/log';
import type { Building } from '../model/city';
import type { GreatBuildingEntity, PlaceReward, RankingRow } from '../model/great-building';
import type { ListedPlayer } from '../model/player';
import { isConnected, isGreatBuildingType } from './city';
import type { GameHandlerDeps } from './deps';
import type {
  GameCityEntity,
  GameEvent,
  GameGreatBuildingConstruction,
  GameGreatBuildingListRow,
  GameGreatBuildingName,
  GameGreatBuildingRanking,
  GameGreatBuildingRankingRow,
  GameGreatBuildingReward,
  GameRankingList,
} from './game-types';
import { list, num } from './json';

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

/** Registers the great buildings handlers. */
export function registerGreatBuildings(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, bus, now, session, players, cities, catalog, greatBuildings } = deps;

  // Great buildings. Opening one of another player sends the building (getOtherPlayerCityMapEntity) and then its
  // construction, both with the request [entityId, playerId] (seen 2026-10-21). An own one comes without the building,
  // which the own city knows. Without the request a construction cannot be placed and is skipped.
  ingestion.on('OtherPlayerService', 'getOtherPlayerCityMapEntity', ({ data }) => {
    const entity = toGreatBuildingEntity(data as GameCityEntity);
    if (entity) greatBuildings.noteEntity(entity);
  });
  ingestion.on('GreatBuildingsService', 'getConstruction', ({ data, request }) => {
    const target = greatBuildingRequest(request);
    const construction = data as GameGreatBuildingConstruction | null;
    const rows = toRankingRows(construction?.rankings);
    if (!target || !rows) return;
    const own = target.owner === session.current?.playerId;
    const city = own ? cities.own() : cities.visited();
    const known =
      city?.owner === target.owner ? greatBuildingOfBuilding(city.buildings.get(target.entityId)) : undefined;
    greatBuildings.openConstruction(target.owner, target.entityId, own, rows, known, toNextProduction(construction));
  });
  // [entityId, playerId, level]: the level being built repeats the current rankings, a lower one is finished
  ingestion.on('GreatBuildingsService', 'getConstructionRanking', ({ data, request }) => {
    const target = greatBuildingRequest(request);
    const rows = toRankingRows(data);
    if (target?.level !== undefined && rows)
      greatBuildings.levelRanking(target.owner, target.entityId, target.level, rows);
  });
  // An own contribution (seen 2026-10-21): request [entityId, playerId, level, amount, false], the answer is the new
  // rankings list. The same response brings the building as it is now in a CityMapService.reset, the new resources, the
  // inventory updates of the packages opened and getAvailablePackageForgePoints. The order varies, so the contribution
  // is applied once the response is done, with the building from the reset when there is one. A reset of the open
  // great building without a contribution keeps it current as well, also an own one that others paid into.
  let contribution: { rows: RankingRow[]; target?: { owner: PlayerId; entityId: number } } | null = null;
  const resetBuildings: GreatBuildingEntity[] = [];
  ingestion.on('GreatBuildingsService', 'contributeForgePoints', ({ data, request }) => {
    const rows = toRankingRows(Array.isArray(data) ? data : (data as GameGreatBuildingConstruction | null)?.rankings);
    if (rows) contribution = { rows, target: greatBuildingRequest(request) ?? undefined };
  });
  // heard when the request leaves, so a feature can react while the answer is still on its way
  ingestion.onRequest('GreatBuildingsService', 'contributeForgePoints', ({ request }) => {
    const target = greatBuildingRequest(request);
    if (!target) return;
    const { owner, entityId } = target;
    bus.emit('greatBuilding.contributing', { owner, entityId, own: owner === session.current?.playerId });
  });
  const noteGreatBuildings = ({ data }: { data: unknown }) => {
    for (const e of list<GameCityEntity>(data)) {
      const building = toGreatBuildingEntity(e);
      if (building) resetBuildings.push(building);
    }
  };
  ingestion.on('CityMapService', 'reset', noteGreatBuildings);
  ingestion.on('CityMapService', 'updateEntity', noteGreatBuildings);
  ingestion.onBatchEnd(() => {
    const open = greatBuildings.current();
    const target = contribution?.target ?? open;
    const building = resetBuildings.find((b) => b.owner === target?.owner && b.entityId === target.entityId);
    if (contribution) greatBuildings.contributed(contribution.rows, contribution.target, building);
    else if (building) greatBuildings.noteEntity(building);
    contribution = null;
    resetBuildings.length = 0;
  });

  // the great building window the game shows, as the engine last said; `none` while the engine says nothing
  let gbWindow: GbWindowState = 'none';
  bus.on('gbWindow.changed', ({ state }) => {
    gbWindow = state;
  });
  // names of great buildings, which the level up event uses instead of an id; the definitions may not be loaded
  ingestion.on('InventoryService', 'getGreatBuildings', ({ data }) => {
    catalog.setGreatBuildingNames(toGreatBuildingNames(data));
  });
  ingestion.on('GreatBuildingsService', 'getOtherPlayerOverview', ({ data }) => {
    const me = session.current?.playerId;
    const { names, owners, rows } = toGreatBuildingList(data, me);
    catalog.setGreatBuildingNames(names);
    // the owner first, so the views the list redraws already know the name
    players.applyListed(world, owners);
    greatBuildings.noteList(rows);
    const owner = rows[0]?.owner;
    if (owner === undefined) return;
    // After a contribution that levels a building and after paging back to a finished level the game asks for the
    // owner's list itself (seen 2026-10-31), the request looks the same. Who asked is not decided (Nutzer, 2026-11-09):
    // every list counts, but while a great building window shows, the list comes quietly.
    const quiet = gbWindow === 'foreign' || gbWindow === 'own';
    // debt: a quiet list goes to the console, to check the rule in the game. ceiling: one line per list the game asks
    // for. upgrade: remove it once the rule has held in the game for some weeks.
    if (quiet) logInfo('great building list taken quietly', { owner, window: gbWindow });
    bus.emit('greatBuildings.listed', { owner, entityIds: rows.map((r) => r.entityId), at: now(), quiet });
  });
  // The ranking window, tab "Legendäre Bauwerke" (recorded 2026-11-04 on de10): opening the tab, paging (blocks of 50)
  // and both searches answer with rows of buildings of many players. The other tabs use the same methods.
  for (const method of ['searchRanking', 'getRanking']) {
    ingestion.on('RankingService', method, ({ data }) => {
      const ranking = toGreatBuildingRanking(data, session.current?.playerId);
      if (!ranking) return;
      catalog.setGreatBuildingNames(ranking.names);
      players.applyListed(world, ranking.owners);
      greatBuildings.noteRanking(ranking.rows);
    });
  }
  // The town hall list "Legendäre Bauwerke" of the buildings the session player invested in (recorded 2026-10-24,
  // 39 rows, no request data): the same rows as the overview, with the own rank, deposit and reward on top.
  ingestion.on('GreatBuildingsService', 'getContributions', ({ data }) => {
    if (!Array.isArray(data)) return;
    const me = session.current?.playerId;
    const { names, owners, rows } = toGreatBuildingList(data, me);
    catalog.setGreatBuildingNames(names);
    players.applyListed(world, owners);
    greatBuildings.noteContributions(rows);
  });
  // A great building of another player the player invested in levelled up, named by owner and display name only
  // (recorded 2026-10-23: great_building_contribution with level and rank). An own one levelling sends
  // entity_level_up instead, which is not read: the contribution's response already brings the new level.
  ingestion.on('OtherPlayerService', 'newEvent', ({ data }) => {
    const up = toGreatBuildingLevelUp(data as GameEvent);
    if (up) greatBuildings.leveled(up.owner, catalog.greatBuildingIdsNamed(up.name), up.level, up.rank);
  });
}
