import type { PlayerId, WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import type { PlayerRowQuery, PlayerRowsPersistence } from './player-rows';
import { WriteBehind } from './write-behind';

export type IncomingQuery = PlayerRowQuery;

export interface IncomingPersistence extends PlayerRowsPersistence<IncomingAttack> {
  /** adds attacks with a new key and leaves known ones as they are */
  add(rows: IncomingAttack[]): Promise<void>;
  totals(world: WorldId, opponents?: PlayerId[]): Promise<IncomingTotals>;
}

/** Attacks on the session player's city. Lives in the database, queries ask it after pending writes. */
export class IncomingStore {
  private writes: WriteBehind<IncomingAttack, string>;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: IncomingPersistence,
  ) {
    this.writes = new WriteBehind(
      (a) => `${a.kind}:${a.key}`,
      (rows) => persistence.add(rows),
      'saving attacks on the city failed',
      (rows) => this.bus.emit('incoming.recorded', { opponents: [...new Set(rows.map((r) => r.attacker))] }),
    );
  }

  /** An attack seen twice, live and later in the event history, is stored once, announced after the write with its first time. */
  record(attack: IncomingAttack): void {
    if (attack.world === this.world) this.writes.put(attack);
  }

  latest(opponent: PlayerId): Promise<IncomingAttack | undefined> {
    return this.writes.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  /** newest first */
  list(query: IncomingQuery): Promise<IncomingAttack[]> {
    return this.writes.afterWrites(() => this.persistence.list(this.world, query));
  }

  totals(opponents?: PlayerId[]): Promise<IncomingTotals> {
    return this.writes.afterWrites(() => this.persistence.totals(this.world, opponents));
  }

  prune(before: number): Promise<number> {
    return this.writes.afterWrites(() => this.persistence.prune(before));
  }
}
