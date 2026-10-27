// The mappers of the old toolbox: one per schema version, each translates the rows of its databases into the tables
// of the backup file and counts the rows it could not map. Left out on purpose, and not counted: shields (type 5),
// arena battles, events that are no attack on the own city, and everything outside these tables.
//
// The meanings come from the schemas of the old toolbox (neighborhoodAttacks, Events, the notes database); none of
// its code is used.
import { PLAYER_GROUP, playerPageId } from '../../content/stores/notes';
import { buildingDefId, eraId, guildId, type PlayerId, playerId } from '../../shared/ids';
import type {
  Battle,
  BattleResult,
  BattleSide,
  IncomingAttack,
  NoteGroup,
  NotePage,
  Player,
  Plunder,
} from '../../shared/model';
import type { Profile } from '../../shared/profile';
import type { BackupTables } from '../format';
import { htmlToMarkdown } from './html-markdown';
import type { LegacyDump } from './types';

export interface LegacyMapped {
  tables: BackupTables;
  /** rows the mapper could not translate: unknown types, missing players or times, broken note pages */
  unmapped: number;
}

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const id = (v: unknown) => {
  const n = num(v);
  return n !== undefined && Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** Dexie stores a Date; a copy as JSON has the ISO string */
function time(v: unknown): number | undefined {
  const t = v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : num(v);
  return t !== undefined && Number.isFinite(t) ? t : undefined;
}

/** the old toolbox writes `unknown` for an era it did not know, the new one an empty id */
const era = (v: unknown) => eraId(str(v) && v !== 'unknown' ? (v as string) : '');

// neighborhoodAttacks.type
const LOOTED = 1;
const RESULTS: Record<number, BattleResult> = { 2: 'won', 3: 'lost', 4: 'surrendered' };
const SHIELDED = 5;
const REPELLED = 6;

// The old toolbox kept per unit the summed attack and defense boost of its side. The new battles keep the game's bonus
// types; these are the types the measured army (src/content/domain/measured-army.ts) adds up for each side.
function side(units: unknown, attacking: boolean): BattleSide | undefined {
  if (!Array.isArray(units)) return undefined;
  const rows = units.filter(isRow);
  const first = rows[0];
  const attack = num(first?.attBoost) ?? 0;
  const defense = num(first?.defBoost) ?? 0;
  return {
    bonuses: first
      ? attacking
        ? { attack_boost: attack, attacker_defense_boost: defense }
        : { defender_attack_boost: attack, defense_boost: defense }
      : {},
    units: rows.map((u) => ({
      unitTypeId: str(u.unitTypeId) ?? 'unknown',
      startHp: num(u.startHP) ?? 0,
      endHp: num(u.endHp) ?? 0,
    })),
  };
}

function resources(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRow(v)) for (const [k, n] of Object.entries(v)) if (num(n) !== undefined) out[k] = n as number;
  return out;
}

interface Collected {
  battles: Battle[];
  plunders: Plunder[];
  incoming: IncomingAttack[];
  noteGroups: NoteGroup[];
  notePages: NotePage[];
  /** players the rows name without a row in the players table: name and avatar from the events or notes */
  named: Map<PlayerId, Player>;
  unmapped: number;
}

function mapAttacks(rows: unknown[], profile: Profile, out: Collected) {
  const { world } = profile;
  for (const row of rows) {
    if (!isRow(row)) {
      out.unmapped++;
      continue;
    }
    const type = num(row.type);
    if (type === SHIELDED || row.pvpArena === true) continue;
    const opponent = id(row.playerId);
    const at = time(row.date);
    const result = type === undefined ? undefined : RESULTS[type];
    if (opponent === undefined || at === undefined) {
      out.unmapped++;
    } else if (result) {
      const battle = isRow(row.battle) ? row.battle : undefined;
      const attacker = side(battle?.myArmy, true);
      const defender = side(battle?.otherArmy, false);
      if (!battle || !attacker || !defender) {
        out.unmapped++;
        continue;
      }
      out.battles.push({
        world,
        // no battle id in the old data: a negative one never meets an id of the game
        battleId: -at,
        at,
        opponent: playerId(opponent),
        result,
        auto: battle.auto === true,
        rounds: num(battle.round) ?? 1,
        era: era(battle.era),
        attacker,
        defender,
      });
    } else if (type === LOOTED || type === REPELLED) {
      const entityId = num(row.entityId);
      const building = str(row.buildId);
      out.plunders.push({
        world,
        at,
        opponent: playerId(opponent),
        outcome: type === LOOTED ? 'plundered' : 'repelled',
        ...(entityId !== undefined && { entityId }),
        ...(building && { cityEntityId: buildingDefId(building) }),
        resources: type === LOOTED ? resources(row.resources) : {},
        doubleLoot: type === LOOTED && row.doubleLoot === true,
      });
    } else {
      out.unmapped++;
    }
  }
}

