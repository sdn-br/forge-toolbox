import Dexie, { type Table } from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';

/**
 * Reads of a table whose rows belong to one other player per row (`field`) and carry `world` and `at`.
 * Needs the indexes `[world+at]` and `[world+<field>+at]`.
 */
export function playerRows<Row extends { world: WorldId }, Key>(table: Table<Row, Key>, field: keyof Row & string) {
  const byPlayer = (world: WorldId, player: PlayerId) =>
    table.where(`[world+${field}+at]`).between([world, player, Dexie.minKey], [world, player, Dexie.maxKey]);

  /** `players` missing means all */
  const newestFirst = (world: WorldId, players?: PlayerId[]) => {
    const all = table.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]).reverse();
    if (!players) return all;
    const wanted = new Set<unknown>(players);
    return all.filter((row) => wanted.has(row[field]));
  };

  return {
    newestFirst,
    latest: async (world: WorldId, player: PlayerId) => (await byPlayer(world, player).last()) ?? null,
    list: (world: WorldId, players: PlayerId[] | undefined, limit: number, offset: number) =>
      newestFirst(world, players).offset(offset).limit(limit).toArray(),
    prune: (before: number) => table.where('at').below(before).delete(),
  };
}
