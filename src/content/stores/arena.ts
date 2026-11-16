import type { WorldId } from '../../shared/ids';
import type {
  ArenaBattle,
  ArenaLogEntry,
  ArenaLogFilter,
  ArenaLogSummary,
  ArenaOpponent,
  ArenaPoints,
} from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { type PlayerRowQuery, PlayerRowStore, type PlayerRowsPersistence } from './player-rows';
import { WriteQueue } from './write-queue';

export type ArenaLogQuery = PlayerRowQuery & ArenaLogFilter;

/** The arena's three tables in the database. */
export interface ArenaPersistence {
  battles: PlayerRowsPersistence<ArenaBattle> & { put(rows: ArenaBattle[]): Promise<void> };
  log: PlayerRowsPersistence<ArenaLogEntry, ArenaLogEntry, ArenaLogQuery> & {
    /** adds lines whose key is new; known ones stay */
    add(rows: ArenaLogEntry[]): Promise<void>;
    summary(world: WorldId, filter: ArenaLogFilter): Promise<ArenaLogSummary>;
  };
  points: {
    /** stores the row unless the last stored points of its world are the same; true when it stored it */
    add(row: ArenaPoints): Promise<boolean>;
    /** oldest first */
    since(world: WorldId, from: number): Promise<ArenaPoints[]>;
  };
  /** deletes battles, log lines and points of all worlds older than `before`, returns how many */
  prune(before: number): Promise<number>;
}

/** Own battles in the arena. Lives in the database, queries ask it after pending writes; `list` is newest first. */
export class ArenaBattleStore extends PlayerRowStore<ArenaBattle, number> {
  constructor(bus: ToolboxBus, world: WorldId, persistence: ArenaPersistence['battles']) {
    super(bus, world, persistence, {
      keyOf: (b) => b.battleId,
      write: (rows) => persistence.put(rows),
      errorText: 'saving arena battles failed',
      event: 'arena.battleRecorded',
      opponentOf: (b) => b.opponent,
    });
  }
}

/**
 * The arena log as the game keeps it. The overview repeats the lines of about two days each time it opens, and a new
 * line comes once more with the battle; both are stored once (key: world, time, opponent, kind).
 */
export class ArenaLogStore extends PlayerRowStore<ArenaLogEntry, string, ArenaLogEntry, ArenaLogEntry, ArenaLogQuery> {
  constructor(
    bus: ToolboxBus,
    world: WorldId,
    private persistence: ArenaPersistence['log'],
  ) {
    super(bus, world, persistence, {
      keyOf: (e) => `${e.at}|${e.opponent}|${e.kind}`,
      write: (rows) => persistence.add(rows),
      errorText: 'saving the arena log failed',
      event: 'arena.logRecorded',
      opponentOf: (e) => e.opponent,
    });
  }

  /** over exactly the lines `list` pages through with the same filter */
  summary(filter: ArenaLogFilter = {}): Promise<ArenaLogSummary> {
    return this.afterWrites(() => this.persistence.summary(this.world, filter));
  }
}

/** The own arena points over time. The game tells them after every battle; only a change is stored. */
export class ArenaPointsStore {
  private queue = new WriteQueue();

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: ArenaPersistence['points'],
    private now: () => number,
  ) {}

  record(points: number): void {
    const row: ArenaPoints = { world: this.world, at: this.now(), points };
    void this.queue.enqueue(async () => {
      if (await this.persistence.add(row)) this.bus.emit('arena.pointsRecorded', {});
    }, 'saving arena points failed');
  }

  /** the points of the world from `from` on, oldest first */
  since(from: number): Promise<ArenaPoints[]> {
    return this.queue.afterWrites(() => this.persistence.since(this.world, from));
  }

  afterWrites<T>(query: () => Promise<T>): Promise<T> {
    return this.queue.afterWrites(query);
  }
}

const sameOpponents = (a: ArenaOpponent[], b: ArenaOpponent[]) => JSON.stringify(a) === JSON.stringify(b);

/** The opponents the arena offers right now. Only in memory: the next draw replaces them anyway. */
export class ArenaOpponentStore {
  private opponents: ArenaOpponent[] = [];

  constructor(private bus: ToolboxBus) {}

  current(): ArenaOpponent[] {
    return this.opponents;
  }

  /** the new draw replaces the old one, announced when it differs */
  replace(opponents: ArenaOpponent[]): void {
    if (sameOpponents(opponents, this.opponents)) return;
    this.opponents = opponents;
    this.bus.emit('arena.opponents', {});
  }
}

/** Everything the toolbox keeps of the PvP arena of one world. */
export class ArenaStore {
  readonly battles: ArenaBattleStore;
  readonly log: ArenaLogStore;
  readonly points: ArenaPointsStore;
  readonly opponents: ArenaOpponentStore;

  constructor(
    bus: ToolboxBus,
    world: WorldId,
    private persistence: ArenaPersistence,
    now: () => number,
  ) {
    this.battles = new ArenaBattleStore(bus, world, persistence.battles);
    this.log = new ArenaLogStore(bus, world, persistence.log);
    this.points = new ArenaPointsStore(bus, world, persistence.points, now);
    this.opponents = new ArenaOpponentStore(bus);
  }

  /** Prunes battles, log and points together, after the pending writes of all three. */
  prune(before: number): Promise<number> {
    return this.battles.afterWrites(() =>
      this.log.afterWrites(() => this.points.afterWrites(() => this.persistence.prune(before))),
    );
  }
}
