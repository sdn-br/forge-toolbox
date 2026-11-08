import type { PlayerId, WorldId } from '../shared/ids';
import type { OpponentScope } from '../shared/model';

/** the reads of `playerRows` the calls need */
interface Rows<Row> {
  latest(world: WorldId, player: PlayerId): Promise<Row | null>;
  list(world: WorldId, scope: OpponentScope, limit: number, offset: number): Promise<Row[]>;
}

type Calls<Name extends string, Row> = {
  [M in `${Name}.latest`]: (arg: { world: WorldId; opponent: PlayerId }) => Promise<Row | null>;
} & {
  [M in `${Name}.list`]: (arg: OpponentScope & { world: WorldId; limit: number; offset: number }) => Promise<Row[]>;
};

/** The worker side of `playerRowsClient`: the calls every table of per-player rows has under its name. */
export function playerRowsHandlers<Name extends string, Row>(name: Name, rows: Rows<Row>): Calls<Name, Row> {
  // the keys are template literals of the name, which the type of an object literal cannot hold
  return {
    [`${name}.latest`]: ({ world, opponent }: { world: WorldId; opponent: PlayerId }) => rows.latest(world, opponent),
    [`${name}.list`]: ({
      world,
      limit,
      offset,
      ...scope
    }: OpponentScope & { world: WorldId; limit: number; offset: number }) => rows.list(world, scope, limit, offset),
  } as unknown as Calls<Name, Row>;
}
