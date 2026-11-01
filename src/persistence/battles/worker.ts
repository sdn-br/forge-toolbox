import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import { type Battle, type BattleFilter, type BattleSummary, type FoughtBattle, isFought } from '../../shared/model';
import { FORGE_POINTS } from '../../shared/resources';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import type { PlundersTables } from '../plunders/worker';
import { relinkRows } from '../pvp-link';
import type { BattlesApi } from './contract';

export type BattlesTables = { battles: Table<Battle, [WorldId, number]> };

/** Writes battles and relinks their opponents to the plunders, in one transaction over both tables. */
async function putBattles(db: BattlesTables & PlundersTables & Dexie, rows: FoughtBattle[]) {
  return db.transaction('rw', db.battles, db.plunders, async () => {
    // a battle seen again comes from the game without its plunder; it keeps the one it has
    const stored = await db.battles.bulkGet(rows.map((b) => [b.world, b.battleId]));
    await db.battles.bulkPut(
      rows.map((b, i) => {
        const plunderAt = stored[i]?.plunderAt;
        return plunderAt === undefined || b.plunderAt !== undefined ? b : { ...b, plunderAt };
      }),
    );
    await relinkRows(db, rows);
    return undefined;
  });
}

export function battlesHandlers(db: BattlesTables & PlundersTables & Dexie): Handlers<BattlesApi> {
  const all = playerRows(db.battles, 'opponent');
  // debt: withPlunder and summary scan without an index on plunderAt. ceiling: tens of thousands of battles per world
  // make the battles tab slow. upgrade: measured open time over a second, then an index in a later Dexie version.
  const linked = playerRows(db.battles, 'opponent', (b) => b.plunderAt !== undefined);
  const fought = playerRows(db.battles, 'opponent', isFought);
  const rowsOf = (filter: BattleFilter) => (filter.withPlunder ? linked : all);

  const plundersOf = (battles: Battle[]) =>
    db.plunders.bulkGet(
      battles.flatMap((b): [WorldId, PlayerId, number][] =>
        b.plunderAt === undefined ? [] : [[b.world, b.opponent, b.plunderAt]],
      ),
    );

  return {
    'battles.put': ({ rows }) => putBattles(db, rows),
    'battles.latest': ({ world, opponent }) => all.latest(world, opponent),
    'battles.latestFought': async ({ world, opponent }) => {
      const battle = await fought.latest(world, opponent);
      return battle && isFought(battle) ? battle : null;
    },
    'battles.list': async (filter) => {
      const battles = await rowsOf(filter).list(filter.world, filter.opponents, filter.limit, filter.offset);
      const plunders = new Map((await plundersOf(battles)).flatMap((p) => (p ? [[`${p.opponent}|${p.at}`, p]] : [])));
      return battles.map((b) => {
        const plunder = b.plunderAt === undefined ? undefined : plunders.get(`${b.opponent}|${b.plunderAt}`);
        return plunder ? Object.assign(b, { plunder }) : b;
      });
    },
    'battles.summary': async (filter) => {
      const summary: BattleSummary = { battles: 0, won: 0, plunders: 0, repelled: 0, fp: 0 };
      const battles: Battle[] = [];
      await rowsOf(filter).forEach(filter.world, filter.opponents, (b) => {
        summary.battles++;
        if (b.result === 'won') summary.won++;
        if (b.plunderAt !== undefined) battles.push(b);
      });
      for (const p of await plundersOf(battles)) {
        if (!p) continue;
        if (p.outcome === 'repelled') {
          summary.repelled++;
          continue;
        }
        summary.plunders++;
        summary.fp += p.resources[FORGE_POINTS] ?? 0;
      }
      return summary;
    },
    // a battle older than the limit stays while its plunder does, so every kept plunder keeps its battle
    'battles.prune': ({ before }) =>
      db.battles
        .where('at')
        .below(before)
        .filter((b) => b.plunderAt === undefined || b.plunderAt < before)
        .delete(),
  };
}
