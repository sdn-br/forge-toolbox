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

/** When the session player may attack or plunder this player again, as the game last reported it. */
export interface AttackTimer {
  /** a won battle that is not plundered yet (the game's `canSabotage`) */
  canPlunder: boolean;
  /** until then the player cannot be attacked again; also the end of the plunder window (`next_interaction_in`) */
  nextInteractionAt?: number;
}

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
  /** missing until a source that carries the timers reported the player */
  attack?: AttackTimer;
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

/** A city shield of another player: until `expiresAt` the city cannot be attacked. */
export interface CityShield {
  world: WorldId;
  player: PlayerId;
  expiresAt: number;
}

export interface IncomingTotals {
  /** battles against the own defense, held ones included */
  battles: number;
  held: number;
  plunders: number;
}

/** A tab of the notes; the player group is not stored, it always exists. */
export interface NoteGroup {
  world: WorldId;
  id: string;
  name: string;
  sort: number;
}

/** A page of the notes. A player page belongs to the player group, one per player. */
export interface NotePage {
  world: WorldId;
  id: string;
  group: string;
  /** a player page keeps the last known name here, shown only when the player store does not know the player */
  title: string;
  /** Markdown source */
  text: string;
  sort: number;
  updatedAt: number;
  player?: PlayerId;
}

/**
 * The last known state of a great building of another player, kept for the snipe helper. Written whenever the
 * session player opens or updates the construction of that building.
 */
export interface KnownGreatBuilding {
  world: WorldId;
  owner: PlayerId;
  /** the building in the owner's city */
  entityId: number;
  cityEntityId: BuildingDefId;
  level: number;
  invested: number;
  required: number;
  /** lowest rate in percent of all places the session player could take then; missing when none was free */
  bestRate?: number;
  seenAt: number;
}
