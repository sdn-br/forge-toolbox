import type { BuildingDefFileData } from '../../shared/model';

export interface BuildingDefsApi {
  /** every cached metadata file of a building definition */
  'buildingDefs.all': { arg: Record<string, never>; result: { files: BuildingDefFileData[] } };
  /**
   * The metadata file `building_entity_<id>` at `url`: from the database when this URL was read before, else
   * downloaded and kept in place of an older file of the same id. `json` is missing when the file could not be read or
   * is no JSON; a URL off the CDN is refused.
   */
  'buildingDefs.file': { arg: { id: string; url: string }; result: { json?: unknown } };
  /** the buildings of stored plunders, attacks on the own city and great buildings whose file the cache lacks */
  'buildingDefs.missing': { arg: Record<string, never>; result: { ids: string[] } };
  /**
   * Deletes the cached files whose id is not in `current` or whose URL differs from the one listed there: the game's
   * `building_entity_lookup` as pairs of id and URL. Answers with the number of rows deleted.
   */
  'buildingDefs.prune': { arg: { current: { id: string; url: string }[] }; result: { deleted: number } };
  /** keeps files the game loaded itself, each in place of an older file of its id; files off the CDN are skipped */
  'buildingDefs.put': { arg: { files: BuildingDefFileData[] }; result: Record<string, never> };
}
