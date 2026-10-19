// Which game response feeds which store. One place, so every response has exactly one owner.
import { eraId, type WorldId } from '../../shared/ids';
import type { Ingestion } from '../core/ingestion';
import type { BattleStore } from '../stores/battles';
import type { CatalogStore } from '../stores/catalog';
import type { CityStore } from '../stores/cities';
import type { Building } from '../stores/city-model';
import type { PlayerObservation, PlayerStore } from '../stores/players';
import type { SessionStore } from '../stores/session';
import { toBuildingDef } from './building-defs';
import {
  isBattleState,
  isOwnPvpBattle,
  toBattle,
  toBuilding,
  toCity,
  toObservation,
  toSession,
  toVisitInfo,
} from './convert';
import type { GameBattle, GameCityEntity, GameEra, GameSocialList, GameStartup, GameVisit } from './game-types';

export interface GameHandlerDeps {
  world: WorldId;
  now: () => number;
  session: SessionStore;
  players: PlayerStore;
  cities: CityStore;
  catalog: CatalogStore;
  battles: BattleStore;
}

const observations = (list: unknown) =>
  (Array.isArray(list) ? list : []).map(toObservation).filter((o): o is PlayerObservation => o !== null);

export function registerGameHandlers(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { world, now, session, players, cities, catalog, battles } = deps;

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
