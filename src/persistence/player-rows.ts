import Dexie, { type Collection, type Table } from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';
import type { OpponentScope } from '../shared/model';

/**
 * Reads of a table whose rows belong to one other player per row (`field`) and carry `world` and `at`.
 * Needs the indexes `[world+at]` and `[world+<field>+at]`. With `keep` the reads see only the rows it keeps.
 */
export function playerRows<Row extends { world: WorldId; at: number }, Key>(
  table: Table<Row, Key>,
  field: keyof Row & string,
  keep?: (row: Row) => boolean,
) {
  const kept = (rows: Collection<Row, Key>) => (keep ? rows.filter(keep) : rows);

  const byPlayer = (world: WorldId, player: PlayerId) =>
    kept(table.where(`[world+${field}+at]`).between([world, player, Dexie.minKey], [world, player, Dexie.maxKey]));

  const ofWorld = (world: WorldId) =>
    kept(table.where('[world+at]').between([world, Dexie.minKey], [world, Dexie.maxKey]));

  /** the rows of the world but those of `except`; without any to leave out the plain range */
  const ofWorldExcept = (world: WorldId, except: PlayerId[] | undefined) => {
    if (!except?.length) return ofWorld(world);
    const left = new Set(except);
    return ofWorld(world).filter((row) => !left.has(row[field] as PlayerId));
  };

  const distinct = (players: PlayerId[]) => [...new Set(players)];

  /** the collections the scope reads: one per named player, or the world's rows */
  const scoped = (world: WorldId, { opponents, exceptOpponents }: OpponentScope) =>
    opponents ? distinct(opponents).map((player) => byPlayer(world, player)) : [ofWorldExcept(world, exceptOpponents)];

  /** Calls `each` for the rows of the scope, one player after the other when it names them. */
  const forEach = async (world: WorldId, scope: OpponentScope, each: (row: Row) => void) => {
    for (const rows of scoped(world, scope)) await rows.each(each);
  };

  /** newest first */
  const list = async (world: WorldId, scope: OpponentScope, limit: number, offset: number) => {
    const collections = scoped(world, scope);
    if (collections.length === 1)
      return (collections[0] as Collection<Row, Key>).reverse().offset(offset).limit(limit).toArray();
    // each player needs at most offset + limit rows to fill the page, whatever the others hold
    const perPlayer = await Promise.all(
      collections.map((rows) =>
        rows
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

  return {
    forEach,
    list,
    ofPlayer: byPlayer,
    latest: async (world: WorldId, player: PlayerId) => (await byPlayer(world, player).last()) ?? null,
    prune: (before: number) => table.where('at').below(before).delete(),
  };
}
