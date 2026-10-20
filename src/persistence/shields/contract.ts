import type { PlayerId, WorldId } from '../../shared/ids';
import type { CityShield } from '../../shared/model';

export interface ShieldsApi {
  /** a row replaces the shield the player had */
  'shields.put': { arg: { rows: CityShield[] }; result: undefined };
  'shields.get': { arg: { world: WorldId; player: PlayerId }; result: CityShield | null };
  'shields.prune': { arg: { before: number }; result: number };
}
