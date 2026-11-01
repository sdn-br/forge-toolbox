export interface BuildingDefsApi {
  /**
   * The metadata file of one building definition, `building_entity_<id>` at `url` on the Inno CDN: from the database
   * when this URL was read before, else downloaded and kept in place of an older file of the same id. The URL carries
   * the file's hash, so a changed definition has a new URL. `json` is missing when the file could not be read or is no
   * JSON, or with `cachedOnly` when it is not in the database; a URL off the CDN is refused.
   */
  'buildingDefs.file': { arg: { id: string; url: string; cachedOnly?: boolean }; result: { json?: unknown } };
}
