// Domain types that cross the content script / service worker boundary.
import type { BuildingDefId, EraId, GuildId, PlayerId, WorldId } from './ids';

export interface GuildRef {
  id: GuildId;
  name: string;
  flag?: string;
}

export interface Relations {
  neighbor: boolean;
  guildMember: boolean;
  friend: boolean;
}

export type PlayerSource = 'socialList' | 'visit' | 'update' | 'ranking' | 'gbg' | 'event';

export interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  score: number;
  rank: number;
  active: boolean;
  guild?: GuildRef;
  relations: Relations;
  firstSeenAt: number;
  seenAt: number;
  source: PlayerSource;
}

export type BattleResult = 'won' | 'lost' | 'surrendered';

export interface BattleUnit {
  unitTypeId: string;
  startHp: number;
  endHp: number;
}

export interface BattleSide {
  /** raw bonus sums by game type, from the first unit of the side; measured values are derived from these */
  bonuses: Record<string, number>;
  units: BattleUnit[];
}

/** A PvP battle the session player started as the attacker. */
export interface Battle {
  world: WorldId;
  battleId: number;
  at: number;
  opponent: PlayerId;
  result: BattleResult;
  auto: boolean;
  rounds: number;
  era: EraId;
  attacker: BattleSide;
  defender: BattleSide;
}

/** A building in another city the session player plundered. */
export interface Plunder {
  world: WorldId;
  at: number;
  opponent: PlayerId;
  /** the building in the opponent's city */
  entityId: number;
  cityEntityId: BuildingDefId;
  /** loot as the game reports it, Double Loot already included */
  resources: Record<string, number>;
  doubleLoot: boolean;
}

export interface PlunderTotals {
  count: number;
  /** Forge points over all counted plunders */
  fp: number;
}
