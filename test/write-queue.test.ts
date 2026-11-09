import { describe, expect, it, vi } from 'vitest';
import { WriteQueue } from '../src/content/stores/write-queue';

describe('WriteQueue', () => {
  it('runs writes one after the other and lets a failed one not block the rest', async () => {
    const queue = new WriteQueue();
    const order: string[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = queue.enqueue(async () => {
      order.push('a');
      throw new Error('boom');
    }, 'saving failed');
    const done = queue.enqueue(async () => {
      order.push('b');
      return 2;
    }, 'saving failed');
    expect(await failed).toBeUndefined();
    expect(await done).toBe(2);
    expect(order).toEqual(['a', 'b']);
  });

  it('writes everything collected before the flush starts once', async () => {
    const queue = new WriteQueue();
    const pending: number[] = [];
    const written: number[][] = [];
    const flush = async () => {
      written.push(pending.splice(0));
    };
    pending.push(1);
    queue.batch(flush, 'saving failed');
    pending.push(2);
    queue.batch(flush, 'saving failed');
    await queue.afterWrites(async () => {});
    pending.push(3);
    queue.batch(flush, 'saving failed');
    await queue.afterWrites(async () => {});
    expect(written).toEqual([[1, 2], [3]]);
  });

  it('answers a query after the writes queued before it', async () => {
    const queue = new WriteQueue();
    let stored = false;
    void queue.enqueue(async () => {
      await Promise.resolve();
      stored = true;
    }, 'saving failed');
    expect(await queue.afterWrites(async () => stored)).toBe(true);
  });
});
