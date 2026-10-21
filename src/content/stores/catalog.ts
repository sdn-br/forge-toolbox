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

export function productFor(def: BuildingDef, era: EraId): Product | undefined {
  const key = eraKey(def.productByEra, era);
  return key ? def.productByEra[key] : def.productByEra.AllAge;
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

  private eraOrder: EraId[] = [];

  /** Eras in game order with their names. The order turns a building level into its era. */
  setEras(eras: { id: EraId; name: string }[]): void {
    this.eraOrder = eras.map((e) => e.id);
    for (const e of eras) this.eras.set(e.id, e.name);
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
