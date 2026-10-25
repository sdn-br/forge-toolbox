import type { EraId, PlayerId, WorldId } from '../../shared/ids';
import type { AttackTimer, GuildRef, MarkKind, Player, PlayerSource, Relations } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';

/** What one game response tells about a player. `guild: null` means "no guild", not "unknown". */
export interface PlayerObservation {
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  /** missing keeps what is known, as from an accepted friend invitation */
  score?: number;
  rank?: number;
  active: boolean;
  guild: GuildRef | null;
  /** only from sources that carry the whole player with its timers; missing keeps what is known */
  attack?: AttackTimer;
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
    for (const row of rows) {
      const live = this.players.get(row.id);
      if (!live) this.players.set(row.id, row);
      // the star and the ignore are the player's own and the game never reports them, so what the database holds stays
      // (a flag the player set this session wins over the other one of the database, the two exclude each other)
      else if ((row.marked && !live.marked && !live.ignored) || (row.ignored && !live.ignored && !live.marked)) {
        this.players.set(row.id, {
          ...live,
          ...(row.marked && { marked: true }),
          ...(row.ignored && { ignored: true }),
        });
        this.dirty.add(row.id);
        this.scheduleFlush();
      }
    }
  }

  get(id: PlayerId): Player | undefined {
    return this.players.get(id);
  }

  list(filter: { relation?: keyof Relations } = {}): Player[] {
    const all = [...this.players.values()];
    return filter.relation ? all.filter((p) => p.relations[filter.relation as keyof Relations]) : all;
  }

  /** Puts a star on a player or takes it away. Only a player the store knows can be marked; false for any other.
   * A star clears the ignore, the two exclude each other. */
  setMarked(id: PlayerId, marked: boolean): boolean {
    return this.setFlag(id, 'marked', marked, 'mark');
  }

  /** Ignores a player or releases them, with the same rules as the star. Ignoring clears the star. */
  setIgnored(id: PlayerId, ignored: boolean): boolean {
    return this.setFlag(id, 'ignored', ignored, 'ignore');
  }

  private setFlag(id: PlayerId, kind: MarkKind, value: boolean, source: 'mark' | 'ignore'): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    if ((p[kind] === true) !== value) {
      const other = kind === 'marked' ? 'ignored' : 'marked';
      const clears = value && p[other] === true;
      // releasing never meets the other flag set, the two exclude each other
      const { [kind]: _, [other]: __, ...rest } = p;
      this.players.set(id, value ? { ...rest, [kind]: true } : rest);
      if (clears) this.changed(new Set([id]), source === 'mark' ? 'ignore' : 'mark');
      this.changed(new Set([id]), source);
    }
    return true;
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

  /** An accepted friend invitation: the new friend with what the player brings; the other relations stay. */
  addFriend(world: WorldId, o: PlayerObservation): void {
    const touched = new Set<PlayerId>();
    this.merge(world, o, 'friend', { ...(this.players.get(o.id)?.relations ?? NO_RELATIONS), friend: true }, touched);
    this.changed(touched, 'friend');
  }

  /** A deleted friendship takes only `friend`; a player the store does not know stays unknown. */
  removeFriend(world: WorldId, id: PlayerId): void {
    const p = this.players.get(id);
    if (!p || p.world !== world || !p.relations.friend) return;
    this.players.set(id, { ...p, relations: { ...p.relations, friend: false } });
    this.changed(new Set([id]), 'friend');
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
    const { guild, attack, score, rank, ...fields } = o;
    const known = attack ?? old?.attack;
    this.players.set(o.id, {
      ...fields,
      score: score ?? old?.score ?? 0,
      rank: rank ?? old?.rank ?? 0,
      world,
      guild: guild ?? undefined,
      relations: relations ?? old?.relations ?? NO_RELATIONS,
      ...(known && { attack: known }),
      ...(old?.marked && { marked: true }),
      ...(old?.ignored && { ignored: true }),
      firstSeenAt: old?.firstSeenAt ?? now,
      seenAt: now,
      source,
    });
    touched.add(o.id);
  }

  private changed(ids: Set<PlayerId>, source: PlayerSource | 'mark' | 'ignore') {
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
