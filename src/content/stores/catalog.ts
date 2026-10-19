import type { BuildingDefId, EraId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Product } from './city-model';

export interface Boost {
  type: string;
  feature: string;
  value: number;
}

export interface BuildingDef {
  id: BuildingDefId;
  name: string;
  generic: boolean;
  type?: string;
  flags: { motivatable: boolean; polishable: boolean; plunderable: boolean };
  hasSetOrChain: boolean;
  boostsByEra: Record<string, Boost[]>;
  productByEra: Record<string, Product>;
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

export function boostsFor(def: BuildingDef, era: EraId): Boost[] {
  const key = eraKey(def.boostsByEra, era);
  return [...(def.boostsByEra.AllAge ?? []), ...(key ? (def.boostsByEra[key] ?? []) : [])];
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

  setEraNames(names: Record<string, string>): void {
    for (const [id, name] of Object.entries(names)) this.eras.set(id, name);
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
