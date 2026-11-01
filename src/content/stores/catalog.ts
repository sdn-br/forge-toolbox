import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { BuildingDef, CityGrid, UnitType } from '../model/catalog';

/** reads the metadata file of a definition from the CDN through the service worker, with its cache */
export interface BuildingDefLoader {
  /** undefined when the file cannot be read or holds no definition */
  load(id: BuildingDefId, url: string): Promise<BuildingDef | undefined>;
}

/** the game often loads the definition of a building it shows itself; this long the catalog waits for it */
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
  /** asked for by `buildingName` and not loaded yet */
  private wanted = new Set<BuildingDefId>();
  /** loaded or on the way in this session, each id once */
  private asked = new Set<BuildingDefId>();
  private loadQueued = false;

  setBuildingFiles(files: Map<BuildingDefId, string>): void {
    this.files = files;
    if (this.wanted.size) this.queueLoad();
  }

  /**
   * The name of a building definition. One the game has not loaded comes from the CDN: undefined for now,
   * `catalog.updated` once it is there.
   */
  buildingName(id: BuildingDefId): string | undefined {
    const name = this.defs.get(id)?.name;
    if (name === undefined && this.loader && !this.asked.has(id)) {
      this.wanted.add(id);
      this.queueLoad();
    }
    return name;
  }

  private queueLoad(): void {
    if (this.loadQueued) return;
    this.loadQueued = true;
    setTimeout(() => {
      this.loadQueued = false;
      this.loadWanted();
    }, LOAD_DELAY);
  }

  // debt: a file that fails is not asked for again in this session. ceiling: a name stays raw after a failed
  // download until reload. upgrade: retry with a pause if failed downloads are seen in the game.
  private loadWanted(): void {
    for (const id of this.wanted) {
      if (this.defs.has(id)) {
        this.wanted.delete(id);
        continue;
      }
      // the lookup comes at start; an id it lacks waits for the next one, so for the next session
      const url = this.files.get(id);
      if (!url || !this.loader) continue;
      this.wanted.delete(id);
      this.asked.add(id);
      this.loader
        .load(id, url)
        .then((def) => {
          // the game may have loaded it meanwhile
          if (def && !this.defs.has(id)) this.add(def);
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
