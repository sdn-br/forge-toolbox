// Old and new toolbox recorded the same battles, plunders and attacks while both ran. The old rows have no battle id,
// so a row of the old data counts as known when a stored row of the same player, kind and outcome lies about two
// minutes from it. Each stored row stands for one old row only. Rows of an earlier import match the same way, so
// importing twice adds nothing.
import {
  type Battle,
  type IncomingAttack,
  isFought,
  type NoteGroup,
  type NotePage,
  type Player,
  type Plunder,
} from '../../shared/model';
import type { BackupTables } from '../format';

/** how far apart the old and the new toolbox may have stamped the same event */
export const SAME_EVENT_MS = 2 * 60 * 1000;

/** What the profile holds of the world: the rows old ones may repeat, and the stored rows of the players named. */
export type LocalRows = Pick<
  BackupTables,
  'battles' | 'plunders' | 'incoming' | 'noteGroups' | 'notePages' | 'players'
>;

/** the rows of `source` that no row of `local` matches; a local row matches at most one */
function unmatched<T>(source: T[], local: T[], group: (row: T) => string, same: (a: T, b: T) => boolean): T[] {
  const byGroup = new Map<string, T[]>();
  for (const row of local) {
    const key = group(row);
    byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
  }
  return source.filter((row) => {
    const candidates = byGroup.get(group(row));
    const i = candidates?.findIndex((other) => same(row, other)) ?? -1;
    if (i < 0) return true;
    candidates?.splice(i, 1);
    return false;
  });
}

const near = (a: { at: number }, b: { at: number }) => Math.abs(a.at - b.at) <= SAME_EVENT_MS;

// an inferred battle stands at the time of its plunder, not of a battle, so it never matches an old one
const battles = (source: Battle[], local: Battle[]) =>
  unmatched(
    source,
    local.filter(isFought),
    (b) => `${b.opponent}|${b.result}`,
    (a, b) => a.battleId === b.battleId || near(a, b),
  );

const plunders = (source: Plunder[], local: Plunder[]) =>
  unmatched(source, local, (p) => `${p.opponent}|${p.outcome}`, near);

/** a plunder of the own city carries the game's event id in both toolboxes, a battle only its time */
function incoming(source: IncomingAttack[], local: IncomingAttack[]): IncomingAttack[] {
  const keys = new Set(local.map((a) => `${a.kind}|${a.key}`));
  const rest = source.filter((a) => !keys.has(`${a.kind}|${a.key}`));
  return unmatched(rest, local, (a) => `${a.attacker}|${a.kind}`, near);
}

const maxSort = (rows: { sort: number }[]) => rows.reduce((max, r) => Math.max(max, r.sort), -1);
const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** new groups go behind the stored ones, in their old order */
function noteGroups(source: NoteGroup[], local: NoteGroup[]): NoteGroup[] {
  const stored = new Set(local.map((g) => g.id));
  const next = maxSort(local) + 1;
  return source
    .filter((g) => !stored.has(g.id))
    .sort(bySort)
    .map((g, i) => ({ ...g, sort: next + i }));
}

/**
 * A new page goes behind the stored pages of its group. A stored page with the same id (a player page, or a page of
 * an earlier import) keeps its text; the old text is appended when the page does not hold it yet, so nothing is lost
 * and a second import changes nothing.
 */
function notePages(source: NotePage[], local: NotePage[]): NotePage[] {
  const stored = new Map(local.map((p) => [p.id, p]));
  const changed: NotePage[] = [];
  const added = new Map<string, NotePage[]>();
  for (const page of source) {
    const known = stored.get(page.id);
    if (!known) {
      added.set(page.group, [...(added.get(page.group) ?? []), page]);
    } else if (!known.text.includes(page.text.trim())) {
      changed.push({
        ...known,
        text: known.text.trim() ? `${known.text}\n\n${page.text}` : page.text,
        // the merge writes only a newer page
        updatedAt: Math.max(page.updatedAt, known.updatedAt + 1),
      });
    }
  }
  const fresh = [...added].flatMap(([group, pages]) => {
    const next = maxSort(local.filter((p) => p.group === group)) + 1;
    return pages.sort(bySort).map((p, i) => ({ ...p, sort: next + i }));
  });
  return [...fresh, ...changed];
}

/**
 * A player the profile knows takes the game data of the old row only when that row is newer, and keeps what only the
 * stored row knows: city, rank, relations, attack timers, marks, first sighting.
 */
function players(source: Player[], local: Player[]): Player[] {
  const stored = new Map(local.map((p) => [p.id, p]));
  return source.flatMap((p) => {
    const known = stored.get(p.id);
    if (!known) return [p];
    if (p.seenAt <= known.seenAt) return [];
    return [
      {
        ...known,
        name: p.name,
        ...(p.avatar && { avatar: p.avatar }),
        ...(p.era && { era: p.era }),
        ...(p.score !== undefined && p.score > 0 && { score: p.score }),
        ...(p.guild && { guild: p.guild }),
        seenAt: p.seenAt,
      },
    ];
  });
}

/** The rows of the old data the profile does not hold yet, ready for the merge of the import. */
export function withoutKnown(source: BackupTables, local: LocalRows): BackupTables {
  return {
    ...source,
    battles: battles(source.battles, local.battles),
    plunders: plunders(source.plunders, local.plunders),
    incoming: incoming(source.incoming, local.incoming),
    noteGroups: noteGroups(source.noteGroups, local.noteGroups),
    notePages: notePages(source.notePages, local.notePages),
    players: players(source.players, local.players),
  };
}
