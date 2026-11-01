import { logError } from '../core/log';

/** Rows seen once are written in the background; reads wait for the writes started before them. */
export class WriteBehind<Row, Key> {
  private pending = new Map<Key, Row>();
  private recorded = new Set<Key>();
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private keyOf: (row: Row) => Key,
    private write: (rows: Row[]) => Promise<void>,
    private errorText: string,
  ) {}

  /** Queues the row for writing; false if a row with this key was queued before. */
  put(row: Row): boolean {
    const key = this.keyOf(row);
    if (this.recorded.has(key)) return false;
    this.recorded.add(key);
    this.pending.set(key, row);
    this.scheduleFlush();
    return true;
  }

  async afterWrites<T>(query: () => Promise<T>): Promise<T> {
    await this.writes;
    return query();
  }

  private scheduleFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    // the callback runs in a microtask, so every row of one game response goes in one write
    this.writes = this.writes.then(() => {
      this.flushQueued = false;
      const rows = [...this.pending.values()];
      this.pending.clear();
      return this.write(rows).catch((error) => logError(this.errorText, error));
    });
  }
}
