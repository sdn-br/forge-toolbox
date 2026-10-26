// Which game response feeds which store, all in one place. A response may have several handlers that each feed their
// own part, for example `updatePlayer` (players, plunder) and `CityMapService.reset` (plunder, own buildings).
import { eraId, type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Ingestion } from '../core/ingestion';
import { logInfo } from '../core/log';
import type { Stores } from '../stores';
import type { Building } from '../stores/city-model';
import type { GreatBuildingEntity, RankingRow } from '../stores/great-building-model';
import type { PlayerObservation } from '../stores/players';
import { toBuildingDef } from './building-defs';
import {
  armyBattleType,
  greatBuildingOf,
  greatBuildingRequest,
  isBattleState,
  isOwnPvpBattle,
  isPlunderedEntity,
  isRepelledPlunder,
  plunderLoot,
  plunderTarget,
  toAcceptedTrade,
  toBattle,
  toBuilding,
  toCity,
  toCityGrid,
  toFormerFriend,
  toGreatBuildingEntity,
  toGreatBuildingLevelUp,
  toGreatBuildingListRows,
  toGreatBuildingNames,
  toIncoming,
  toInventory,
  toInventoryItem,
  toItemAmount,
  toItemUpdates,
  toLimitedBonuses,
  toListOwners,
  toNewFriend,
  toNextProduction,
  toObservation,
  toObservationWithAttack,
  toPlayerResources,
  toPlunder,
  toRankingRows,
  toRepelledPlunder,
  toResearchExpansions,
  toResourceBag,
  toSession,
  toShields,
  toUnlockedNodes,
  toVisitInfo,
} from './convert';
import { parseEventDate } from './event-date';
import type {
  GameBattle,
  GameCityEntity,
  GameEntityIcon,
  GameEra,
  GameEvent,
  GameEventPage,
  GameGreatBuildingConstruction,
  GameGreatBuildingListRow,
  GameSocialList,
  GameStartup,
  GameVisit,
} from './game-types';

/** The stores the responses feed, plus what the handlers need besides them. */
export type GameHandlerDeps = Stores & {
  world: WorldId;
  bus: ToolboxBus;
  now: () => number;
};

const observations = (list: unknown) =>
  (Array.isArray(list) ? list : []).map(toObservation).filter((o): o is PlayerObservation => o !== null);

/** For sources that carry the whole player: a missing timer field there clears what the store knows. */
const withAttack = (list: unknown, now: number) =>
  (Array.isArray(list) ? list : [])
    .map((p) => toObservationWithAttack(p, now))
    .filter((o): o is PlayerObservation => o !== null);

