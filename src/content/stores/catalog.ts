import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { BuildingDef, CityGrid, UnitType } from '../model/catalog';

/** the metadata file of one building definition on the CDN; the URL carries the file's hash */
export interface BuildingDefFile {
  id: BuildingDefId;
  url: string;
  json: unknown;
}

/** the cache of definition files in the service worker, and the CDN behind it */
export interface BuildingDefLoader {
  /** every cached definition with the URL it was read from */
  all(): Promise<{ def: BuildingDef; url: string }[]>;
  /** from the cache, else downloaded; undefined when the file cannot be read or holds no definition */
  load(id: BuildingDefId, url: string): Promise<BuildingDef | undefined>;
  /** keeps files the game loaded itself, each in place of an older file of its id */
  save(files: BuildingDefFile[]): Promise<void>;
}

/** the game often loads the definition of a building it shows itself; this long the catalog waits before a download */
export const LOAD_DELAY = 1000;

/** files the game loaded are written to the cache together, once per this many ms */
const SAVE_DELAY = 50;

/**
 * Definitions of this session: the cache in the service worker at start, then what the game loads (seen 2026-10-19:
 * ~110 at start, the missing ones on each city visit), and what a box asks for by name, downloaded from the CDN.
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
  private files?: Map<BuildingDefId, string>;
  /** the URL of each file in the cache; a file of the game with the same URL needs no write */
  private cachedUrls = new Map<BuildingDefId, string>();
  /** read from the cache and not yet checked against the lookup */
  private unchecked = new Set<BuildingDefId>();
  /** asked for by `buildingName`, downloaded after the pause */
  private downloads = new Set<BuildingDefId>();
  /** downloaded or on the way in this session, each id once */
  private asked = new Set<BuildingDefId>();
  private downloadQueued = false;
  private saves = new Map<BuildingDefId, BuildingDefFile>();
  private saveQueued = false;

  /** reads the cache of definition files, before the game's traffic comes in */
  async loadCache(): Promise<void> {
    if (!this.loader) return;
    const cached = await this.loader.all();
    for (const { def, url } of cached) {
      // the game may have been quicker
      if (this.defs.has(def.id)) continue;
      this.cachedUrls.set(def.id, url);
      this.unchecked.add(def.id);
      this.add(def);
    }
    // a lookup that came first finds the stale ones now
    if (this.files) this.dropStale(this.files);
  }

  setBuildingFiles(files: Map<BuildingDefId, string>): void {
    this.files = files;
    this.dropStale(files);
    if (this.downloads.size) this.queueDownload();
  }

  /**
   * A cached definition whose file has a new URL (an update of the game changed it) or is no longer listed leaves the
   * catalog; the game or `buildingName` loads the current one.
   */
  private dropStale(files: Map<BuildingDefId, string>): void {
    for (const id of this.unchecked) {
      if (files.get(id) !== this.cachedUrls.get(id)) this.defs.delete(id);
    }
    this.unchecked.clear();
  }

  /** a definition the game loaded; its file goes to the cache unless it is there already */
  addFromGame(def: BuildingDef, file: BuildingDefFile): void {
    this.unchecked.delete(def.id);
    this.add(def);
    if (!this.loader || this.cachedUrls.get(def.id) === file.url) return;
    this.cachedUrls.set(def.id, file.url);
    this.saves.set(def.id, file);
    if (this.saveQueued) return;
    this.saveQueued = true;
    setTimeout(() => {
      this.saveQueued = false;
      const files = [...this.saves.values()];
      this.saves.clear();
      this.loader?.save(files).catch((error) => logError('caching building definitions failed', error));
    }, SAVE_DELAY);
  }

  /**
   * The name of a building definition. One the game has not loaded and the cache lacks comes from the CDN after a
   * pause: undefined for now, `catalog.updated` once it is there.
   */
  buildingName(id: BuildingDefId): string | undefined {
    const name = this.defs.get(id)?.name;
    if (name === undefined && this.loader && !this.asked.has(id) && !this.downloads.has(id)) {
      this.downloads.add(id);
      this.queueDownload();
    }
    return name;
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
    // the lookup comes at start; until then the ids wait for it
    if (!this.files || !this.loader) return;
    for (const id of this.downloads) {
      const url = this.files.get(id);
      // an id the lookup lacks waits for the next one, so for the next session
      if (!url) continue;
      this.downloads.delete(id);
      if (this.defs.has(id)) continue;
      this.asked.add(id);
      this.loader
        .load(id, url)
        .then((def) => {
          if (!def) return;
          // the service worker cached it
          this.cachedUrls.set(id, url);
          // the game may have loaded it meanwhile
          if (!this.defs.has(id)) this.add(def);
        })
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
