import type { EntityTable } from 'dexie';
import type { Battle } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import { playerRows } from '../player-rows';
import type { BattlesApi } from './contract';

export type BattlesTables = { battles: EntityTable<Battle> };

export function battlesHandlers(db: BattlesTables): Handlers<BattlesApi> {
  const rows = playerRows(db.battles, 'opponent');

  return {
    'battles.put': async ({ rows }) => {
      await db.battles.bulkPut(rows);
    },
    'battles.latest': ({ world, opponent }) => rows.latest(world, opponent),
    'battles.list': ({ world, opponents, limit, offset }) => rows.list(world, opponents, limit, offset),
    'battles.count': ({ world, opponents }) => rows.count(world, opponents),
    'battles.prune': ({ before }) => rows.prune(before),
  };
}
