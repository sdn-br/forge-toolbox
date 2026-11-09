import { logError } from '../core/log';

/**
 * Database writes of a store, one after the other. A failed write is logged and the ones behind it still run. Reads
 * wait for the writes started before them (`afterWrites`).
 */
export class WriteQueue {
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  /** Runs `task` behind the pending writes; resolves with its result, undefined when it failed (logged once). */
  enqueue<T>(task: () => Promise<T>, errorText: string): Promise<T | undefined> {
    const run = this.writes.then(task);
    this.writes = run.catch((error) => logError(errorText, error));
    return run.catch(() => undefined);
  }

  /**
   * Queues `flush` unless one is queued already, so everything collected until it starts goes in one write. `flush`
   * takes what was collected when its turn comes.
   */
  batch(flush: () => Promise<unknown>, errorText: string): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    void this.enqueue(() => {
      this.flushQueued = false;
      return flush();
    }, errorText);
  }

  /** the query runs once the writes queued so far are done */
  async afterWrites<T>(query: () => Promise<T>): Promise<T> {
    await this.writes;
    return query();
  }
}
