import { gbIdKey } from '../../shared/great-buildings';
import type { BuildingDefId, PlayerId, WorldId } from '../../shared/ids';
import { type GreatBuildingListRow, type KnownGreatBuilding, type MarkKind, OTHER_MARK } from '../../shared/model';
import { DAY_MS } from '../../shared/time';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import { knownRowOf, ownDepositGrowth } from '../domain/gb-known-row';
import type { Construction, GreatBuildingEntity, RankingRow } from '../model/great-building';
import { WriteQueue } from './write-queue';

export interface GreatBuildingPersistence {
  /** a row of an opened building replaces what was known about that building */
  put(rows: KnownGreatBuilding[]): Promise<void>;
  /** rows of a great building list, seen at `at` */
  putList(world: WorldId, rows: GreatBuildingListRow[], at: number): Promise<void>;
  /** the town hall list of the own contributions */
  putContributions(world: WorldId, rows: GreatBuildingListRow[], at: number): Promise<void>;
  /** when the town hall list last came, if ever */
  contributionsAt(world: WorldId): Promise<number | undefined>;
  /** deletes what was seen before `before`, except buildings with an own contribution, marked and ignored ones; returns how many */
  prune(world: WorldId, before: number): Promise<number>;
  /** puts or removes the star or the ignore of a stored building, putting one clears the other in the same write, and
   * sets `marksAt` to `at`; false when it is not stored */
  setFlag(
    world: WorldId,
    owner: PlayerId,
    entityId: number,
    flag: MarkKind,
    value: boolean,
    at: number,
  ): Promise<boolean>;
  /** the buildings carrying the star, and those carrying the ignore */
  flagged(world: WorldId): Promise<Record<MarkKind, { owner: PlayerId; entityId: number }[]>>;
  list(world: WorldId, owner?: PlayerId | PlayerId[]): Promise<KnownGreatBuilding[]>;
}

const SAVE_ERROR = 'saving great buildings failed';
const NO_CHANGE = { changed: false, cleared: false };
/** openings remembered until their construction arrives; the game sends both right after each other */
const MAX_ENTITIES = 20;

/**
 * The great building construction the player has open in the game, and what is known about other players' great
 * buildings. The open construction lives in memory only; the state of foreign buildings goes to the database, and once
 * it is written there, `greatBuildings.stored` names its owner.
 */
