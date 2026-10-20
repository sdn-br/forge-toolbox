import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { CityShield } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { ShieldsApi } from './contract';

export type ShieldsTables = { cityShields: Table<CityShield, [WorldId, PlayerId]> };

export function shieldsHandlers(db: ShieldsTables): Handlers<ShieldsApi> {
  return {
    'shields.put': async ({ rows }) => {
      await db.cityShields.bulkPut(rows);
    },
    'shields.get': async ({ world, player }) => (await db.cityShields.get([world, player])) ?? null,
    'shields.prune': ({ before }) => db.cityShields.where('expiresAt').below(before).delete(),
  };
}
