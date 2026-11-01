import Dexie, { type Table } from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';

/**
 * Reads of a table whose rows belong to one other player per row (`field`) and carry `world` and `at`.
 * Needs the indexes `[world+at]` and `[world+<field>+at]`.
 */
export function playerRows<Row extends { world: WorldId; at: number }, Key>(
  table: Table<Row, Key>,
  field: keyof Row & string,
) {
  const byPlayer = (world: WorldId, player: PlayerId) =>
    table.where(`[world+${field}+at]`).between([world, player, Dexie.minKey], [world, player, Dexie.maxKey]);

  const ofWorld = (world: WorldId) => table.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]);

  const distinct = (players: PlayerId[]) => [...new Set(players)];

  /** Calls `each` for the rows of these players, one player after the other; `players` missing means all. */
  const forEach = async (world: WorldId, players: PlayerId[] | undefined, each: (row: Row) => void) => {
    if (!players) {
      await ofWorld(world).each(each);
      return;
    }
    for (const player of distinct(players)) await byPlayer(world, player).each(each);
  };

  /** newest first; `players` missing means all */
  const list = async (world: WorldId, players: PlayerId[] | undefined, limit: number, offset: number) => {
    if (!players) return ofWorld(world).reverse().offset(offset).limit(limit).toArray();
    const wanted = distinct(players);
    if (wanted.length === 1) {
      return byPlayer(world, wanted[0] as PlayerId)
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
    }
    // each player needs at most offset + limit rows to fill the page, whatever the others hold
    const perPlayer = await Promise.all(
      wanted.map((player) =>
        byPlayer(world, player)
          .reverse()
          .limit(offset + limit)
          .toArray(),
      ),
    );
    return perPlayer
      .flat()
      .sort((a, b) => b.at - a.at)
      .slice(offset, offset + limit);
  };

  const count = async (world: WorldId, players: PlayerId[] | undefined) => {
    if (!players) return ofWorld(world).count();
    const counts = await Promise.all(distinct(players).map((player) => byPlayer(world, player).count()));
    return counts.reduce((sum, n) => sum + n, 0);
  };

  return {
    forEach,
    list,
    count,
    latest: async (world: WorldId, player: PlayerId) => (await byPlayer(world, player).last()) ?? null,
    prune: (before: number) => table.where('at').below(before).delete(),
  };
}