export function registerGameHandlers(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const {
    world,
    bus,
    now,
    session,
    players,
    cities,
    catalog,
    resources,
    research,
    battles,
    plunders,
    incoming,
    shields,
    greatBuildings,
    inventory,
  } = deps;

  ingestion.on('StartupService', 'getData', ({ data }) => {
    const d = data as GameStartup;
    const s = toSession(world, d.user_data);
    if (!s) return;
    const goods: Record<string, string> = {};
    for (const g of d.goodsList ?? []) if (g.id && g.name) goods[g.id] = g.name;
    catalog.setResourceNames(goods);
    session.start(s);
    cities.setOwn(toCity(world, s.playerId, s.era, d.city_map, now()));
  });

  // Attack timers come whole with the neighbours (30 of 75 had next_interaction_in, seen 2026-10-21). Friends and
  // guild members cannot be attacked; their entries are taken as without timers and leave them untouched.
  ingestion.on('OtherPlayerService', 'getSocialList', ({ data }) => {
    const d = data as GameSocialList;
    players.applySocialList(world, {
      neighbor: withAttack(d.neighbours, now()),
      guildMember: observations(d.guildMembers),
      friend: observations(d.friends),
    });
  });

  // Single friend messages change only `friend`; the social list stays the full truth. An accepted invitation brings
  // the new friend as a whole player (recorded 2026-10-20). A deleted friendship answers with the player id, as only
  // the old toolbox names it.
  ingestion.on('FriendService', 'acceptInvitation', ({ data }) => {
    const friend = toNewFriend(data);
    if (friend) players.addFriend(world, friend);
  });
  ingestion.on('FriendService', 'deleteFriend', ({ data }) => {
    const id = toFormerFriend(data);
    if (id !== null) players.removeFriend(world, id);
  });

  // Back in the own city. The game reloads the own city (`CityMapService.getEntities` with `main`) after a battle and
  // asks for the announcements when it returns from the battle, the battleground or the guild screens (recordings of
  // 2026-10-19 to 2026-10-20). After a battle from a visited city the same response also brings the visit again, then
  // the visited city shows. Going home from a visit with the home button sends nothing and stays unseen.
  let home = false;
  let visit = false;
  ingestion.on('CityMapService', 'getEntities', ({ request }) => {
    // another map (a settlement, a colony) is not the own city
    if (Array.isArray(request) && request.length > 0 && request[0] !== 'main') return;
    home = true;
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

  // comes with battles and other interactions, for example in the same response as the battle against that player.
  // It carries the whole player with the attack timers (seen 2026-10-21: after a battle next_interaction_in 86400 and
  // canSabotage, after the plunder only next_interaction_in), so it also clears them.
  ingestion.on('OtherPlayerService', 'updatePlayer', ({ data }) => {
    players.apply(world, withAttack(data, now()), 'update');
  });

  // A manual battle starts without a result. Its result comes with a later BattlefieldService response that is a
  // battle state (seen: submitMove). Only the latest start counts, it is the battle on screen.
  let running: GameBattle | null = null;
  ingestion.on('BattlefieldService', 'startByBattleType', ({ data }) => {
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
    const battleType = armyBattleType(request);
    if (battleType) bus.emit('army.opened', { battleType });
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
  let plundered: GameCityEntity | undefined;
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
    plundered = (data as GameCityEntity[]).find((e) => isPlunderedEntity(e, me)) ?? plundered;
  });
  ingestion.on('CityMapService', 'showEntityIcons', ({ data }) => {
    for (const icon of (Array.isArray(data) ? data : []) as GameEntityIcon[]) {
      if (icon.type === 'citymap_icon_plunder_and_pillage' && typeof icon.id === 'number') doubled.add(icon.id);
    }
  });
  ingestion.onBatchEnd(() => {
    const tried =
      target ?? (plundered && { opponent: playerId(plundered.player_id as number), entityId: plundered.id as number });
    if ((loot || repelled) && tried) bus.emit('plunder.attempted', tried);
    if (loot && plundered) {
      plunders.record(toPlunder(world, now(), plundered, loot, doubled.has(plundered.id as number)));
    }
    const me = session.current?.playerId;
    if (repelled && target && target.opponent !== me) {
      const { opponent, entityId } = target;
      const visited = cities.visited();
      const def = visited?.owner === opponent ? visited.buildings.get(entityId)?.def : undefined;
      plunders.record(toRepelledPlunder(world, now(), opponent, { entityId, ...(def && { cityEntityId: def }) }));
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

  const updateBuildings = ({ data }: { data: unknown }) => {
    const owner = session.current?.playerId;
    if (!owner || !Array.isArray(data)) return;
    const buildings = (data as GameCityEntity[])
      .map((e) => toBuilding(e, owner))
      .filter((b): b is Building => b !== null);
    cities.updateBuildings(buildings);
  };
  ingestion.on('CityMapService', 'updateEntity', updateBuildings);
  ingestion.on('CityMapService', 'reset', updateBuildings);
  // A harvest (pickupProduction) and a start (startProduction) bring the buildings in their new state as
  // `updatedEntities` of a CityProductionResult, without a CityMapService entry (seen 2026-10-23 and 2026-10-26). An
  // item that finishes a production answers with CityMapService.updateEntity, read above.
  ingestion.onService('CityProductionService', ({ data }) => {
    updateBuildings({ data: (data as { updatedEntities?: unknown } | null)?.updatedEntities });
  });
  ingestion.onMeta('building_entity_', (file) => {
    if (file.name === 'building_entity_lookup') return;
    const def = toBuildingDef(file.json);
    if (def) catalog.add(def);
  });

  // The resource bag comes with the startup data: `{ type: PlayerMain, resources: { resources: { … } } }` (seen
  // 2026-10-21); other bag types are skipped. Not recorded yet: getPlayerResources `{ resources: { … } }` with the full
  // stock, as a response or over the websocket.
  ingestion.on('ResourceService', 'getPlayerResourceBag', ({ data }) => {
    const bag = toResourceBag(data);
    if (bag) resources.set(bag);
  });
  ingestion.on('ResourceService', 'getPlayerResources', ({ data }) => {
    const bag = toPlayerResources(data);
    if (bag) resources.set(bag);
  });
  // not recorded yet: an accepted own trade offer brings the good asked for
  ingestion.on('OtherPlayerService', 'newEvent', ({ data }) => {
    const trade = toAcceptedTrade(data as GameEvent);
    if (trade) resources.add(trade.good, trade.amount);
  });

  ingestion.onMeta('grid', (file) => {
    if (file.name !== 'grid') return;
    const grid = toCityGrid(file.json);
    if (grid) catalog.setCityGrid(grid);
  });

  ingestion.onMeta('research_eras', (file) => {
    const eras = ((Array.isArray(file.json) ? file.json : []) as GameEra[]).flatMap((e) =>
      e.era ? [{ id: eraId(e.era), name: e.name ?? e.era }] : [],
    );
    catalog.setEras(eras);
  });

  // `research_eras` shares the prefix and is another file
  ingestion.onMeta('research', (file) => {
    if (file.name === 'research') research.setExpansions(toResearchExpansions(file.json));
  });

  // comes with the startup data; some batches carry a getProgress that is no object, those are skipped.
  // debt: only the progress of the start is read. ceiling: a technology finished during play still counts as open
  // until reload. upgrade: follow the response that reports a finished technology once it is recorded.
  ingestion.on('ResearchService', 'getProgress', ({ data }) => {
    const nodes = toUnlockedNodes(data);
    if (nodes) research.setUnlocked(nodes);
  });

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
    const known = city?.owner === target.owner ? greatBuildingOf(city.buildings.get(target.entityId)) : undefined;
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
  const noteGreatBuildings = ({ data }: { data: unknown }) => {
    for (const e of Array.isArray(data) ? (data as GameCityEntity[]) : []) {
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
  // The full list comes with the startup data (seen 2026-10-21, 298 items) and replaces the inventory. updateItem
  // `{ id, amount, receivedAt? }` with the new stock is recorded (see toItemUpdates). Not recorded yet, shapes as
  // described: getItemsByType brings the full items of one type, getItem one full item (new ones arrive so, e.g.
  // rewards), getItemAmount `[id, amount]`. All may come as a response or over the websocket; listeners hear once per
  // response.
  ingestion.on('InventoryService', 'getItems', ({ data }) => {
    const items = toInventory(data);
    if (items) inventory.replace(items);
  });
  ingestion.on('InventoryService', 'getItemsByType', ({ data }) => {
    inventory.upsert(toInventory(data) ?? []);
  });
  ingestion.on('InventoryService', 'getItem', ({ data }) => {
    const item = toInventoryItem(data);
    if (item) inventory.upsert([item]);
  });
  ingestion.on('InventoryService', 'getItemAmount', ({ data }) => {
    const amount = toItemAmount(data);
    if (amount) inventory.setStock(amount.id, amount.inStock);
  });
  ingestion.on('InventoryService', 'updateItem', ({ data }) => {
    for (const u of toItemUpdates(data)) inventory.setStock(u.id, u.inStock);
  });
  // the game's own sum of Forge points in packages (seen 2026-10-21 after a contribution: `[108198]`)
  ingestion.on('GreatBuildingsService', 'getAvailablePackageForgePoints', ({ data }) => {
    const fp = Array.isArray(data) ? data[0] : undefined;
    if (typeof fp === 'number' && Number.isFinite(fp)) inventory.reportPackageForgePoints(fp);
  });
  ingestion.onBatchEnd(() => inventory.commit());

  // names of great buildings, which the level up event uses instead of an id; the definitions may not be loaded
  ingestion.on('InventoryService', 'getGreatBuildings', ({ data }) => {
    catalog.setGreatBuildingNames(toGreatBuildingNames(data));
  });
  ingestion.on('GreatBuildingsService', 'getOtherPlayerOverview', ({ data }) => {
    catalog.setGreatBuildingNames(toGreatBuildingNames(data));
    greatBuildings.noteList(
      toGreatBuildingListRows(data, session.current?.playerId),
      (data as GameGreatBuildingListRow[] | null)?.[0]?.player?.name,
    );
  });
  // The town hall list "Legendäre Bauwerke" of the buildings the session player invested in (recorded 2026-10-24,
  // 39 rows, no request data): the same rows as the overview, with the own rank, deposit and reward on top.
  ingestion.on('GreatBuildingsService', 'getContributions', ({ data }) => {
    if (!Array.isArray(data)) return;
    catalog.setGreatBuildingNames(toGreatBuildingNames(data));
    greatBuildings.noteContributions(toGreatBuildingListRows(data, session.current?.playerId), toListOwners(data));
  });
  ingestion.on('BonusService', 'getLimitedBonuses', ({ data }) => {
    greatBuildings.setLimitedBonuses(toLimitedBonuses(data));
  });
  // A great building of another player the player invested in levelled up, named by owner and display name only
  // (recorded 2026-10-23: great_building_contribution with level and rank). An own one levelling sends
  // entity_level_up instead, which is not read: the contribution's response already brings the new level.
  ingestion.on('OtherPlayerService', 'newEvent', ({ data }) => {
    const up = toGreatBuildingLevelUp(data as GameEvent);
    if (up) greatBuildings.leveled(up.owner, catalog.greatBuildingsNamed(up.name), up.level, up.rank);
  });

  // debt: own city ignores placeBuilding, removeBuilding and moveEntity. ceiling: own city is stale after building
  // changes until reload. upgrade: handle them with the first feature that reads the own city (phase 3).
}
