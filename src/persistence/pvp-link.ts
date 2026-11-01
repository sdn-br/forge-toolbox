// The link between a plunder and the battle that allowed it. The game sends none, so it follows from the rules of the
// game: a player can be attacked once per 24 h, and a plunder is possible up to 24 h after a won battle.
import Dexie, { type Table } from 'dexie';
import type { PlayerId, WorldId } from '../shared/ids';
import { type Battle, type FoughtBattle, type InferredBattle, isFought, type Plunder } from '../shared/model';
import { DAY_MS } from '../shared/time';

/** the battle a plunder stands for when no fought battle is stored for it */
const inferredFor = (p: Plunder): InferredBattle => ({
  world: p.world,
  battleId: -p.at,
  at: p.at,
  opponent: p.opponent,
  result: 'won',
  inferred: true,
  plunderAt: p.at,
});

const allows = (b: FoughtBattle, p: Plunder) =>
  b.result === 'won' && b.world === p.world && b.opponent === p.opponent && p.at - DAY_MS <= b.at && b.at <= p.at;

/**
 * The battles as they should be stored for these battles and plunders: each plunder, oldest first, takes the latest
 * won fought battle against its opponent in the 24 h before it that no earlier plunder took; a plunder left without
 * one gets an inferred battle. Fought battles come back with the `plunderAt` of their plunder or without one, the
 * given inferred battles only when a plunder still needs them.
 */
export function linkedBattles(battles: Battle[], plunders: Plunder[]): Battle[] {
  const fought = battles.filter(isFought).sort((a, b) => b.at - a.at || b.battleId - a.battleId);
  const taken = new Map<number, number>();
  const inferred: InferredBattle[] = [];
  for (const p of [...plunders].sort((a, b) => a.at - b.at)) {
    const battle = fought.find((b) => !taken.has(b.battleId) && allows(b, p));
    if (battle) taken.set(battle.battleId, p.at);
    else inferred.push(inferredFor(p));
  }
  const linked = fought.map((b): FoughtBattle => {
    const { plunderAt: _, ...rest } = b;
    const at = taken.get(b.battleId);
    return at === undefined ? rest : { ...rest, plunderAt: at };
  });
  return [...linked, ...inferred];
}

/** the tables the link spans; a worker, an import or an upgrade transaction hands in its own */
export interface PvpTables {
  battles: Table<Battle, [WorldId, number]>;
  plunders: Table<Plunder, [WorldId, PlayerId, number]>;
}

const sameRow = (a: Battle, b: Battle) =>
  isFought(a) === isFought(b) && a.at === b.at && a.opponent === b.opponent && a.plunderAt === b.plunderAt;

/**
 * Brings the stored battles of these opponents in line with `linkedBattles`, writing only what differs: changed and
 * new battles, deleted inferred ones. Runs in the caller's transaction, which must span both tables.
 */
export async function relink(tables: PvpTables, world: WorldId, opponents: Iterable<PlayerId>): Promise<void> {
  for (const opponent of new Set(opponents)) {
    const range = [
      [world, opponent, Dexie.minKey],
      [world, opponent, Dexie.maxKey],
    ] as const;
    const [battles, plunders] = await Promise.all([
      tables.battles
        .where('[world+opponent+at]')
        .between(...range)
        .toArray(),
      tables.plunders
        .where('[world+opponent+at]')
        .between(...range)
        .toArray(),
    ]);
    const target = linkedBattles(battles, plunders);
    const stored = new Map(battles.map((b) => [b.battleId, b]));
    const changed = target.filter((b) => {
      const known = stored.get(b.battleId);
      return !known || !sameRow(known, b);
    });
    const wanted = new Set(target.map((b) => b.battleId));
    const dropped = battles.filter((b) => !wanted.has(b.battleId)).map((b): [WorldId, number] => [world, b.battleId]);
    if (changed.length) await tables.battles.bulkPut(changed);
    if (dropped.length) await tables.battles.bulkDelete(dropped);
  }
}

/** `relink` for the opponents of these battles or plunders, world by world */
export async function relinkRows(tables: PvpTables, rows: { world: WorldId; opponent: PlayerId }[]): Promise<void> {
  const worlds = new Map<WorldId, Set<PlayerId>>();
  for (const r of rows) {
    const opponents = worlds.get(r.world) ?? new Set();
    worlds.set(r.world, opponents.add(r.opponent));
  }
  for (const [world, opponents] of worlds) await relink(tables, world, opponents);
}
