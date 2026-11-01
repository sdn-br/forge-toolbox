import type { PlayerId, WorldId } from '../../shared/ids';

export interface PlayerRowQuery {
  /** only rows of these players; missing means all */
  opponents?: PlayerId[];
  limit: number;
  offset: number;
}

export interface PlayerRowsPersistence<Row> {
  latest(world: WorldId, opponent: PlayerId): Promise<Row | undefined>;
  /** newest first */
  list(world: WorldId, query: PlayerRowQuery): Promise<Row[]>;
  /** deletes rows of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}
