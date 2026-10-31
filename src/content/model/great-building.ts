import type { BuildingDefId, PlayerId } from '../../shared/ids';

/** What a place of a construction pays out, net as the game names it, before the Arc bonus of the receiver. */
export interface PlaceReward {
  fp: number;
  blueprints: number;
  medals: number;
}

/**
 * A row of the ranking of a great building. The owner's row has no `rank`. An empty place has no `fp`, a place
 * without `reward` pays nothing (ranks past the paid ones). `player` is missing for empty places and deleted players.
 */
export interface RankingRow {
  rank?: number;
  player?: PlayerId;
  name: string;
  /** the session player's row */
  self: boolean;
  fp?: number;
  reward?: PlaceReward;
}

/** The great building itself, from the opening (`getOtherPlayerCityMapEntity`) or from a known city. */
export interface GreatBuildingEntity {
  owner: PlayerId;
  entityId: number;
  def: BuildingDefId;
  level: number;
  maxLevel: number;
  /** Forge points in the current level, owner included */
  invested: number;
  /** Forge points the current level needs */
  required: number;
  connected: boolean;
}

/** What a great building produces on the level after `level`, as the open construction told. */
export interface NextProduction {
  /** the building's level when the construction was opened */
  level: number;
  /** Forge points; missing when the next production is something else */
  fp?: number;
}

/** The construction window the player has open in the game. */
export interface Construction {
  owner: PlayerId;
  entityId: number;
  /** a great building of the session player */
  own: boolean;
  /** missing when neither the opening nor a known city told about the building */
  entity?: GreatBuildingEntity;
  /** rankings of the level being built */
  rankings: RankingRow[];
  /**
   * the building's level the rankings belong to, as known when they came; a building reported on a later level
   * without rankings keeps the old one. Missing when the building was unknown then.
   */
  rankingsLevel?: number;
  /** what the building produces on the level after `level`; missing without a known building */
  nextProduction?: NextProduction;
  /** a contribution made it level up and the rankings of the new level are unknown; they are stale then */
  leveled?: { level: number; rank?: number };
  seenAt: number;
}
