import { describe, expect, it } from 'vitest';
import { BACKUP_DB, type CopyEntry, pageCopyStore } from '../src/content/core/backup-store';
import { playerId, worldId } from '../src/shared/ids';

const entry = (world: string, player: number, createdAt: number): CopyEntry => ({
  world: worldId(world),
  player: playerId(player),
  createdAt,
  counts: { pvp: 1, notes: 0, greatBuildings: 0, settings: 1 },
  file: new Uint8Array([1, 2, createdAt]).buffer,
});

describe('backup copy store on the game page', () => {
  it('keeps one entry per profile in its own database, overwritten each time', async () => {
    const store = pageCopyStore();
    const me = { world: worldId('de20'), player: playerId(1) };
    expect(await store.get(me)).toBeUndefined();
    await store.put(entry('de20', 1, 5));
    await store.put(entry('de20', 2, 6));
    await store.put(entry('de20', 1, 7));
    const read = await store.get(me);
    expect(read?.createdAt).toBe(7);
    expect([...new Uint8Array(read?.file ?? new ArrayBuffer(0))]).toEqual([1, 2, 7]);
    expect((await indexedDB.databases()).map((d) => d.name)).toContain(BACKUP_DB);
    await store.delete(me);
    expect(await store.get(me)).toBeUndefined();
    expect((await store.get({ world: worldId('de20'), player: playerId(2) }))?.createdAt).toBe(6);
  });
});
