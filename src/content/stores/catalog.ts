import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { BuildingDef, CityGrid, UnitType } from '../model/catalog';

/** reads the metadata file of a definition from the CDN through the service worker, with its cache */
export interface BuildingDefLoader {
  /** from the cache only, without a download; undefined when it is not there */
  cached(id: BuildingDefId, url: string): Promise<BuildingDef | undefined>;
  /** from the cache, else downloaded; undefined when the file cannot be read or holds no definition */
  load(id: BuildingDefId, url: string): Promise<BuildingDef | undefined>;
}

/** the game often loads the definition of a building it shows itself; this long the catalog waits before a download */
export const LOAD_DELAY = 1000;

/**
 * Definitions the game loaded in this session. The game loads every definition it needs again in each session
 * (seen 2026-10-19: ~110 at start, the missing ones on each city visit), so nothing is persisted.
 */
export class CatalogStore {
  private defs = new Map<BuildingDefId, BuildingDef>();
  private names = new Map<string, string>();
  private eras = new Map<string, string>();
  private pending: BuildingDefId[] = [];
  private queued = false;

  constructor(
    private bus: ToolboxBus,
    private loader?: BuildingDefLoader,
  ) {}

  /** where each definition's file lies on the CDN, from the game's `building_entity_lookup` */
  private files = new Map<BuildingDefId, string>();
  /** asked for by `buildingName` before the lookup came */
  private wanted = new Set<BuildingDefId>();
  /** not in the cache, to be downloaded after the pause */
  private downloads = new Set<BuildingDefId>();
  /** read or on the way in this session, each id once */
  private asked = new Set<BuildingDefId>();
  private downloadQueued = false;

  setBuildingFiles(files: Map<BuildingDefId, string>): void {
    this.files = files;
    for (const id of this.wanted) {
      const url = files.get(id);
      // an id the lookup lacks waits for the next one, so for the next session
      if (!url) continue;
      this.wanted.delete(id);
      this.fromCache(id, url);
    }
  }

  /**
   * The name of a building definition. One the game has not loaded comes from the cache in the service worker at once,
   * else from the CDN after a pause: undefined for now, `catalog.updated` once it is there.
   */
  buildingName(id: BuildingDefId): string | undefined {
    const name = this.defs.get(id)?.name;
    if (name === undefined && this.loader && !this.asked.has(id)) {
      const url = this.files.get(id);
      if (url) this.fromCache(id, url);
      else this.wanted.add(id);
    }
    return name;
  }

  private fromCache(id: BuildingDefId, url: string): void {
    if (!this.loader) return;
    this.asked.add(id);
    this.loader
      .cached(id, url)
      .then((def) => {
        if (def) this.take(def);
        else {
          this.downloads.add(id);
          this.queueDownload();
        }
      })
      .catch((error) => logError(`reading the building definition ${id} failed`, error));
  }

  /** the game may have loaded it meanwhile */
  private take(def: BuildingDef): void {
    if (!this.defs.has(def.id)) this.add(def);
  }

  private queueDownload(): void {
    if (this.downloadQueued) return;
    this.downloadQueued = true;
    setTimeout(() => {
      this.downloadQueued = false;
      this.download();
    }, LOAD_DELAY);
  }

  // debt: a file that fails is not asked for again in this session. ceiling: a name stays raw after a failed
  // download until reload. upgrade: retry with a pause if failed downloads are seen in the game.
  private download(): void {
    for (const id of this.downloads) {
      this.downloads.delete(id);
      const url = this.files.get(id);
      if (this.defs.has(id) || !url || !this.loader) continue;
      this.loader
        .load(id, url)
        .then((def) => def && this.take(def))
        .catch((error) => logError(`loading the building definition ${id} failed`, error));
    }
  }

  get(id: BuildingDefId): BuildingDef | undefined {
    return this.defs.get(id);
  }

  /** Names of goods and other resources, from the startup data. */
  setResourceNames(names: Record<string, string>): void {
    for (const [id, name] of Object.entries(names)) this.names.set(id, name);
  }

  resourceName(id: string): string | undefined {
    return this.names.get(id);
  }

  private units = new Map<string, UnitType>();

  /** Unit types with their names in the game's language, era and class, from the metadata file `unit_types`. */
  setUnitTypes(types: UnitType[]): void {
    for (const u of types) this.units.set(u.id, u);
  }

  unitType(id: string): UnitType | undefined {
    return this.units.get(id);
  }

  private gbNames = new Map<BuildingDefId, string>();

  /** Display names of great buildings, from the game's lists of them; the definitions may not be loaded. */
  setGreatBuildingNames(names: Record<string, string>): void {
    for (const [id, name] of Object.entries(names)) this.gbNames.set(id as BuildingDefId, name);
  }

  /** the display name of a great building, else the name of its definition, else undefined */
  greatBuildingName(id: BuildingDefId): string | undefined {
    return this.gbNames.get(id) ?? this.defs.get(id)?.name;
  }

  /** all great buildings with this display name; the game names a building only so in some events */
  greatBuildingsNamed(name: string): BuildingDefId[] {
    const ids = new Set<BuildingDefId>();
    for (const [id, n] of this.gbNames) if (n === name) ids.add(id);
    for (const def of this.defs.values()) if (def.type === 'greatbuilding' && def.name === name) ids.add(def.id);
    return [...ids];
  }

  private eraOrder: EraId[] = [];

  /** Eras in game order with their names. The order turns a building level into its era. */
  setEras(eras: { id: EraId; name: string }[]): void {
    this.eraOrder = eras.map((e) => e.id);
    for (const e of eras) this.eras.set(e.id, e.name);
  }

  /** position of an era in game order; undefined while the eras or this era are unknown */
  eraIndex(era: EraId): number | undefined {
    const i = this.eraOrder.indexOf(era);
    return i < 0 ? undefined : i;
  }

  private grid?: CityGrid;

  cityGrid(): CityGrid | undefined {
    return this.grid;
  }

  setCityGrid(grid: CityGrid): void {
    this.grid = grid;
    this.bus.emit('catalog.grid', {});
  }

  eraByLevel(level: number): EraId | undefined {
    return this.eraOrder[level];
  }

  eraName(era: EraId): string {
    return this.eras.get(era) ?? era;
  }

  add(def: BuildingDef): void {
    this.defs.set(def.id, def);
    this.pending.push(def.id);
    // definitions arrive one file at a time, listeners hear about them once per batch
    if (this.queued) return;
    this.queued = true;
    setTimeout(() => {
      this.queued = false;
      this.bus.emit('catalog.updated', { defs: this.pending.splice(0) });
    }, 50);
  }
}
