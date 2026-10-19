import type { EraId, PlayerId, WorldId } from '../../shared/ids';
import type { GuildRef, Player, PlayerSource, Relations } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

/** What one game response tells about a player. `guild: null` means "no guild", not "unknown". */
export interface PlayerObservation {
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  score: number;
  rank: number;
  active: boolean;
  guild: GuildRef | null;
}

export interface PlayerPersistence {
  load(world: WorldId): Promise<Player[]>;
  put(rows: Player[]): Promise<void>;
}

const NO_RELATIONS: Relations = { neighbor: false, guildMember: false, friend: false };

export class PlayerStore {
  private players = new Map<PlayerId, Player>();
  private dirty = new Set<PlayerId>();
  private flushQueued = false;

  constructor(
    private bus: ToolboxBus,
    private persistence: PlayerPersistence,
    private now: () => number = Date.now,
  ) {}

  /** Persisted players fill the gaps; whatever the game already reported this session wins. */
  async load(world: WorldId): Promise<void> {
    const rows = await this.persistence.load(world);
    for (const row of rows) if (!this.players.has(row.id)) this.players.set(row.id, row);
  }

  get(id: PlayerId): Player | undefined {
    return this.players.get(id);
  }

  list(filter: { relation?: keyof Relations } = {}): Player[] {
    const all = [...this.players.values()];
    return filter.relation ? all.filter((p) => p.relations[filter.relation as keyof Relations]) : all;
  }

  /** The social list is the full truth about relations: whoever is missing from a list loses that relation. */
  applySocialList(world: WorldId, lists: Record<keyof Relations, PlayerObservation[]>): void {
    const relations = new Map<PlayerId, Relations>();
    for (const [relation, observations] of Object.entries(lists) as [keyof Relations, PlayerObservation[]][]) {
      for (const o of observations) relations.set(o.id, { ...(relations.get(o.id) ?? NO_RELATIONS), [relation]: true });
    }
    const touched = new Set<PlayerId>();
    for (const observations of Object.values(lists)) {
      for (const o of observations) this.merge(world, o, 'socialList', relations.get(o.id) ?? NO_RELATIONS, touched);
    }
    for (const p of this.players.values()) {
      if (p.world !== world || relations.has(p.id)) continue;
      if (p.relations.neighbor || p.relations.guildMember || p.relations.friend) {
        this.players.set(p.id, { ...p, relations: NO_RELATIONS });
        touched.add(p.id);
      }
    }
    this.changed(touched, 'socialList');
  }

  /** Any other source updates what it brings and never touches relations. */
  apply(world: WorldId, observations: PlayerObservation[], source: PlayerSource): void {
    const touched = new Set<PlayerId>();
    for (const o of observations) this.merge(world, o, source, undefined, touched);
    this.changed(touched, source);
  }

  private merge(
    world: WorldId,
    o: PlayerObservation,
    source: PlayerSource,
    relations: Relations | undefined,
    touched: Set<PlayerId>,
  ) {
    const old = this.players.get(o.id);
    const now = this.now();
    const { guild, ...fields } = o;
    this.players.set(o.id, {
      ...fields,
      world,
      guild: guild ?? undefined,
      relations: relations ?? old?.relations ?? NO_RELATIONS,
      firstSeenAt: old?.firstSeenAt ?? now,
      seenAt: now,
      source,
    });
    touched.add(o.id);
  }

  private changed(ids: Set<PlayerId>, source: PlayerSource) {
    if (ids.size === 0) return;
    for (const id of ids) this.dirty.add(id);
    this.scheduleFlush();
    this.bus.emit('player.updated', { ids: [...ids], source });
  }

  // debt: no cleanup yet. ceiling: players table grows with every player ever seen.
  // upgrade: delete players unseen for 90 days without references, once notes and PvP history reference players (phase 2).
  private scheduleFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const rows = [...this.dirty].map((id) => this.players.get(id)).filter((p): p is Player => p !== undefined);
      this.dirty.clear();
      this.persistence.put(rows).catch((error) => logError('saving players failed', error));
    });
  }
}