export class GreatBuildingStore {
  private open?: Construction;
  private entities = new Map<string, GreatBuildingEntity>();
  private listedAt?: number;
  /** the last row of each building not written yet */
  private pending = new Map<string, KnownGreatBuilding>();
  private queue = new WriteQueue();
  /** the stars and the ignores; they change only through `mark` and `ignore`, so memory and database agree */
  private flags: Record<MarkKind, Set<string>> = { marked: new Set(), ignored: new Set() };

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: GreatBuildingPersistence,
    private now: () => number = Date.now,
  ) {}

  /** Reads when the town hall list came before this page load; a list arriving meanwhile is newer. */
  async load(): Promise<void> {
    const [at, { marked, ignored }] = await Promise.all([
      this.persistence.contributionsAt(this.world),
      this.persistence.flagged(this.world),
    ]);
    this.listedAt ??= at;
    for (const m of marked) this.flags.marked.add(gbIdKey(m.owner, m.entityId));
    for (const m of ignored) this.flags.ignored.add(gbIdKey(m.owner, m.entityId));
  }

  /** whether the player put a star on the building */
  isMarked(owner: PlayerId, entityId: number): boolean {
    return this.flags.marked.has(gbIdKey(owner, entityId));
  }

  /** whether the player ignores the building */
  isIgnored(owner: PlayerId, entityId: number): boolean {
    return this.flags.ignored.has(gbIdKey(owner, entityId));
  }

  /**
   * Puts or removes the star or the ignore. The write queues behind the pending ones, so a building opened a moment ago
   * is stored by then. A building that is not stored (an own one) takes neither. Setting one clears the other.
   */
  flag(kind: MarkKind, owner: PlayerId, entityId: number, value: boolean): Promise<void> {
    return this.persistFlag(kind, owner, entityId, value).then((r) => {
      if (r.cleared) this.emitFlag(OTHER_MARK[kind], owner, entityId, false);
      if (r.changed) this.emitFlag(kind, owner, entityId, value);
    });
  }

  /** `flag` for a click: nobody waits for it, a failure goes to the log */
  setFlag(kind: MarkKind, owner: PlayerId, entityId: number, value: boolean): void {
    this.flag(kind, owner, entityId, value).catch((error) =>
      logError(kind === 'marked' ? 'marking a great building failed' : 'ignoring a great building failed', error),
    );
  }

  private emitFlag(kind: MarkKind, owner: PlayerId, entityId: number, value: boolean) {
    if (kind === 'marked') this.bus.emit('greatBuilding.marked', { owner, entityId, marked: value });
    else this.bus.emit('greatBuilding.ignored', { owner, entityId, ignored: value });
  }

  private persistFlag(
    kind: MarkKind,
    owner: PlayerId,
    entityId: number,
    value: boolean,
  ): Promise<{ changed: boolean; cleared: boolean }> {
    return this.queue
      .enqueue(async () => {
        if (!(await this.persistence.setFlag(this.world, owner, entityId, kind, value, this.now()))) return NO_CHANGE;
        const k = gbIdKey(owner, entityId);
        const cleared = value && this.flags[OTHER_MARK[kind]].delete(k);
        if (value) this.flags[kind].add(k);
        else this.flags[kind].delete(k);
        return { changed: true, cleared };
      }, SAVE_ERROR)
      .then((r) => r ?? NO_CHANGE); // a failed write is logged once; the caller sees no change
  }

  /** the construction open in the game, or the last one opened */
  current(): Construction | undefined {
    return this.open;
  }

  /** The building as the opening reports it. Its construction follows with `openConstruction`. */
  noteEntity(entity: GreatBuildingEntity): void {
    const k = gbIdKey(entity.owner, entity.entityId);
    this.entities.delete(k);
    this.entities.set(k, entity);
    if (this.entities.size > MAX_ENTITIES) this.entities.delete(this.entities.keys().next().value as string);
    const open = this.open;
    if (open && open.owner === entity.owner && open.entityId === entity.entityId) {
      this.open = { ...open, entity };
      this.remember();
      this.changed('entity');
    }
  }

  /**
   * The game opened the construction window. The building comes from its opening; `known` is the building from a city
   * the toolbox knows, used when there was no opening (the own buildings).
   */
  openConstruction(
    owner: PlayerId,
    entityId: number,
    own: boolean,
    rankings: RankingRow[],
    known?: GreatBuildingEntity,
    nextProduction?: { fp?: number },
  ): void {
    const entity = this.entities.get(gbIdKey(owner, entityId)) ?? known;
    this.open = {
      owner,
      entityId,
      own,
      entity,
      rankings,
      rankingsLevel: entity?.level,
      ...(entity && nextProduction && { nextProduction: { level: entity.level, ...nextProduction } }),
      seenAt: this.now(),
    };
    this.remember();
    this.bus.emit('greatBuilding.opened', { owner, entityId, own });
  }

  /**
   * Rankings of one level. The level being built is the current level plus one; asking for it repeats the current
   * rankings. A level up to the current one is finished: the game shows it already and it adds nothing to the
   * calculation, so it is left out (Nutzer, 2026-10-31).
   */
  levelRanking(owner: PlayerId, entityId: number, level: number, rankings: RankingRow[]): void {
    const open = this.matching(owner, entityId);
    if (!open) return;
    if (open.entity !== undefined && level <= open.entity.level) return;
    this.open = { ...open, rankings, rankingsLevel: level - 1, seenAt: this.now() };
    this.remember();
    this.changed('ranking');
  }

  /**
   * The session player contributed to the open construction; the game answers with its new rankings and the building
   * as it is now (seen 2026-10-21: a CityMapService.reset in the same response). With that building its numbers count,
   * without it the invested Forge points grow by what the own deposit grew. A contribution that levels the building
   * answers with the empty rankings of the new level and the building on it (recorded 2026-10-23), so the
   * construction goes on with the new level.
   */
  contributed(
    rankings: RankingRow[],
    target?: { owner: PlayerId; entityId: number },
    building?: GreatBuildingEntity,
  ): void {
    const open = target ? this.matching(target.owner, target.entityId) : this.open;
    if (!open) return;
    const added = ownDepositGrowth(open.rankings, rankings);
    const fits = building?.owner === open.owner && building.entityId === open.entityId;
    const entity = fits ? building : open.entity && { ...open.entity, invested: open.entity.invested + added };
    const rankingsLevel = entity?.level;
    const leveled =
      open.leveled && rankingsLevel !== undefined && rankingsLevel >= open.leveled.level ? undefined : open.leveled;
    this.open = { ...open, entity, rankings, rankingsLevel, leveled, seenAt: this.now() };
    this.remember();
    this.changed('contributed');
  }

  /**
   * A great building the player invested in levelled up. The game names it only by owner and display name, so the
   * caller passes the definitions with that name. It comes right after the contribution that levelled it; when that
   * already brought the rankings of the new level, there is nothing stale to mark.
   */
  leveled(owner: PlayerId, defs: BuildingDefId[], level: number, rank?: number): void {
    const open = this.open;
    if (!open || open.owner !== owner || !open.entity || !defs.includes(open.entity.def)) return;
    if (open.rankingsLevel !== undefined && open.rankingsLevel >= level) return;
    this.open = { ...open, leveled: { level, ...(rank !== undefined && { rank }) } };
    this.changed('leveled');
  }

  /** what is known about other players' great buildings: of one owner, of several in one read, or of all */
  known(owner?: PlayerId | PlayerId[]): Promise<KnownGreatBuilding[]> {
    return this.queue.afterWrites(() => this.persistence.list(this.world, owner));
  }

  /**
   * The great building list of another player (`getOtherPlayerOverview`); the caller leaves out the own list. Once
   * written, `greatBuildings.stored` names its owner. The ingestion announces the list itself (`greatBuildings.listed`), with
   * the window the game shows.
   */
  noteList(rows: GreatBuildingListRow[]): void {
    const owner = rows[0]?.owner;
    if (owner === undefined) return;
    const at = this.now();
    const entityIds = rows.map((r) => r.entityId);
    this.write(async () => {
      await this.persistence.putList(this.world, rows, at);
      this.bus.emit('greatBuildings.stored', { owners: [{ owner, entityIds }] });
    });
  }

  /**
   * Rows of the great building ranking (RankingService, recorded 2026-11-04): buildings of many owners, written like a
   * list. Once written, `greatBuildings.stored` names each owner. It is no list of a player the player opened, so
   * `greatBuildings.listed` stays silent.
   */
  noteRanking(rows: GreatBuildingListRow[]): void {
    const at = this.now();
    this.write(async () => {
      await this.persistence.putList(this.world, rows, at);
      this.announceStored(rows);
    });
  }

  /** The town hall list of the buildings the session player invested in (`getContributions`). */
  noteContributions(rows: GreatBuildingListRow[]): void {
    const at = this.now();
    this.listedAt = at;
    this.write(async () => {
      await this.persistence.putContributions(this.world, rows, at);
      this.bus.emit('greatBuildings.stored', {});
    });
    this.bus.emit('greatBuildings.contributions', { at });
  }

  /** when the town hall list of the own contributions last came, also from before a reload once `load` ran */
  contributionsAt(): number | undefined {
    return this.listedAt;
  }

  /** Deletes buildings not seen for `days`, except those with an own contribution, marked and ignored ones; run at the start. */
  prune(days: number): Promise<void> {
    const before = this.now() - days * DAY_MS;
    return this.queue.enqueue(() => this.persistence.prune(this.world, before), SAVE_ERROR).then(() => undefined);
  }

  private matching(owner: PlayerId, entityId: number): Construction | undefined {
    const open = this.open;
    return open && open.owner === owner && open.entityId === entityId ? open : undefined;
  }

  private changed(reason: 'entity' | 'ranking' | 'contributed' | 'leveled') {
    const open = this.open;
    if (open) this.bus.emit('greatBuilding.changed', { owner: open.owner, entityId: open.entityId, reason });
  }

  /** keeps the state of a foreign building with the rankings of its current level */
  private remember() {
    const open = this.open;
    const row = open && knownRowOf(open, this.world, this.now());
    if (!open || !row) return;
    this.pending.set(gbIdKey(open.owner, open.entityId), row);
    this.queue.batch(async () => {
      const rows = [...this.pending.values()];
      this.pending.clear();
      await this.persistence.put(rows);
      this.announceStored(rows);
    }, SAVE_ERROR);
  }

  /** one event for the write, naming each owner of the written rows once, with the distinct buildings in the order they came */
  private announceStored(rows: { owner: PlayerId; entityId: number }[]) {
    const written = new Map<PlayerId, Set<number>>();
    for (const r of rows) written.set(r.owner, (written.get(r.owner) ?? new Set()).add(r.entityId));
    if (written.size === 0) return;
    this.bus.emit('greatBuildings.stored', {
      owners: [...written].map(([owner, ids]) => ({ owner, entityIds: [...ids] })),
    });
  }

  private write(task: () => Promise<unknown>) {
    void this.queue.enqueue(task, SAVE_ERROR);
  }
}
