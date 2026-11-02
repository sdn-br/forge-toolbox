import Dexie, { type Collection, type Table } from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';
import type { OpponentScope } from '../shared/model';

/**
 * Reads of a table whose rows belong to one other player per row (`field`) and carry `world` and `at`.
 * Needs the indexes `[world+at]` and `[world+<field>+at]`. With `keep` the reads see only the rows it keeps; they then
 * scan the index range instead of counting it.
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

  /** the rows of the world but those of `except`; without any to leave out the plain range, which counts fast */
  const ofWorldExcept = (world: WorldId, except: PlayerId[] | undefined) => {
    if (!except?.length) return ofWorld(world);
    const left = new Set(except);
    return ofWorld(world).filter((row) => !left.has(row[field] as PlayerId));
  };

  const distinct = (players: PlayerId[]) => [...new Set(players)];

  /** Calls `each` for the rows of the scope, one player after the other when it names them. */
  const forEach = async (
    world: WorldId,
    { opponents: players, exceptOpponents }: OpponentScope,
    each: (row: Row) => void,
  ) => {
    if (!players) {
      await ofWorldExcept(world, exceptOpponents).each(each);
      return;
    }
    for (const player of distinct(players)) await byPlayer(world, player).each(each);
  };

  /** newest first */
  const list = async (
    world: WorldId,
    { opponents: players, exceptOpponents }: OpponentScope,
    limit: number,
    offset: number,
  ) => {
    if (!players) return ofWorldExcept(world, exceptOpponents).reverse().offset(offset).limit(limit).toArray();
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

  const count = async (world: WorldId, { opponents: players, exceptOpponents }: OpponentScope) => {
    if (!players) return ofWorldExcept(world, exceptOpponents).count();
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
