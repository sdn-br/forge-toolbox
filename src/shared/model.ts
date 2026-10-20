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

export type PlunderOutcome = 'plundered' | 'repelled';

/** A plunder of the session player in another city, successful or repelled. */
export interface Plunder {
  world: WorldId;
  at: number;
  opponent: PlayerId;
  outcome: PlunderOutcome;
  /** the building in the opponent's city; the game names none for a repelled plunder */
  entityId?: number;
  cityEntityId?: BuildingDefId;
  /** loot as the game reports it, Double Loot already included; empty when repelled */
  resources: Record<string, number>;
  doubleLoot: boolean;
}

export interface PlunderTotals {
  /** successful plunders */
  count: number;
  repelled: number;
  /** Forge points over all counted successful plunders */
  fp: number;
}

export type IncomingKind = 'battle' | 'plunder';

/** An attack of another player on the session player's city: a battle against its defense or a plunder. */
export interface IncomingAttack {
  world: WorldId;
  kind: IncomingKind;
  /** the game's battle id of a battle, the event id of a plunder */
  key: number;
  at: number;
  attacker: PlayerId;
  /** battle only: whether the own defense held */
  defense?: 'held' | 'broken';
  /** plunder only: the plundered own building */
  cityEntityId?: BuildingDefId;
}

export interface IncomingTotals {
  /** battles against the own defense, held ones included */
  battles: number;
  held: number;
  plunders: number;
}
