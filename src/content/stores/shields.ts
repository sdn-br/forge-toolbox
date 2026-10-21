import type { PlayerId, WorldId } from '../../shared/ids';
import type { CityShield } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

export interface ShieldPersistence {
  /** replaces the shield of each player in `rows` */
  put(rows: CityShield[]): Promise<void>;
  get(world: WorldId, player: PlayerId): Promise<CityShield | undefined>;
  /** deletes shields of all worlds that ended before `before`, returns how many */
  prune(before: number): Promise<number>;
}

/** City shields of other players. Lives in the database, queries ask it after pending writes. */
export class ShieldStore {
  private pending: CityShield[] = [];
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: ShieldPersistence,
    private now: () => number = Date.now,
  ) {}

  /** A new shield of a player replaces the one known; players missing here keep theirs. */
  record(shields: CityShield[]): void {
    const mine = shields.filter((s) => s.world === this.world);
    if (mine.length === 0) return;
    this.pending.push(...mine);
    this.scheduleFlush();
    this.bus.emit('shield.recorded', { players: mine.map((s) => s.player) });
  }

  /** the shield of the player, unless it has ended */
  active(player: PlayerId): Promise<CityShield | undefined> {
    return this.afterWrites(async () => {
      const shield = await this.persistence.get(this.world, player);
      return shield && shield.expiresAt > this.now() ? shield : undefined;
    });
  }

  /** deletes ended shields */
  prune(): Promise<number> {
    return this.afterWrites(() => this.persistence.prune(this.now()));
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
      return this.persistence.put(rows).catch((error) => logError('saving city shields failed', error));
    });
  }
}
