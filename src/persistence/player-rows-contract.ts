import type { PlayerId, WorldId } from '../shared/ids';
import type { OpponentScope } from '../shared/model';

/** The calls every table of per-player rows (battles, plunders, incoming attacks) has under its name. */
export type PlayerRowsApi<Name extends string, Row> = {
  [M in `${Name}.latest`]: { arg: { world: WorldId; opponent: PlayerId }; result: Row | null };
} & {
  [M in `${Name}.list`]: {
    arg: OpponentScope & { world: WorldId; limit: number; offset: number };
    result: Row[];
  };
} & {
  [M in `${Name}.prune`]: { arg: { before: number }; result: number };
};
