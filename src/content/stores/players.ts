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

/**
 * What a great building list tells about the owner of a row: the id, the name and maybe the avatar. The ranking window
 * also tells city, era and guild.
 */
export interface ListedPlayer {
  id: PlayerId;
  name: string;
  /** missing or empty keeps what is known */
  avatar?: string;
  /** missing keeps what is known */
  cityName?: string;
  era?: EraId;
  /** `null` means "no guild"; missing keeps what is known. The flag of the same guild stays */
  guild?: GuildRef | null;
}

export interface PlayerPersistence {
  load(world: WorldId): Promise<Player[]>;
  put(rows: Player[]): Promise<void>;
}

/** the lists of the social list: one per relation, and the own invitations the other side has not accepted */
export type SocialLists = Record<keyof Relations, PlayerObservation[]> & { invited?: PlayerObservation[] };

const NO_RELATIONS: Relations = { neighbor: false, guildMember: false, friend: false };

/** The two pairs of flags that exclude each other, each with the time of its last change and its change event. */
const PAIRS = {
  marked: { other: 'ignored', at: 'marksAt', source: 'mark' },
  ignored: { other: 'marked', at: 'marksAt', source: 'ignore' },
  plunderWorthy: { other: 'noAttack', at: 'pvpMarksAt', source: 'plunderWorthy' },
  noAttack: { other: 'plunderWorthy', at: 'pvpMarksAt', source: 'noAttack' },
} as const;

export type FlagKind = keyof typeof PAIRS;
type MarkField = FlagKind | (typeof PAIRS)[FlagKind]['at'];
const MARK_FIELDS = [...Object.keys(PAIRS), ...new Set(Object.values(PAIRS).map((p) => p.at))] as MarkField[];

/** the marks of a player, the part no game source reports */
const marksOf = (p: Player | undefined): Pick<Player, MarkField> =>
  Object.fromEntries(MARK_FIELDS.filter((k) => p?.[k] !== undefined).map((k) => [k, p?.[k]]));

/** what a listed player says about the fields beyond the name: what it does not bring stays as known */
const listedFields = (
  l: ListedPlayer,
  old?: Pick<Player, 'guild'>,
): Pick<Player, 'avatar' | 'cityName' | 'era' | 'guild'> => ({
  ...(l.avatar && { avatar: l.avatar }),
  ...(l.cityName !== undefined && { cityName: l.cityName }),
  ...(l.era !== undefined && { era: l.era }),
  ...(l.guild && {
    guild: {
      ...l.guild,
      ...(old?.guild?.id === l.guild.id && { flag: old.guild.flag }),
    },
  }),
});

/** what a view shows of a listed player, as one key */
const shownOf = (p: Player | undefined) =>
  JSON.stringify([p?.name, p?.avatar, p?.cityName, p?.era, p?.guild?.id, p?.guild?.name]);

/** A known player seen in a list: the name follows the newest sighting, an empty avatar keeps the known one. */
const listedOnto = <T extends Omit<Player, MarkField>>(old: T, l: ListedPlayer, seenAt: number): T => {
  const next: T = { ...old, name: l.name, ...listedFields(l, old), seenAt: Math.max(old.seenAt, seenAt) };
  if (l.guild === null) delete next.guild;
  return next;
};

