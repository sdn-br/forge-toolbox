// Game format → own model for session start, the own city (map, settlements, production updates) and the visited city. Nothing outside src/content/game sees the game format.

import { buildingDefId, type EraId, eraId, guildId, type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { Session } from '../../shared/model';
import { SECOND_MS } from '../../shared/time';
import type { Ingestion } from '../core/ingestion';
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
} from '../model/city';
import type { GameHandlerDeps } from './deps';
import type {
  GameCityEntity,
  GameCityMap,
  GameCityMapArea,
  GameProduct,
  GameProductionOption,
  GameStartup,
  GameState,
  GameTileset,
  GameUserData,
  GameVisit,
} from './game-types';
import { list, num, numbers } from './json';
import { toObservation, toVisitInfo } from './players';

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
export function isConnected(e: GameCityEntity): boolean {
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

/** The buildings a production result brings in their new state, to be read like `CityMapService.updateEntity`. */
export const updatedEntities = (data: unknown): unknown =>
  (data as { updatedEntities?: unknown } | null)?.updatedEntities;

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

/** Registers the session start, the own city (map, settlements, production updates) and the visited city handlers. */
export function registerCity(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, now, session, players, cities, catalog } = deps;

  /** the game shows the main map of the own city, not a settlement or a colony; set by the map requests below */
  let onMain = true;

  ingestion.on('StartupService', 'getData', ({ data }) => {
    onMain = true;
    const d = data as GameStartup;
    const s = toSession(world, d.user_data);
    if (!s) return;
    catalog.setResourceNames(toGoodsNames(d));
    catalog.setGoodEras(toGoodEras(d));
    session.start(s);
    cities.setOwn(toCity(world, s.playerId, s.era, d.city_map, now()));
  });

  // Back in the own city. The game reloads the own city (`CityMapService.getEntities` with `main`) after a battle and
  // asks for the announcements when it returns from the battle, the battleground or the guild screens (recordings of
  // 2026-10-19 to 2026-10-20). After a battle from a visited city the same response also brings the visit again, then
  // the visited city shows. Going home from a visit with the home button sends nothing and stays unseen.
  let home = false;
  let visit = false;
  ingestion.on('CityMapService', 'getEntities', ({ request, data }) => {
    // another map (a settlement, a colony) is not the own city
    if (!isMainMap(request)) return;
    home = true;
    onMain = true;
    // all buildings of the main map (596 of 596, recording of 2026-10-29): what changed while another map was open
    const owner = session.current?.playerId;
    if (owner && Array.isArray(data)) cities.replaceOwnBuildings(toBuildings(data, owner));
  });
  // Entering a settlement loads its map (`getCityMap` with `cultural_outpost`), and its harvests bring its buildings as
  // `updatedEntities` like those of the own city, without saying which map they belong to (recording of 2026-10-29).
  // Until the game loads the main map again, building updates are not the own city's.
  ingestion.on('CityMapService', 'getCityMap', ({ request }) => {
    onMain = isMainMap(request);
  });
  ingestion.on('AnnouncementsService', 'fetchAllAnnouncements', () => {
    home = true;
  });
  ingestion.onBatchEnd(() => {
    if (home && !visit) cities.showOwn();
    home = false;
    visit = false;
  });

  ingestion.on('OtherPlayerService', 'visitPlayer', ({ data }) => {
    visit = true;
    const d = data as GameVisit;
    const o = d.other_player ? toObservation(d.other_player) : null;
    if (!o || !d.other_player) return;
    players.apply(world, [o], 'visit');
    const era = d.other_player_era ?? d.other_player.era ?? '';
    const city = toCity(world, o.id, era, d.city_map, now());
    cities.setVisited({ ...city, visit: toVisitInfo(d.other_player) });
  });
  const updateBuildings = ({ data }: { data: unknown }) => {
    const owner = session.current?.playerId;
    // an update of an own building while another map is open is lost here; `getEntities` brings it on the way back
    if (!owner || !onMain || !Array.isArray(data)) return;
    cities.updateBuildings(toBuildings(data, owner));
  };
  ingestion.on('CityMapService', 'updateEntity', updateBuildings);
  ingestion.on('CityMapService', 'reset', updateBuildings);
  // A harvest (pickupProduction) and a start (startProduction) bring the buildings in their new state as
  // `updatedEntities` of a CityProductionResult, without a CityMapService entry (seen 2026-10-23 and 2026-10-26). An
  // item that finishes a production answers with CityMapService.updateEntity, read above.
  ingestion.onService('CityProductionService', ({ data }) => {
    updateBuildings({ data: updatedEntities(data) });
  });

  // debt: own city ignores placeBuilding, removeBuilding and moveEntity. ceiling: own city is stale after building
  // changes until reload. upgrade: handle them once recordings of placeBuilding, removeBuilding and moveEntity exist.
}
