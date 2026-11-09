import type { WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals, OpponentScope } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { PlayerRowStore, type PlayerRowsPersistence } from './player-rows';

export interface IncomingPersistence extends PlayerRowsPersistence<IncomingAttack> {
  /** adds attacks with a new key and leaves known ones as they are */
  add(rows: IncomingAttack[]): Promise<void>;
  totals(world: WorldId, scope?: OpponentScope): Promise<IncomingTotals>;
  /** deletes attacks of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}

/**
 * Attacks on the session player's city. Lives in the database, queries ask it after pending writes. An attack seen
 * twice, live and later in the event history, is stored once, announced after the write with its first time.
 */
export class IncomingStore extends PlayerRowStore<IncomingAttack, string> {
  constructor(
    bus: ToolboxBus,
    world: WorldId,
    private persistence: IncomingPersistence,
  ) {
    super(bus, world, persistence, {
      keyOf: (a) => `${a.kind}:${a.key}`,
      write: (rows) => persistence.add(rows),
      errorText: 'saving attacks on the city failed',
      event: 'incoming.recorded',
      opponentOf: (a) => a.attacker,
    });
  }

  /** over the attacks of the scope, all by default */
  totals(scope: OpponentScope = {}): Promise<IncomingTotals> {
    return this.afterWrites(() => this.persistence.totals(this.world, scope));
  }

  prune(before: number): Promise<number> {
    return this.afterWrites(() => this.persistence.prune(before));
  }
}
