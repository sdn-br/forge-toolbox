// Which game response feeds which store. One place, so every response has exactly one owner.
import { eraId, type PlayerId, type WorldId } from '../../shared/ids';
import type { Ingestion } from '../core/ingestion';
import type { BattleStore } from '../stores/battles';
import type { CatalogStore } from '../stores/catalog';
import type { CityStore } from '../stores/cities';
import type { Building } from '../stores/city-model';
import type { PlayerObservation, PlayerStore } from '../stores/players';
import type { PlunderStore } from '../stores/plunders';
import type { SessionStore } from '../stores/session';
import { toBuildingDef } from './building-defs';
import {
  isBattleState,
  isOwnPvpBattle,
  isPlunderedEntity,
  isRepelledPlunder,
  plunderLoot,
  toBattle,
  toBuilding,
  toCity,
  toObservation,
  toPlunder,
  toRepelledPlunder,
  toSession,
  toVisitInfo,
} from './convert';
import type {
  GameBattle,
  GameCityEntity,
  GameEntityIcon,
  GameEra,
  GameSocialList,
  GameStartup,
  GameVisit,
} from './game-types';

export interface GameHandlerDeps {
  world: WorldId;
  now: () => number;
  session: SessionStore;
  players: PlayerStore;
  cities: CityStore;
  catalog: CatalogStore;
  battles: BattleStore;
  plunders: PlunderStore;
}

const observations = (list: unknown) =>
  (Array.isArray(list) ? list : []).map(toObservation).filter((o): o is PlayerObservation => o !== null);

export function registerGameHandlers(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, now, session, players, cities, catalog, battles, plunders } = deps;

  ingestion.on('StartupService', 'getData', ({ data }) => {
    const d = data as GameStartup;
    const s = toSession(world, d.user_data);
    if (!s) return;
    const goods: Record<string, string> = {};
    for (const g of d.goodsList ?? []) if (g.id && g.name) goods[g.id] = g.name;
    catalog.setResourceNames(goods);
    session.start(s);
    cities.setOwn(toCity(world, s.playerId, s.era, d.city_map?.gridId, d.city_map?.entities, now()));
  });

  ingestion.on('OtherPlayerService', 'getSocialList', ({ data }) => {
    const d = data as GameSocialList;
    players.applySocialList(world, {
      neighbor: observations(d.neighbours),
      guildMember: observations(d.guildMembers),
      friend: observations(d.friends),
    });
  });

  ingestion.on('OtherPlayerService', 'visitPlayer', ({ data }) => {
    const d = data as GameVisit;
    const o = d.other_player ? toObservation(d.other_player) : null;
    if (!o || !d.other_player) return;
    players.apply(world, [o], 'visit');
    const era = d.other_player_era ?? d.other_player.era ?? '';
    const city = toCity(world, o.id, era, d.city_map?.gridId, d.city_map?.entities, now());
    cities.setVisited({ ...city, visit: toVisitInfo(d.other_player, now()) });
  });

  // comes with battles and other interactions, for example in the same response as the battle against that player
  ingestion.on('OtherPlayerService', 'updatePlayer', ({ data }) => {
    players.apply(world, observations(data), 'update');
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

  // A plunder comes as several entries of one response (seen 2026-10-19): plunderById has the loot, the reset the
  // plundered building with its owner, and showEntityIcons marks the building when Double Loot doubled the loot.
  // The order varies, so they are joined once the response is done. rewardPlunder repeats the loot and is ignored.
  // A repelled plunder (seen 2026-10-20) has no reset and no loot; only the updatePlayer of the same response names
  // the opponent, so it counts only when that names exactly one player.
  let loot: Record<string, number> | null = null;
  let repelled = false;
  let plundered: GameCityEntity | undefined;
  const doubled = new Set<number>();
  const updated: PlayerId[] = [];
  ingestion.on('OtherPlayerService', 'plunderById', ({ data }) => {
    loot = plunderLoot(data);
    repelled = isRepelledPlunder(data);
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
    if (loot && plundered) {
      plunders.record(toPlunder(world, now(), plundered, loot, doubled.has(plundered.id as number)));
    }
    const [opponent, ...more] = updated;
    const me = session.current?.playerId;
    if (repelled && opponent !== undefined && more.length === 0 && me !== undefined && opponent !== me) {
      plunders.record(toRepelledPlunder(world, now(), opponent));
    }
    loot = null;
    repelled = false;
    plundered = undefined;
    doubled.clear();
    updated.length = 0;
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
  ingestion.onMeta('building_entity_', (file) => {
    if (file.name === 'building_entity_lookup') return;
    const def = toBuildingDef(file.json);
    if (def) catalog.add(def);
  });

  ingestion.onMeta('research_eras', (file) => {
    const eras = ((Array.isArray(file.json) ? file.json : []) as GameEra[]).flatMap((e) =>
      e.era ? [{ id: eraId(e.era), name: e.name ?? e.era }] : [],
    );
    catalog.setEras(eras);
  });

  // debt: own city ignores placeBuilding, removeBuilding and moveEntity. ceiling: own city is stale after building
  // changes until reload. upgrade: handle them with the first feature that reads the own city (phase 3).
}
