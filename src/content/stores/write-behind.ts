import { WriteQueue } from './write-queue';

/** Rows seen once are written in the background; reads wait for the writes started before them. */
export class WriteBehind<Row, Key> {
  private pending: Row[] = [];
  private recorded = new Set<Key>();
  private queue = new WriteQueue();

  constructor(
    private keyOf: (row: Row) => Key,
    private write: (rows: Row[]) => Promise<void>,
    private errorText: string,
    /** called once per flush, with the rows, after the write succeeded */
    private stored?: (rows: Row[]) => void,
  ) {}

  /** Queues the row for writing; false if a row with this key was queued before. */
  put(row: Row): boolean {
    const key = this.keyOf(row);
    if (this.recorded.has(key)) return false;
    this.recorded.add(key);
    this.pending.push(row);
    this.scheduleFlush();
    return true;
  }

  afterWrites<T>(query: () => Promise<T>): Promise<T> {
    return this.queue.afterWrites(query);
  }

  private scheduleFlush() {
    // the flush takes the rows when its turn comes, so every row of one game response goes in one write
    this.queue.batch(async () => {
      const rows = this.pending.splice(0);
      await this.write(rows);
      this.stored?.(rows);
    }, this.errorText);
  }
}