/** the row as a view sees it: the time of the last sighting is no change, key order is none either */
const visible = (p: Player | undefined) =>
  p &&
  JSON.stringify({ ...p, seenAt: 0 }, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

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
      let touched = false;
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
        touched = true;
      }
      // the marks are the player's own and the game never reports them, so what the database holds stays
      // (a flag the player set this session wins over the other one of the database, the two exclude each other;
      // their time goes with them, a change this session is newer than any in the database)
      const patch: Partial<Player> = {};
      for (const [kind, { other, at }] of Object.entries(PAIRS) as [FlagKind, (typeof PAIRS)[FlagKind]][]) {
        if (row[kind] && !live[kind] && !live[other]) patch[kind] = true;
        if (live[at] === undefined && row[at] !== undefined) patch[at] = row[at];
      }
      if (Object.keys(patch).length > 0) {
        live = { ...live, ...patch };
        this.players.set(row.id, live);
        touched = true;
      }
      if (touched) {
        this.dirty.add(row.id);
        this.scheduleFlush();
      }
    }
  }

  get(id: PlayerId): Player | undefined {
    return this.players.get(id);
  }

  /** whether the player carries this flag; undefined for a player the store does not know */
  flag(id: PlayerId, kind: FlagKind): boolean | undefined {
    const p = this.players.get(id);
    return p && p[kind] === true;
  }

  list(filter: { relation?: keyof Relations } = {}): Player[] {
    const all = [...this.players.values()];
    return filter.relation ? all.filter((p) => p.relations[filter.relation as keyof Relations]) : all;
  }

  /**
   * Sets or clears a flag on a player. Only a player the store knows can be flagged; false for any other. Setting a
   * flag clears the one that excludes it (star and ignore, `plunderWorthy` and `noAttack`) and stamps the time of the
   * pair. The great building marks are not touched.
   */
  setFlag(id: PlayerId, kind: FlagKind, value: boolean): boolean {
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

  /**
   * The social list is the full truth about relations: whoever is missing from a list loses that relation. The same
   * goes for the friend invitation: it stays only on the players `invited` names (the own invitations the other side
   * has not accepted), and never on a friend.
   */
  applySocialList(world: WorldId, lists: SocialLists): void {
    const { invited = [], ...byRelation } = lists;
    const relations = new Map<PlayerId, Relations>();
    for (const [relation, observations] of Object.entries(byRelation) as [keyof Relations, PlayerObservation[]][]) {
      for (const o of observations) relations.set(o.id, { ...(relations.get(o.id) ?? NO_RELATIONS), [relation]: true });
    }
    const touched = new Set<PlayerId>();
    for (const observations of [...Object.values(byRelation), invited]) {
      for (const o of observations) this.merge(world, o, 'socialList', relations.get(o.id) ?? NO_RELATIONS, touched);
    }
    const pending = new Set(invited.filter((o) => !relations.get(o.id)?.friend).map((o) => o.id));
    for (const p of [...this.players.values()]) {
      if (p.world !== world) continue;
      const { neighbor, guildMember, friend } = p.relations;
      const lost = !relations.has(p.id) && (neighbor || guildMember || friend);
      if (lost || (p.friendInvited === true) !== pending.has(p.id)) {
        const { friendInvited: _, ...rest } = p;
        this.players.set(p.id, {
          ...rest,
          ...(lost && { relations: NO_RELATIONS }),
          ...(pending.has(p.id) && { friendInvited: true }),
        });
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
              ...listedFields(l),
              relations: NO_RELATIONS,
              firstSeenAt: now,
              seenAt: now,
              source: 'list',
            };
      this.players.set(l.id, next);
      // the same name again changes no view; only the sighting is saved
      if (shownOf(next) !== shownOf(old)) touched.add(l.id);
      else this.dirty.add(l.id);
    }
    if (touched.size === 0 && this.dirty.size > 0) this.scheduleFlush();
    this.changed(touched, 'list');
  }

  /** An accepted friend invitation: the new friend with what the player brings; the other relations stay, the invitation is over. */
  addFriend(world: WorldId, o: PlayerObservation): void {
    const touched = new Set<PlayerId>();
    this.merge(world, o, 'friend', { ...(this.players.get(o.id)?.relations ?? NO_RELATIONS), friend: true }, touched);
    const { friendInvited: _, ...friend } = this.players.get(o.id) as Player;
    this.players.set(o.id, friend);
    touched.add(o.id);
    this.changed(touched, 'friend');
  }

  /**
   * A friend invitation the session player just sent: the player with what the answer brings, flagged as invited.
   * The relations stay; a player the store did not know is a neighbour when the answer says so.
   */
  addInvitation(world: WorldId, o: PlayerObservation, neighbor: boolean): void {
    const touched = new Set<PlayerId>();
    const old = this.players.get(o.id);
    this.merge(world, o, 'friend', old?.world === world ? old.relations : { ...NO_RELATIONS, neighbor }, touched);
    const known = this.players.get(o.id) as Player;
    // an invitation to a friend is no invitation: the list or an acceptance named the friend already
    if (!known.relations.friend) this.players.set(o.id, { ...known, friendInvited: true });
    touched.add(o.id);
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
    const next: Player = {
      ...fields,
      score: score ?? old?.score ?? 0,
      rank: rank ?? old?.rank ?? 0,
      world,
      guild: guild ?? undefined,
      relations: relations ?? old?.relations ?? NO_RELATIONS,
      ...(known && { attack: known }),
      ...marksOf(old),
      ...(old?.friendInvited && { friendInvited: true }),
      firstSeenAt: old?.firstSeenAt ?? now,
      seenAt: now,
      source,
    };
    this.players.set(o.id, next);
    // a sighting that changes only the time is saved and tells no view
    if (visible(next) !== visible(old)) touched.add(o.id);
    else this.dirty.add(o.id);
  }

  private changed(ids: Set<PlayerId>, source: ToolboxEvents['player.updated']['source']) {
    if (ids.size === 0) {
      if (this.dirty.size > 0) this.scheduleFlush();
      return;
    }
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
