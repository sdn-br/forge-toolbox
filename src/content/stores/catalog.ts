import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Product } from './city-model';

export interface Boost {
  type: string;
  feature: string;
  value: number;
}

export type BoostsByEra = Record<string, Boost[]>;

/** Area relative to the top left corner of a building, both corners inclusive. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LevelBonus {
  level: number;
  boosts: BoostsByEra;
}

export interface BuildingDef {
  id: BuildingDefId;
  name: string;
  generic: boolean;
  type?: string;
  size: { width: number; length: number };
  /** street level the building needs to work, 0 for none; missing when the definition does not tell */
  street?: number;
  flags: { motivatable: boolean; polishable: boolean; plunderable: boolean };
  boostsByEra: BoostsByEra;
  productByEra: Record<string, Product>;
  /** set membership: bonus level n needs n different adjacent buildings of the same set */
  set?: { id: string; bonuses: LevelBonus[] };
  /** chain membership: `links` are where the next link has to sit, `bonuses` what this link adds once connected */
  chain?: { id: string; start: boolean; links: Rect[]; bonuses: LevelBonus[] };
  /** great buildings only: the era of the building itself and the Forge points of the first levels */
  greatBuilding?: GreatBuildingDef;
}

export interface GreatBuildingDef {
  /** era of the building (`requirements.min_era`), `AllAge` for the buildings of every era */
  era: string;
  /** `strategy_points_for_upgrade`: Forge points from level i to i + 1, index 0-based; the game lists ten */
  levelCosts: number[];
}

/**
 * Era-bound values of a definition. Multi-age definitions carry every era, era-bound ones only their own,
 * so the city era is used when present, otherwise the single era the definition has. `AllAge` always counts.
 */
function eraKey(byEra: Record<string, unknown>, era: EraId): string | undefined {
  if (era in byEra) return era;
  const own = Object.keys(byEra).filter((k) => k !== 'AllAge');
  return own.length === 1 ? own[0] : undefined;
}

export function boostsAt(byEra: BoostsByEra, era: EraId): Boost[] {
  const key = eraKey(byEra, era);
  return [...(byEra.AllAge ?? []), ...(key && key !== 'AllAge' ? (byEra[key] ?? []) : [])];
}

export function boostsFor(def: BuildingDef, era: EraId): Boost[] {
  return boostsAt(def.boostsByEra, era);
}

/** The main city grid from the metadata `grid-<hash>`: top left tiles of its 4 × 4 blocks. */
export interface CityGrid {
  width: number;
  height: number;
  blocks: { x: number; y: number }[];
}

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