const NO_RELATIONS = { neighbor: false, guildMember: false, friend: false };

/** a player known only by name, from an event or a note; a later sighting replaces it */
function named(out: Collected, profile: Profile, player: PlayerId, name: string, avatar: string, seenAt: number) {
  const known = out.named.get(player);
  if (known && known.seenAt >= seenAt) return;
  out.named.set(player, {
    world: profile.world,
    id: player,
    name,
    avatar,
    cityName: '',
    era: eraId(''),
    score: 0,
    rank: 0,
    active: true,
    relations: NO_RELATIONS,
    firstSeenAt: seenAt,
    seenAt,
    source: 'legacy',
  });
}

// An event names the other player; a battle is an attack on the own city, a social interaction "plunder" a plunder
// of an own building. The events keep neither the battle id nor the outcome.
function mapEvents(rows: unknown[], profile: Profile, out: Collected) {
  for (const row of rows) {
    if (!isRow(row)) {
      out.unmapped++;
      continue;
    }
    const plunder = row.eventtype === 'social_interaction' && row.interactiontype === 'plunder';
    if (row.eventtype !== 'battle' && !plunder) continue;
    const attacker = id(row.playerid);
    const at = time(row.date);
    const key = id(row.eventid);
    if (attacker === undefined || at === undefined || key === undefined) {
      out.unmapped++;
      continue;
    }
    if (attacker === profile.player) continue;
    const base = { world: profile.world, at, attacker: playerId(attacker) };
    const building = str(row.entityid);
    out.incoming.push(
      plunder
        ? { ...base, kind: 'plunder', key, ...(building && { cityEntityId: buildingDefId(building) }) }
        : // the game's battle id is unknown: the negative event id stands in and never meets one
          { ...base, kind: 'battle', key: -key },
    );
    const name = str(row.playername);
    if (name) named(out, profile, playerId(attacker), name, '', at);
  }
}

/** the player of a player page: `player_data` is the JSON of the player as the old toolbox knew it */
function pagePlayer(v: unknown): Row | undefined {
  try {
    const data: unknown = typeof v === 'string' ? JSON.parse(v) : undefined;
    return isRow(data) && id(Number(data.PlayerID)) !== undefined ? data : undefined;
  } catch {
    return undefined;
  }
}

