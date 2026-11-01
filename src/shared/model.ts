// Domain types that cross the content script / service worker boundary, or the layers of the content script.
import type { RankingRow } from '../content/model/great-building';
import type { BuildingDefId, EraId, GuildId, PlayerId, WorldId } from './ids';

/** The own player of the game page, as the startup data name it. */
export interface Session {
  world: WorldId;
  playerId: PlayerId;
  name: string;
  era: EraId;
  guild?: GuildRef;
}

/** A city the game can show: the own one, or the city of this visited player. */
export type CityKey = 'own' | PlayerId;

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

/** `legacy`: taken over from the old toolbox; `list`: known only from a great building list (id, name, avatar) */
export type PlayerSource =
  | 'socialList'
  | 'visit'
  | 'update'
  | 'ranking'
  | 'gbg'
  | 'event'
  | 'friend'
  | 'legacy'
  | 'list';

/** what the session player may put on a player or a great building: a star, or an ignore */
export type MarkKind = 'marked' | 'ignored';

/** what the session player may put on a player for PvP, separate from the great building marks: good to plunder, or not to attack */
export type PvpMarkKind = 'plunderWorthy' | 'noAttack';

/** When the session player may attack or plunder this player again, as the game last reported it. */
export interface AttackTimer {
  /** a won battle that is not plundered yet (the game's `canSabotage`) */
  canPlunder: boolean;
  /** until then the player cannot be attacked again; also the end of the plunder window (`next_interaction_in`) */
  nextInteractionAt?: number;
}

/**
 * A player as the game last reported them. The fields a great building list does not carry are missing until a source
 * that carries the whole player reported them.
 */
export interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar?: string;
  cityName?: string;
  era?: EraId;
  score?: number;
  rank?: number;
  active?: boolean;
  guild?: GuildRef;
  relations: Relations;
  /** the session player put a star on the player; only the player removes it, never a change of relations */
  marked?: boolean;
  /** the session player ignores the player: their rows are hidden and do not count; removed only by hand, like `marked` */
  ignored?: boolean;
  /**
   * when the session player last set or removed the star or the ignore; the import uses it to pick the newer marks,
   * a row without it counts as oldest
   */
  marksAt?: number;
  /** the session player finds the player good to plunder; separate from `marked`, excludes `noAttack` */
  plunderWorthy?: boolean;
  /** the session player does not want to attack the player (the defense is too strong); excludes `plunderWorthy` */
  noAttack?: boolean;
  /** like `marksAt`, for the two PvP marks only; the import picks them independently of the great building marks */
  pvpMarksAt?: number;
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

/** A PvP battle the session player fought as the attacker. */
export interface FoughtBattle {
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
  /** the `at` of the plunder this won battle allowed; the plunder's key is `[world, opponent, plunderAt]` */
  plunderAt?: number;
}

/**
 * A won battle a plunder proves when no fought battle is stored for it (old data, a battle before the recording
 * started). It took place by the time of the plunder at the latest, so `at` is the plunder's time; units and values
 * are unknown. The battle id is the negative time, like the battles of the old toolbox.
 */
export interface InferredBattle {
  world: WorldId;
  battleId: number;
  at: number;
  opponent: PlayerId;
  result: 'won';
  inferred: true;
  plunderAt: number;
}

/** A PvP battle of the session player as the attacker, fought or inferred from a plunder. */
export type Battle = FoughtBattle | InferredBattle;

export const isFought = (battle: Battle): battle is FoughtBattle => !('inferred' in battle);

/** a battle as the battle list returns it, with its plunder when it has one */
export type BattleWithPlunder = Battle & { plunder?: Plunder };

/** which battles a battle list or its summary covers */
export interface BattleFilter {
  /** only battles against these players; missing means all */
  opponents?: PlayerId[];
  /** only battles with a plunder */
  withPlunder?: boolean;
}

/** what the battle list counts over all its pages */
export interface BattleSummary {
  battles: number;
  /** inferred battles count as won */
  won: number;
  /** successful plunders */
  plunders: number;
  repelled: number;
  /** Forge points of the successful plunders */
  fp: number;
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

/** The session player's place in a great building of another player. */
export interface OwnContribution {
  rank: number;
  /** own deposit */
  forgePoints: number;
  /** net reward of the place, before the own Arc bonus */
  reward: number;
  /** when it was seen */
  at: number;
}

/**
 * The last known state of a great building of another player, kept for the snipe helper. Written when the session
 * player opens or updates the construction of that building, and from great building lists.
 */
export interface KnownGreatBuilding {
  world: WorldId;
  owner: PlayerId;
  /** the building in the owner's city */
  entityId: number;
  cityEntityId: BuildingDefId;
  /** from the newer source, the building or a list */
  level: number;
  invested: number;
  required: number;
  /** only from an opened building; a list brings neither */
  maxLevel?: number;
  connected?: boolean;
  /** only from an opened building; missing after a list brought a new level */
  rankings?: RankingRow[];
  /** the level of the building the rankings belong to */
  rankingsLevel?: number;
  /** when the rankings came */
  rankingsAt?: number;
  /**
   * sum of the deposits in the stored rankings when the building was opened, owner included; tells whether the rankings
   * still match the progress (current or stale)
   */
  rankingsInvested?: number;
  /** the session player invested here (own row in the rankings, or the town hall list); such a row is never pruned */
  ownContribution?: boolean;
  /**
   * the session player's place in the current level: from the town hall list or the own row of the rankings of an
   * opened building; gone when a building is seen without the own row or on another level
   */
  contribution?: OwnContribution;
  /** the session player marked the building with a star; such a row is never pruned, and only the player removes it */
  marked?: boolean;
  /** the session player ignores the building; kept and never pruned exactly like `marked` */
  ignored?: boolean;
  /**
   * when the session player last set or removed the star or the ignore; the import uses it to pick the newer marks,
   * a row without it counts as oldest
   */
  marksAt?: number;
  /**
   * start point of the growth in the investments: the progress (`invested`) when the building was last seen open, or
   * from the town hall list for a building never opened, which has no rankings; equals `rankingsInvested` only when both
   * come from an opening whose rankings cover exactly `invested`
   */
  growthBase?: number;
  /**
   * Forge points paid in between the last two sightings of the same level (a list or the open building); missing when
   * nothing grew or the level is new
   */
  growth?: number;
  /** last seen, in the building or in a list */
  seenAt: number;
}

/** One day of a player at foestats: the values of its daily snapshot. Past days never change. */
export interface FoestatsDay {
  world: WorldId;
  player: PlayerId;
  /** local day of the snapshot, `YYYY-MM-DD` */
  date: string;
  points?: number;
  battles?: number;
  /** foestats' own status of the player on a snapshot day; not indexed, older rows lack it */
  active?: boolean;
}

/** The last time foestats was asked about a player. */
export interface FoestatsFetch {
  world: WorldId;
  player: PlayerId;
  /** the foestats day it was asked for, see `foestatsDay` */
  day: string;
  at: number;
  /** foestats answered; false only in records of older versions, which kept a failed request per player */
  ok: boolean;
  /** foestats does not know the player; older records lack it */
  unknown?: boolean;
}
