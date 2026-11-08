import type { PlayerId, WorldId } from '../../shared/ids';
import type { OpponentScope } from '../../shared/model';

export interface PlayerRowQuery extends OpponentScope {
  limit: number;
  offset: number;
}

export interface PlayerRowsPersistence<Row> {
  latest(world: WorldId, opponent: PlayerId): Promise<Row | undefined>;
  /** newest first */
  list(world: WorldId, query: PlayerRowQuery): Promise<Row[]>;
}
