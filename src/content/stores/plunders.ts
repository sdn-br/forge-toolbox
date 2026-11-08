import type { PlayerId, WorldId } from '../../shared/ids';
import type { Plunder, PlunderTotals } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { PlayerRowStore, type PlayerRowsPersistence } from './player-rows';

export interface PlunderPersistence extends PlayerRowsPersistence<Plunder> {
  put(rows: Plunder[]): Promise<void>;
  totals(world: WorldId, opponents?: PlayerId[]): Promise<PlunderTotals>;
}

/** Plunders of the session player. Lives in the database, queries ask it after pending writes. */
export class PlunderStore extends PlayerRowStore<Plunder, string> {
  constructor(
    bus: ToolboxBus,
    world: WorldId,
    private persistence: PlunderPersistence,
  ) {
    super(bus, world, persistence, {
      keyOf: (p) => `${p.opponent}:${p.at}`,
      write: (rows) => persistence.put(rows),
      errorText: 'saving plunders failed',
      event: 'plunder.recorded',
      opponentOf: (p) => p.opponent,
    });
  }

  totals(opponents?: PlayerId[]): Promise<PlunderTotals> {
    return this.afterWrites(() => this.persistence.totals(this.world, opponents));
  }
}
