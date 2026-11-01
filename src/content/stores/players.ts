import type { EraId, PlayerId, WorldId } from '../../shared/ids';
import type { AttackTimer, GuildRef, Player, PlayerSource, Relations } from '../../shared/model';
import type { ToolboxBus, ToolboxEvents } from '../core/events';
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

/** What a great building list tells about the owner of a row: the id, the name and maybe the avatar. */
export interface ListedPlayer {
  id: PlayerId;
  name: string;
  /** missing or empty keeps what is known */
  avatar?: string;
}

export interface PlayerPersistence {
  load(world: WorldId): Promise<Player[]>;
  put(rows: Player[]): Promise<void>;
}

const NO_RELATIONS: Relations = { neighbor: false, guildMember: false, friend: false };

/** The two pairs of flags that exclude each other, each with the time of its last change and its change event. */
const PAIRS = {
  marked: { other: 'ignored', at: 'marksAt', source: 'mark' },
  ignored: { other: 'marked', at: 'marksAt', source: 'ignore' },
  plunderWorthy: { other: 'noAttack', at: 'pvpMarksAt', source: 'plunderWorthy' },
  noAttack: { other: 'plunderWorthy', at: 'pvpMarksAt', source: 'noAttack' },
} as const;

type FlagKind = keyof typeof PAIRS;
const PAIR_GROUPS = [
  ['marked', 'ignored', 'marksAt'],
  ['plunderWorthy', 'noAttack', 'pvpMarksAt'],
] as const;
const MARK_FIELDS = ['marked', 'ignored', 'marksAt', 'plunderWorthy', 'noAttack', 'pvpMarksAt'] as const;
type MarkField = (typeof MARK_FIELDS)[number];

/** the marks of a player, the part no game source reports */
const marksOf = (p: Player | undefined): Pick<Player, MarkField> =>
  Object.fromEntries(MARK_FIELDS.filter((k) => p?.[k] !== undefined).map((k) => [k, p?.[k]]));

/** A known player seen in a list: the name follows the newest sighting, an empty avatar keeps the known one. */
const listedOnto = <T extends Omit<Player, MarkField>>(
  old: T,
  l: Pick<ListedPlayer, 'name' | 'avatar'>,
  seenAt: number,
): T => ({
  ...old,
  name: l.name,
  ...(l.avatar && { avatar: l.avatar }),
  seenAt: Math.max(old.seenAt, seenAt),
});

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
      let live = this.players.get(row.id);
      if (!live) {
        this.players.set(row.id, row);
        continue;
      }
      if (live.source === 'list') {
        // known this session only from a list: the database knows more, the list adds only the name and the sighting
        const data = { ...row };
        for (const k of MARK_FIELDS) delete data[k];
        live = { ...listedOnto(data, live, live.seenAt), ...marksOf(live) };
        this.players.set(row.id, live);
        this.dirty.add(row.id);
        this.scheduleFlush();
      }
      // the marks are the player's own and the game never reports them, so what the database holds stays
      // (a flag the player set this session wins over the other one of the database, the two exclude each other;
      // their time goes with them, a change this session is newer than any in the database)
      const patch: Partial<Player> = {};
      for (const [a, b, at] of PAIR_GROUPS) {
        for (const [kind, other] of [
          [a, b],
          [b, a],
        ] as const)
          if (row[kind] && !live[kind] && !live[other]) patch[kind] = true;
        if (live[at] === undefined && row[at] !== undefined) patch[at] = row[at];
      }
      if (Object.keys(patch).length > 0) {
        this.players.set(row.id, { ...live, ...patch });
        this.dirty.add(row.id);
        this.scheduleFlush();
      }
    }
  }

  get(id: PlayerId): Player | undefined {
    return this.players.get(id);
  }

  /** whether the player carries a star; undefined for a player the store does not know */
  marked(id: PlayerId): boolean | undefined {
    const p = this.players.get(id);
    return p && p.marked === true;
  }

  /** whether the player is ignored; undefined for a player the store does not know */
  ignored(id: PlayerId): boolean | undefined {
    const p = this.players.get(id);
    return p && p.ignored === true;
  }

  /** whether the player is good to plunder; undefined for a player the store does not know */
  plunderWorthy(id: PlayerId): boolean | undefined {
    const p = this.players.get(id);
    return p && p.plunderWorthy === true;
  }

  /** whether the player is not to be attacked; undefined for a player the store does not know */
  noAttack(id: PlayerId): boolean | undefined {
    const p = this.players.get(id);
    return p && p.noAttack === true;
  }

  list(filter: { relation?: keyof Relations } = {}): Player[] {
    const all = [...this.players.values()];
    return filter.relation ? all.filter((p) => p.relations[filter.relation as keyof Relations]) : all;
  }

  /** Puts a star on a player or takes it away. Only a player the store knows can be marked; false for any other.
   * A star clears the ignore, the two exclude each other. */
  setMarked(id: PlayerId, marked: boolean): boolean {
    return this.setFlag(id, 'marked', marked);
  }

  /** Ignores a player or releases them, with the same rules as the star. Ignoring clears the star. */
  setIgnored(id: PlayerId, ignored: boolean): boolean {
    return this.setFlag(id, 'ignored', ignored);
  }

  /** Marks a player as good to plunder or takes it away, with the rules of the star but its own time. It clears
   * `noAttack`. The great building marks are not touched. */
  setPlunderWorthy(id: PlayerId, value: boolean): boolean {
    return this.setFlag(id, 'plunderWorthy', value);
  }

  /** Marks a player as not to attack, with the same rules. It clears `plunderWorthy`. */
  setNoAttack(id: PlayerId, value: boolean): boolean {
    return this.setFlag(id, 'noAttack', value);
  }

  private setFlag(id: PlayerId, kind: FlagKind, value: boolean): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    if ((p[kind] === true) !== value) {
      const { other, at, source } = PAIRS[kind];
      const clears = value && p[other] === true;
      // releasing never meets the other flag set, the two exclude each other
      const { [kind]: _, [other]: __, ...rest } = p;
      const time = { [at]: this.now() };
      this.players.set(id, value ? { ...rest, [kind]: true, ...time } : { ...rest, ...time });
      if (clears) this.changed(new Set([id]), PAIRS[other].source);
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

  /**
   * Owners of great building lists (the town hall list, the list of another player): an unknown one is learned with
   * the name and no relation, a known one takes only the name and the avatar, as every sighting does. Nothing else
   * changes, neither the richer fields of other sources nor relations, timers or marks.
   */
  applyListed(world: WorldId, listed: ListedPlayer[]): void {
    const touched = new Set<PlayerId>();
    const now = this.now();
    for (const l of listed) {
      const old = this.players.get(l.id);
      const next: Player =
        old && old.world === world
          ? listedOnto(old, l, now)
          : {
              world,
              id: l.id,
              name: l.name,
              ...(l.avatar && { avatar: l.avatar }),
              relations: NO_RELATIONS,
              firstSeenAt: now,
              seenAt: now,
              source: 'list',
            };
      this.players.set(l.id, next);
      // the same name again changes no view; only the sighting is saved
      if (next.name !== old?.name || next.avatar !== old?.avatar) touched.add(l.id);
      else this.dirty.add(l.id);
    }
    if (touched.size === 0 && this.dirty.size > 0) this.scheduleFlush();
    this.changed(touched, 'list');
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
      ...marksOf(old),
      firstSeenAt: old?.firstSeenAt ?? now,
      seenAt: now,
      source,
    });
    touched.add(o.id);
  }

  private changed(ids: Set<PlayerId>, source: ToolboxEvents['player.updated']['source']) {
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
