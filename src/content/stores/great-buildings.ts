import type { GreatBuildingListRow } from '../../persistence/great-buildings/contract';
import type { BuildingDefId, PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import { bestRate, calculateConstruction, type LimitedBonus } from '../domain/gb-calculator';
import type { Construction, GreatBuildingEntity, RankingRow } from './great-building-model';

export interface GreatBuildingPersistence {
  /** a row of an opened building replaces what was known about that building */
  put(rows: KnownGreatBuilding[]): Promise<void>;
  /** rows of a great building list, seen at `at` */
  putList(world: WorldId, rows: GreatBuildingListRow[], at: number): Promise<void>;
  /** the town hall list of the own contributions */
  putContributions(world: WorldId, rows: GreatBuildingListRow[], at: number): Promise<void>;
  /** when the town hall list last came, if ever */
  contributionsAt(world: WorldId): Promise<number | undefined>;
  /** deletes what was seen before `before`, except buildings with an own contribution */
  prune(world: WorldId, before: number): Promise<void>;
  list(world: WorldId, owner?: PlayerId): Promise<KnownGreatBuilding[]>;
}

const key = (owner: PlayerId, entityId: number) => `${owner}:${entityId}`;
/** openings remembered until their construction arrives; the game sends both right after each other */
const MAX_ENTITIES = 20;
const DAY = 24 * 60 * 60 * 1000;

/**
 * The great building construction the player has open in the game, and what is known about other players' great
 * buildings. The open construction lives in memory only; the state of foreign buildings goes to the database.
 */
export class GreatBuildingStore {
  private open?: Construction;
  private entities = new Map<string, GreatBuildingEntity>();
  private limited: LimitedBonus[] = [];
  private listedAt?: number;
  private pending: KnownGreatBuilding[] = [];
  private writes: Promise<unknown> = Promise.resolve();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: GreatBuildingPersistence,
    private now: () => number = Date.now,
  ) {}

  /** Reads when the town hall list came before this page load; a list arriving meanwhile is newer. */
  async load(): Promise<void> {
    const at = await this.persistence.contributionsAt(this.world);
    this.listedAt ??= at;
  }

  /** the construction open in the game, or the last one opened */
  current(): Construction | undefined {
    return this.open;
  }

  /** limited bonuses of the player; the Arc bonus counts those of type contribution_boost */
  limitedBonuses(): LimitedBonus[] {
    return this.limited;
  }

  setLimitedBonuses(bonuses: LimitedBonus[]): void {
    this.limited = bonuses;
  }

  /** The building as the opening reports it. Its construction follows with `openConstruction`. */
  noteEntity(entity: GreatBuildingEntity): void {
    const k = key(entity.owner, entity.entityId);
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
    nextProduction?: { type: string; value: number },
  ): void {
    const entity = this.entities.get(key(owner, entityId)) ?? known;
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
   * rankings. A level up to the current one is finished, its rankings show as a past level.
   */
  levelRanking(owner: PlayerId, entityId: number, level: number, rankings: RankingRow[]): void {
    const open = this.matching(owner, entityId);
    if (!open) return;
    if (open.entity !== undefined && level <= open.entity.level) {
      this.open = { ...open, past: { level, rankings } };
    } else {
      this.open = { ...open, rankings, rankingsLevel: level - 1, past: undefined, seenAt: this.now() };
      this.remember();
    }
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
    const mine = (rows: RankingRow[]) => rows.find((r) => r.self && r.rank !== undefined)?.fp ?? 0;
    const added = mine(rankings) - mine(open.rankings);
    const fits = building?.owner === open.owner && building.entityId === open.entityId;
    const entity = fits ? building : open.entity && { ...open.entity, invested: open.entity.invested + added };
    const rankingsLevel = entity?.level;
    const leveled =
      open.leveled && rankingsLevel !== undefined && rankingsLevel >= open.leveled.level ? undefined : open.leveled;
    this.open = { ...open, entity, rankings, rankingsLevel, past: undefined, leveled, seenAt: this.now() };
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

  /** what is known about other players' great buildings, for the snipe helper */
  known(owner?: PlayerId): Promise<KnownGreatBuilding[]> {
    return this.writes.then(() => this.persistence.list(this.world, owner));
  }

  /** The great building list of another player (`getOtherPlayerOverview`); the caller leaves out the own list. */
  noteList(rows: GreatBuildingListRow[], ownerName?: string): void {
    const owner = rows[0]?.owner;
    if (owner === undefined) return;
    const at = this.now();
    this.enqueue(() => this.persistence.putList(this.world, rows, at));
    this.bus.emit('greatBuildings.listed', {
      owner,
      ...(ownerName !== undefined && { ownerName }),
      entityIds: rows.map((r) => r.entityId),
      at,
    });
  }

  /** The town hall list of the buildings the session player invested in (`getContributions`), with owner names. */
  noteContributions(rows: GreatBuildingListRow[], owners: { id: PlayerId; name: string }[] = []): void {
    const at = this.now();
    this.listedAt = at;
    this.enqueue(() => this.persistence.putContributions(this.world, rows, at));
    this.bus.emit('greatBuildings.contributions', { at, owners });
  }

  /** when the town hall list of the own contributions last came, also from before a reload once `load` ran */
  contributionsAt(): number | undefined {
    return this.listedAt;
  }

  /** Deletes buildings not seen for `days`, except those with an own contribution; run at the start. */
  prune(days: number): Promise<void> {
    const before = this.now() - days * DAY;
    this.enqueue(() => this.persistence.prune(this.world, before));
    return this.writes.then(() => undefined);
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
    const entity = open?.entity;
    if (!open || open.own || !entity) return;
    const rate = bestRate(calculateConstruction({ ...entity, rankings: open.rankings, arcBonus: 0, factor: 0 }));
    const invested = open.rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0);
    const self = open.rankings.find((r) => r.self && r.rank !== undefined);
    const at = this.now();
    this.pending.push({
      world: this.world,
      owner: open.owner,
      entityId: open.entityId,
      cityEntityId: entity.def,
      level: entity.level,
      invested: entity.invested,
      required: entity.required,
      maxLevel: entity.maxLevel,
      connected: entity.connected,
      rankings: open.rankings,
      rankingsLevel: open.rankingsLevel ?? entity.level,
      rankingsAt: open.seenAt,
      rankingsInvested: invested,
      ...(rate !== undefined && { bestRate: rate }),
      ...(self?.rank !== undefined && {
        ownContribution: true,
        contribution: { rank: self.rank, forgePoints: self.fp ?? 0, reward: self.reward?.fp ?? 0, at },
      }),
      // the building is open in the game now: what is paid in from here on is growth
      growthBase: entity.invested,
      seenAt: at,
    });
    if (this.flushQueued) return;
    this.flushQueued = true;
    this.enqueue(() => {
      this.flushQueued = false;
      return this.persistence.put(this.pending.splice(0));
    });
  }

  private enqueue(write: () => Promise<unknown>) {
    this.writes = this.writes.then(() => write().catch((error) => logError('saving great buildings failed', error)));
  }
}
