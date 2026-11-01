export interface BuildingDefFileData {
  id: string;
  /** on the Inno CDN; it carries the file's hash, so a changed definition has a new URL */
  url: string;
  json: unknown;
}

export interface BuildingDefsApi {
  /** every cached metadata file of a building definition */
  'buildingDefs.all': { arg: Record<string, never>; result: { files: BuildingDefFileData[] } };
  /**
   * The metadata file `building_entity_<id>` at `url`: from the database when this URL was read before, else
   * downloaded and kept in place of an older file of the same id. `json` is missing when the file could not be read or
   * is no JSON; a URL off the CDN is refused.
   */
  'buildingDefs.file': { arg: { id: string; url: string }; result: { json?: unknown } };
  /** keeps files the game loaded itself, each in place of an older file of its id; files off the CDN are skipped */
  'buildingDefs.put': { arg: { files: BuildingDefFileData[] }; result: Record<string, never> };
}
