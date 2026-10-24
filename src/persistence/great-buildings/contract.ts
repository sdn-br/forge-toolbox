import type { BuildingDefId, PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';

/** A row of a great building list: the state of one building without its rankings. */
export interface GreatBuildingListRow {
  owner: PlayerId;
  entityId: number;
  cityEntityId: BuildingDefId;
  level: number;
  invested: number;
  required: number;
}

export interface GreatBuildingsApi {
  /** a row of an opened building replaces what was known, except the own contribution mark, which stays */
  'greatBuildings.put': { arg: { rows: KnownGreatBuilding[] }; result: undefined };
  /** rows of the great building list of a player, seen at `at`; a row older than what is known changes nothing */
  'greatBuildings.putList': { arg: { world: WorldId; rows: GreatBuildingListRow[]; at: number }; result: undefined };
  /**
   * the town hall list of the buildings the session player invested in: marks each row as own contribution and writes
   * it like a list row, then drops every own contribution of the world that is no longer in it
   */
  'greatBuildings.putContributions': {
    arg: { world: WorldId; rows: GreatBuildingListRow[]; at: number };
    result: undefined;
  };
  /** deletes what was seen before `before`, except buildings with an own contribution */
  'greatBuildings.prune': { arg: { world: WorldId; before: number }; result: undefined };
  /** the known buildings of one owner, or of all owners of the world */
  'greatBuildings.list': { arg: { world: WorldId; owner?: PlayerId }; result: KnownGreatBuilding[] };
}
