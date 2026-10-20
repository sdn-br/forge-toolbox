import type { EntityTable } from 'dexie';
import type { Player } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { PlayersApi } from './contract';

export type PlayersTables = { players: EntityTable<Player> };

export function playersHandlers(db: PlayersTables): Handlers<PlayersApi> {
  return {
    'players.load': ({ world }) => db.players.where('world').equals(world).toArray(),
    'players.put': async ({ rows }) => {
      await db.players.bulkPut(rows);
    },
  };
}