function mapNotes(groups: unknown[], items: unknown[], profile: Profile, now: number, out: Collected) {
  const { world } = profile;
  /** old group id to the new one; the old player groups all go to the player pages */
  const target = new Map<number, string>();
  for (const g of groups) {
    const gid = isRow(g) ? id(g.id) : undefined;
    if (!isRow(g) || gid === undefined) {
      out.unmapped++;
      continue;
    }
    if (g.player_group) {
      target.set(gid, PLAYER_GROUP);
      continue;
    }
    const groupId = `legacy:${gid}`;
    target.set(gid, groupId);
    out.noteGroups.push({ world, id: groupId, name: str(g.group_name) ?? '', sort: num(g.sort) ?? 0 });
  }
  const players = new Map<PlayerId, NotePage>();
  for (const item of items) {
    const iid = isRow(item) ? id(item.id) : undefined;
    const group = isRow(item) ? target.get(num(item.groupId) ?? -1) : undefined;
    if (!isRow(item) || iid === undefined || group === undefined) {
      out.unmapped++;
      continue;
    }
    const tab = str(item.tab) ?? '';
    let text = htmlToMarkdown(str(item.content) ?? '');
    const sort = num(item.sort) ?? 0;
    if (group === PLAYER_GROUP) {
      const data = pagePlayer(item.player_data);
      if (!data) {
        out.unmapped++;
        continue;
      }
      if (!text) continue;
      const player = playerId(Number(data.PlayerID));
      named(out, profile, player, str(data.PlayerName) ?? tab, str(data.Avatar) ?? '', 0);
      // two pages of one player, from before the old toolbox merged them: one page, the texts one below the other
      const page = players.get(player);
      if (page) {
        page.text = `${page.text}\n\n${text}`;
        continue;
      }
      const created: NotePage = {
        world,
        id: playerPageId(player),
        group,
        title: tab,
        text,
        sort,
        updatedAt: now,
        player,
      };
      players.set(player, created);
      out.notePages.push(created);
      continue;
    }
    // an own heading of older versions that differs from the page name goes into the text, as the old toolbox did
    const title = htmlToMarkdown(str(item.title) ?? '').replace(/\s+/g, ' ');
    if (title && title !== tab) text = `**${title}**\n${text}`;
    out.notePages.push({ world, id: `legacy:${iid}`, group, title: tab, text, sort, updatedAt: now });
  }
}

/** a player of the players table, when a row refers to it */
function player(row: Row, profile: Profile): Player | undefined {
  const pid = id(row.id);
  const name = str(row.name);
  if (pid === undefined || name === undefined) return undefined;
  const seenAt = time(row.date) ?? 0;
  const clan = id(row.clanId);
  return {
    world: profile.world,
    id: playerId(pid),
    name,
    avatar: str(row.avatar) ?? '',
    cityName: '',
    era: era(row.era),
    score: num(row.score) ?? 0,
    rank: 0,
    active: true,
    ...(clan !== undefined && { guild: { id: guildId(clan), name: str(row.clanName) ?? '' } }),
    relations: NO_RELATIONS,
    firstSeenAt: seenAt,
    seenAt,
    source: 'legacy',
  };
}

function map(dump: LegacyDump, profile: Profile, now: number, notes: boolean): LegacyMapped {
  const out: Collected = {
    battles: [],
    plunders: [],
    incoming: [],
    noteGroups: [],
    notePages: [],
    named: new Map(),
    unmapped: 0,
  };
  mapAttacks(dump.attacks, profile, out);
  mapEvents(dump.events, profile, out);
  if (notes) mapNotes(dump.groups ?? [], dump.items ?? [], profile, now, out);

  const referenced = new Set<number>([
    ...out.battles.map((b) => b.opponent),
    ...out.plunders.map((p) => p.opponent),
    ...out.incoming.map((a) => a.attacker),
    ...out.notePages.flatMap((p) => (p.player === undefined ? [] : [p.player])),
  ]);
  const players = new Map<number, Player>();
  for (const row of dump.players) {
    const p = isRow(row) ? player(row, profile) : undefined;
    if (p && referenced.has(p.id)) players.set(p.id, p);
  }
  for (const [pid, p] of out.named) if (!players.has(pid)) players.set(pid, p);

  return {
    tables: {
      battles: out.battles,
      plunders: out.plunders,
      incoming: out.incoming,
      noteGroups: out.noteGroups,
      notePages: out.notePages,
      cityShields: [],
      greatBuildings: [],
      players: [...players.values()],
    },
    unmapped: out.unmapped,
  };
}

/** The toolbox 2.x: attacks, players, events and the notes. */
export const mapToolbox2 = (dump: LegacyDump, profile: Profile, now: number): LegacyMapped =>
  map(dump, profile, now, true);

/**
 * The toolbox 1.x (last 1.9.4.0): the same attacks without the arena flag and without repelled plunders, the same
 * events; its notes lived on a server and are not in the game page.
 */
export const mapToolbox1 = (dump: LegacyDump, profile: Profile, now: number): LegacyMapped =>
  map({ attacks: dump.attacks, players: dump.players, events: dump.events }, profile, now, false);
