import type { PlayerId, WorldId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

export interface IncomingQuery {
  /** only attacks of these players; missing means all */
  attackers?: PlayerId[];
  limit: number;
  offset: number;
}

export interface IncomingPersistence {
  /** adds attacks with a new key and leaves known ones as they are */
  add(rows: IncomingAttack[]): Promise<void>;
  latest(world: WorldId, attacker: PlayerId): Promise<IncomingAttack | undefined>;
  list(world: WorldId, query: IncomingQuery): Promise<IncomingAttack[]>;
  totals(world: WorldId, attackers?: PlayerId[]): Promise<IncomingTotals>;
  /** deletes attacks of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}

const keyOf = (a: IncomingAttack) => `${a.kind}:${a.key}`;

/** Attacks on the session player's city. Lives in the database, queries ask it after pending writes. */
export class IncomingStore {
  private pending: IncomingAttack[] = [];
  private recorded = new Set<string>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: IncomingPersistence,
  ) {}

  /** An attack seen twice, live and later in the event history, is stored and announced once with its first time. */
  record(attack: IncomingAttack): void {
    const key = keyOf(attack);
    if (attack.world !== this.world || this.recorded.has(key)) return;
    this.recorded.add(key);
    this.pending.push(attack);
    this.scheduleFlush();
    this.bus.emit('incoming.recorded', { attacker: attack.attacker });
  }

  latest(attacker: PlayerId): Promise<IncomingAttack | undefined> {
    return this.afterWrites(() => this.persistence.latest(this.world, attacker));
  }

  /** newest first */
  list(query: IncomingQuery): Promise<IncomingAttack[]> {
    return this.afterWrites(() => this.persistence.list(this.world, query));
  }

  totals(attackers?: PlayerId[]): Promise<IncomingTotals> {
    return this.afterWrites(() => this.persistence.totals(this.world, attackers));
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
      return this.persistence.add(rows).catch((error) => logError('saving attacks on the city failed', error));
    });
  }
}
