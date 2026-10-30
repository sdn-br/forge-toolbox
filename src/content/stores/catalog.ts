import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { BuildingDef, CityGrid } from '../model/catalog';

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

  constructor(private bus: ToolboxBus) {}

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
