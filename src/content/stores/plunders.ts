import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder, PlunderTotals } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

export interface PlunderQuery {
  /** only plunders of these players; missing means all */
  opponents?: PlayerId[];
  limit: number;
  offset: number;
}

export interface PlunderPersistence {
  put(rows: Plunder[]): Promise<void>;
  latest(world: WorldId, opponent: PlayerId): Promise<Plunder | undefined>;
  list(world: WorldId, query: PlunderQuery): Promise<Plunder[]>;
  totals(world: WorldId, opponents?: PlayerId[]): Promise<PlunderTotals>;
  /** deletes plunders of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}

const keyOf = (p: Plunder) => `${p.opponent}:${p.at}`;

/** Plunders of the session player. Lives in the database, queries ask it after pending writes. */
export class PlunderStore {
  private pending: Plunder[] = [];
  private recorded = new Set<string>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: PlunderPersistence,
  ) {}

  /** A plunder seen twice is stored and announced once. */
  record(plunder: Plunder): void {
    const key = keyOf(plunder);
    if (plunder.world !== this.world || this.recorded.has(key)) return;
    this.recorded.add(key);
    this.pending.push(plunder);
    this.scheduleFlush();
    this.bus.emit('plunder.recorded', { opponent: plunder.opponent });
  }

  latest(opponent: PlayerId): Promise<Plunder | undefined> {
    return this.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  /** newest first */
  list(query: PlunderQuery): Promise<Plunder[]> {
    return this.afterWrites(() => this.persistence.list(this.world, query));
  }

  totals(opponents?: PlayerId[]): Promise<PlunderTotals> {
    return this.afterWrites(() => this.persistence.totals(this.world, opponents));
  }

  prune(before: number): Promise<number> {
    return this.afterWrites(() => this.persistence.prune(before));
  }

  private async afterWrites<T>(query: () => Promise<T>): Promise<T> {
    await this.writes;
    return query();
  }

  private scheduleFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    this.writes = this.writes.then(() => {
      this.flushQueued = false;
      const rows = this.pending.splice(0);
      return this.persistence.put(rows).catch((error) => logError('saving plunders failed', error));
    });
  }
}
