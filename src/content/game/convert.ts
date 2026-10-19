// Game format → own model. Nothing outside src/content/game sees the game format.
import { buildingDefId, eraId, guildId, type PlayerId, playerId, type WorldId } from '../../shared/ids';
import type { GuildRef } from '../../shared/model';
import type { VisitInfo } from '../stores/cities';
import type { Building, BuildingState, City, Product } from '../stores/city-model';
import type { PlayerObservation } from '../stores/players';
import type { Session } from '../stores/session';
import type {
  GameCityEntity,
  GamePlayer,
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
        motivated: s.is_motivated,
        boosted: s.boosted,
      };
    case 'ProductionFinishedState':
      return { kind: 'finished', product: product(), motivated: s.is_motivated };
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

export function toCity(
  world: WorldId,
  owner: PlayerId,
  era: string,
  map: string | undefined,
  entities: GameCityEntity[] | undefined,
  now: number,
): City {
  const buildings = new Map<number, Building>();
  for (const e of entities ?? []) {
    const b = toBuilding(e, owner);
    if (b) buildings.set(b.id, b);
  }
  return { world, owner, era: eraId(era), map: map ?? 'main', takenAt: now, buildings };
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

export function toVisitInfo(p: GamePlayer, now: number): VisitInfo {
  return {
    neighbor: p.is_neighbor === true,
    friend: p.is_friend === true,
    guildMember: p.is_guild_member === true,
    canPlunder: p.canSabotage,
    nextInteractionAt: typeof p.next_interaction_in === 'number' ? now + p.next_interaction_in * 1000 : undefined,
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
