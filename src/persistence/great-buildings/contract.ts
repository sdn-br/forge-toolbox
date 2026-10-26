import type { BuildingDefId, PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding, MarkKind } from '../../shared/model';

/** A row of a great building list: the state of one building without its rankings. */
export interface GreatBuildingListRow {
  owner: PlayerId;
  entityId: number;
  cityEntityId: BuildingDefId;
  level: number;
  invested: number;
  required: number;
  /** the session player's place, when the list names one: an own contribution */
  rank?: number;
  /** own deposit and net reward of that place; the town hall list (getContributions) brings them */
  forgePoints?: number;
  reward?: number;
}

export interface GreatBuildingsApi {
  /** a row of an opened building replaces what was known, except the own contribution mark, the star and the ignore with their time, which stay */
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
  /** when the town hall list last came in the world, if ever */
  'greatBuildings.contributionsAt': { arg: { world: WorldId }; result: number | undefined };
  /** deletes what was seen before `before`, except buildings with an own contribution, marked and ignored ones */
  'greatBuildings.prune': { arg: { world: WorldId; before: number }; result: undefined };
  /**
   * puts or removes the star or the ignore of a stored building and sets `marksAt` to `at`; false when no such
   * building is stored
   */
  'greatBuildings.setFlag': {
    arg: { world: WorldId; owner: PlayerId; entityId: number; flag: MarkKind; value: boolean; at: number };
    result: boolean;
  };
  /** the buildings of the world carrying the star or the ignore */
  'greatBuildings.flagged': {
    arg: { world: WorldId; flag: MarkKind };
    result: { owner: PlayerId; entityId: number }[];
  };
  /** the known buildings of one owner, or of all owners of the world */
  'greatBuildings.list': { arg: { world: WorldId; owner?: PlayerId }; result: KnownGreatBuilding[] };
}
