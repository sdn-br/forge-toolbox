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
  /** a finished level the player looks at instead; places and Forge points only, nothing to calculate */
  past?: { level: number; rankings: RankingRow[] };
  /** a contribution made it level up since it was opened; the rankings are stale then */
  leveled?: { level: number; rank?: number };
  seenAt: number;
}
