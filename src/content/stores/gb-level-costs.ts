import type { LevelCostRow } from '../../persistence/gb-level-costs/contract';
import type { BuildingDefId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import { type LevelCost, type LevelCosts, levelCosts } from '../domain/gb-level-cost';
import type { GreatBuildingDef } from '../model/catalog';

export interface GbLevelCostPersistence {
  /** every cost seen, of all worlds */
  all(): Promise<LevelCostRow[]>;
  /** each row replaces what was known for its type and level */
  put(rows: LevelCostRow[]): Promise<void>;
}

/** a cost the game showed: Forge points to build a great building of `type` from `level` up to `level + 1` */
export interface LevelCostSeen {
  type: BuildingDefId;
  level: number;
  fp: number;
}

/**
 * The Forge point costs of great building levels the game showed, by type and start level, and what they tell about
 * the other levels. The costs are the same in every world, so they live in the database all profiles share; memory
 * holds them all. A newer different cost of a type and level replaces the old one.
 */
export class GbLevelCostStore {
  private seen = new Map<BuildingDefId, Map<number, number>>();
  /** the lookup of a type, kept while its costs and its definition stay */
  private learned = new Map<BuildingDefId, { listed: readonly number[]; costs: LevelCosts }>();
  private pending = new Map<string, LevelCostRow>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private persistence?: GbLevelCostPersistence,
    private now: () => number = Date.now,
  ) {}

  /** Reads the costs seen before this page load; a cost seen meanwhile is newer and stays. */
  async load(): Promise<void> {
    if (!this.persistence) return;
    const types = new Set<BuildingDefId>();
    for (const row of await this.persistence.all()) {
      const levels = this.levelsOf(row.type);
      if (levels.has(row.level)) continue;
      levels.set(row.level, row.fp);
      types.add(row.type);
    }
    this.announce(types);
  }

  /** Costs the game showed; those that differ from what is known replace it and are written. */
  note(costs: readonly LevelCostSeen[]): void {
    const types = new Set<BuildingDefId>();
    const at = this.now();
    for (const { type, level, fp } of costs) {
      // a building at its last level or a broken row brings no cost
      if (!Number.isInteger(level) || level < 0 || !Number.isInteger(fp) || fp <= 0) continue;
      const levels = this.levelsOf(type);
      if (levels.get(level) === fp) continue;
      levels.set(level, fp);
      types.add(type);
      this.pending.set(`${type}:${level}`, { type, level, fp, at });
    }
    if (types.size === 0) return;
    this.scheduleFlush();
    this.announce(types);
  }

  /** the cost of building `level` up to `level + 1` of a great building of `type` with the definition `def` */
  cost(def: GreatBuildingDef, type: BuildingDefId, level: number): LevelCost | undefined {
    return this.costs(def, type)(level);
  }

  /** the costs of every level of a great building of `type` with the definition `def` */
  costs(def: GreatBuildingDef, type: BuildingDefId): LevelCosts {
    const known = this.learned.get(type);
    if (known && known.listed === def.levelCosts) return known.costs;
    const costs = levelCosts(def.levelCosts, this.seen.get(type) ?? new Map());
    this.learned.set(type, { listed: def.levelCosts, costs });
    return costs;
  }

  /** resolves once the costs noted so far are written */
  flushed(): Promise<void> {
    return this.writes.then(() => undefined);
  }

  private levelsOf(type: BuildingDefId): Map<number, number> {
    let levels = this.seen.get(type);
    if (!levels) {
      levels = new Map();
      this.seen.set(type, levels);
    }
    return levels;
  }

  private announce(types: Set<BuildingDefId>) {
    if (types.size === 0) return;
    for (const type of types) this.learned.delete(type);
    this.bus.emit('gbLevelCosts.changed', { types: [...types] });
  }

  private scheduleFlush() {
    const persistence = this.persistence;
    if (this.flushQueued || !persistence) return;
    this.flushQueued = true;
    // in a microtask, so every cost of one game response goes in one write
    this.writes = this.writes.then(() => {
      this.flushQueued = false;
      const rows = [...this.pending.values()];
      this.pending.clear();
      return persistence
        .put(rows)
        .catch((error) => logError('saving the costs of great building levels failed', error));
    });
  }
}
