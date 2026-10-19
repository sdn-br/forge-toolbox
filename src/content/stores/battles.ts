import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { Call } from '../core/rpc';

export interface BattleQuery {
  /** only battles against these players; missing means all */
  opponents?: PlayerId[];
  limit: number;
  offset: number;
}

export interface BattlePersistence {
  put(rows: Battle[]): Promise<void>;
  latest(world: WorldId, opponent: PlayerId): Promise<Battle | undefined>;
  list(world: WorldId, query: BattleQuery): Promise<Battle[]>;
  count(world: WorldId, opponents?: PlayerId[]): Promise<number>;
  /** deletes battles of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}

/** Persistence through the service worker, which owns the database. */
export function battlePersistence(call: Call): BattlePersistence {
  return {
    put: (rows) => call('battles.put', { rows }),
    latest: async (world, opponent) => (await call('battles.latest', { world, opponent })) ?? undefined,
    list: (world, query) => call('battles.list', { world, ...query }),
    count: (world, opponents) => call('battles.count', { world, opponents }),
    prune: (before) => call('battles.prune', { before }),
  };
}

/** PvP battles of the session player as attacker. Lives in the database, queries ask it after pending writes. */
export class BattleStore {
  private pending = new Map<number, Battle>();
  private recorded = new Set<number>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: BattlePersistence,
  ) {}

  /** A battle seen twice is stored and announced once. */
  record(battle: Battle): void {
    if (battle.world !== this.world || this.recorded.has(battle.battleId)) return;
    this.recorded.add(battle.battleId);
    this.pending.set(battle.battleId, battle);
    this.scheduleFlush();
    this.bus.emit('battle.recorded', { opponent: battle.opponent });
  }

  latest(opponent: PlayerId): Promise<Battle | undefined> {
    return this.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  /** newest first */
  list(query: BattleQuery): Promise<Battle[]> {
    return this.afterWrites(() => this.persistence.list(this.world, query));
  }

  count(opponents?: PlayerId[]): Promise<number> {
    return this.afterWrites(() => this.persistence.count(this.world, opponents));
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
    // the callback runs in a microtask, so every battle of one game response goes in one write
    this.writes = this.writes.then(() => {
      this.flushQueued = false;
      const rows = [...this.pending.values()];
      this.pending.clear();
      return this.persistence.put(rows).catch((error) => logError('saving battles failed', error));
    });
  }
}
