import type { PlayerId, WorldId } from '../../shared/ids';
import type { Battle } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import type { PlayerRowQuery, PlayerRowsPersistence } from './player-rows';
import { WriteBehind } from './write-behind';

export type BattleQuery = PlayerRowQuery;

export interface BattlePersistence extends PlayerRowsPersistence<Battle> {
  put(rows: Battle[]): Promise<void>;
  count(world: WorldId, opponents?: PlayerId[]): Promise<number>;
}

/** PvP battles of the session player as attacker. Lives in the database, queries ask it after pending writes. */
export class BattleStore {
  private writes: WriteBehind<Battle, number>;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: BattlePersistence,
  ) {
    this.writes = new WriteBehind(
      (b) => b.battleId,
      (rows) => persistence.put(rows),
      'saving battles failed',
    );
  }

  /** A battle seen twice is stored and announced once. */
  record(battle: Battle): void {
    if (battle.world !== this.world || !this.writes.put(battle)) return;
    this.bus.emit('battle.recorded', { opponent: battle.opponent });
  }

  latest(opponent: PlayerId): Promise<Battle | undefined> {
    return this.writes.afterWrites(() => this.persistence.latest(this.world, opponent));
  }

  /** newest first */
  list(query: BattleQuery): Promise<Battle[]> {
    return this.writes.afterWrites(() => this.persistence.list(this.world, query));
  }

  count(opponents?: PlayerId[]): Promise<number> {
    return this.writes.afterWrites(() => this.persistence.count(this.world, opponents));
  }

  prune(before: number): Promise<number> {
    return this.writes.afterWrites(() => this.persistence.prune(before));
  }
}
