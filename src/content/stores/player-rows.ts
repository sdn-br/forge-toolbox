import type { PlayerId, WorldId } from '../../shared/ids';
import type { OpponentScope } from '../../shared/model';
import type { ToolboxBus, ToolboxEvents } from '../core/events';
import { WriteBehind } from './write-behind';

export interface PlayerRowQuery extends OpponentScope {
  limit: number;
  offset: number;
}

/** What the database answers: `Latest` for the newest row, `Listed` for a page, which may carry more than the row. */
export interface PlayerRowsPersistence<Latest, Listed = Latest, Query = PlayerRowQuery> {
  latest(world: WorldId, opponent: PlayerId): Promise<Latest | undefined>;
  /** newest first */
  list(world: WorldId, query: Query): Promise<Listed[]>;
}

/** the events that name the opponents of the rows written */
type RecordedEvent = {
  [E in keyof ToolboxEvents]: ToolboxEvents[E] extends { opponents: PlayerId[] } ? E : never;
}[keyof ToolboxEvents];

/** what a row store needs to know about its rows */
export interface PlayerRowsSpec<Row, Key> {
  keyOf: (row: Row) => Key;
  /** writes a batch of rows */
  write: (rows: Row[]) => Promise<void>;
  errorText: string;
  /** emitted once per written batch, with the opponents of its rows */
  event: RecordedEvent;
  opponentOf: (row: Row) => PlayerId;
}

/**
 * Rows of the session player about opponents. They live in the database; rows seen once are written in the background
 * and announced after the write, and queries ask the database after the pending writes.
 */
export class PlayerRowStore<
  Row extends { world: WorldId },
  Key,
  Latest = Row,
  Listed = Latest,
  Query = PlayerRowQuery,
> {
  private writes: WriteBehind<Row, Key>;

  constructor(
    protected bus: ToolboxBus,
    protected world: WorldId,
    private rows: PlayerRowsPersistence<Latest, Listed, Query>,
    spec: PlayerRowsSpec<Row, Key>,
  ) {
    this.writes = new WriteBehind(spec.keyOf, spec.write, spec.errorText, (written) =>
      this.bus.emit(spec.event, { opponents: [...new Set(written.map(spec.opponentOf))] }),
    );
  }

  /** A row seen twice is stored once, announced after the write. */
  record(row: Row): void {
    if (row.world === this.world) this.writes.put(row);
  }

  latest(opponent: PlayerId): Promise<Latest | undefined> {
    return this.writes.afterWrites(() => this.rows.latest(this.world, opponent));
  }

  /** newest first */
  list(query: Query): Promise<Listed[]> {
    return this.writes.afterWrites(() => this.rows.list(this.world, query));
  }

  /** runs `query` after the pending writes */
  afterWrites<T>(query: () => Promise<T>): Promise<T> {
    return this.writes.afterWrites(query);
  }
}
