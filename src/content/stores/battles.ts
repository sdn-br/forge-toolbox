import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle, BattleFilter, BattleSummary, BattleWithPlunder, FoughtBattle } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import type { PlayerRowQuery, PlayerRowsPersistence } from './player-rows';
import { WriteBehind } from './write-behind';

export type BattleQuery = PlayerRowQuery & BattleFilter;

export interface BattlePersistence extends Omit<PlayerRowsPersistence<Battle>, 'list'> {
  put(rows: FoughtBattle[]): Promise<void>;
  /** newest first, each with its plunder */
  list(world: WorldId, query: BattleQuery): Promise<BattleWithPlunder[]>;
  summary(world: WorldId, filter: BattleFilter): Promise<BattleSummary>;
  latestFought(world: WorldId, opponent: PlayerId): Promise<FoughtBattle | undefined>;
}

/**
 * PvP battles of the session player as attacker, fought or inferred from a plunder. Lives in the database, queries ask
 * it after pending writes.
 */
export class BattleStore {
  private writes: WriteBehind<FoughtBattle, number>;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: BattlePersistence,
  ) {
    this.writes = new WriteBehind(
      (b) => b.battleId,
      (rows) => persistence.put(rows),
      'saving battles failed',
      (rows) => this.bus.emit('battle.recorded', { opponents: [...new Set(rows.map((r) => r.opponent))] }),
    );
  }

  /** A battle seen twice is stored once, announced after the write. */
  record(battle: FoughtBattle): void {
    if (battle.world === this.world) this.writes.put(battle);
  }

  /** the newest battle, which may be an inferred one */
  latest(opponent: PlayerId): Promise<Battle | undefined> {
    return this.writes.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  latestFought(opponent: PlayerId): Promise<FoughtBattle | undefined> {
    return this.writes.afterWrites(() => this.persistence.latestFought(this.world, opponent));
  }

  /** newest first */
  list(query: BattleQuery): Promise<BattleWithPlunder[]> {
    return this.writes.afterWrites(() => this.persistence.list(this.world, query));
  }

  /** over exactly the battles `list` pages through with the same filter */
  summary(filter: BattleFilter = {}): Promise<BattleSummary> {
    return this.writes.afterWrites(() => this.persistence.summary(this.world, filter));
  }

  prune(before: number): Promise<number> {
    return this.writes.afterWrites(() => this.persistence.prune(before));
  }
}
