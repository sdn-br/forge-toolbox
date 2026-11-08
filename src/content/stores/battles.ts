import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle, BattleFilter, BattleSummary, BattleWithPlunder, FoughtBattle } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { type PlayerRowQuery, PlayerRowStore, type PlayerRowsPersistence } from './player-rows';
import type { PlunderStore } from './plunders';

export type BattleQuery = PlayerRowQuery & BattleFilter;

export interface BattlePersistence extends PlayerRowsPersistence<Battle, BattleWithPlunder, BattleQuery> {
  put(rows: FoughtBattle[]): Promise<void>;
  summary(world: WorldId, filter: BattleFilter): Promise<BattleSummary>;
  latestFought(world: WorldId, opponent: PlayerId): Promise<FoughtBattle | undefined>;
  /** deletes battles and plunders of all worlds older than `before`, a battle only with its plunder; returns how many */
  prune(before: number): Promise<number>;
}

/**
 * PvP battles of the session player as attacker, fought or inferred from a plunder. Lives in the database, queries ask
 * it after pending writes. `latest` is the newest battle, which may be an inferred one; `list` is newest first, each
 * with its plunder.
 */
export class BattleStore extends PlayerRowStore<FoughtBattle, number, Battle, BattleWithPlunder, BattleQuery> {
  constructor(
    bus: ToolboxBus,
    world: WorldId,
    private persistence: BattlePersistence,
  ) {
    super(bus, world, persistence, {
      keyOf: (b) => b.battleId,
      write: (rows) => persistence.put(rows),
      errorText: 'saving battles failed',
      event: 'battle.recorded',
      opponentOf: (b) => b.opponent,
    });
  }

  latestFought(opponent: PlayerId): Promise<FoughtBattle | undefined> {
    return this.afterWrites(() => this.persistence.latestFought(this.world, opponent));
  }

  /** over exactly the battles `list` pages through with the same filter */
  summary(filter: BattleFilter = {}): Promise<BattleSummary> {
    return this.afterWrites(() => this.persistence.summary(this.world, filter));
  }

  /** Prunes battles and plunders together, after the pending writes of both stores. */
  prune(before: number, plunders: PlunderStore): Promise<number> {
    return this.afterWrites(() => plunders.afterWrites(() => this.persistence.prune(before)));
  }
}
