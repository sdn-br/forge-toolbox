import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder, PlunderTotals } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import type { PlayerRowQuery, PlayerRowsPersistence } from './player-rows';
import { WriteBehind } from './write-behind';

export type PlunderQuery = PlayerRowQuery;

export interface PlunderPersistence extends PlayerRowsPersistence<Plunder> {
  put(rows: Plunder[]): Promise<void>;
  totals(world: WorldId, opponents?: PlayerId[]): Promise<PlunderTotals>;
}

/** Plunders of the session player. Lives in the database, queries ask it after pending writes. */
export class PlunderStore {
  private writes: WriteBehind<Plunder, string>;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: PlunderPersistence,
  ) {
    this.writes = new WriteBehind(
      (p) => `${p.opponent}:${p.at}`,
      (rows) => persistence.put(rows),
      'saving plunders failed',
    );
  }

  /** A plunder seen twice is stored and announced once. */
  record(plunder: Plunder): void {
    if (plunder.world !== this.world || !this.writes.put(plunder)) return;
    this.bus.emit('plunder.recorded', { opponent: plunder.opponent });
  }

  latest(opponent: PlayerId): Promise<Plunder | undefined> {
    return this.writes.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  /** newest first */
  list(query: PlunderQuery): Promise<Plunder[]> {
    return this.writes.afterWrites(() => this.persistence.list(this.world, query));
  }

  totals(opponents?: PlayerId[]): Promise<PlunderTotals> {
    return this.writes.afterWrites(() => this.persistence.totals(this.world, opponents));
  }

  prune(before: number): Promise<number> {
    return this.writes.afterWrites(() => this.persistence.prune(before));
  }
}
