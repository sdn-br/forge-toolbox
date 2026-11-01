// The rules of the import "Zusammenführen": what a row of the file does to the row the profile already holds. Each rule
// returns the row to write, or undefined when the local row stays as it is.
import type { CityShield, NotePage, Player } from '../shared/model';
import { type BackupTables, playersToKeep, referencedPlayers } from './format';

/** The parts of a profile the import offers one by one. */
export type Area = 'pvp' | 'notes' | 'greatBuildings' | 'settings';

/** the areas with rows in the databases; settings live in chrome.storage.local */
export const DATA_AREAS = ['pvp', 'notes', 'greatBuildings'] as const satisfies readonly Area[];

/** A rule: the local row with the same key (undefined when there is none) and the row of the file. */
export type MergeRule<T> = (local: T | undefined, source: T) => T | undefined;

/** The rows to write, `local[i]` is the stored row with the key of `source[i]`. */
export function mergeRows<T>(source: T[], local: (T | undefined)[], rule: MergeRule<T>): T[] {
  return source.flatMap((row, i) => {
    const next = rule(local[i], row);
    return next ? [next] : [];
  });
}

/** Battles, plunders, attacks on the own city and note groups never change once stored: only missing ones come in. */
export const addMissing = <T>(local: T | undefined, source: T): T | undefined => (local ? undefined : source);

/** a note page: the one edited last wins */
export const newerPage: MergeRule<NotePage> = (local, source) =>
  !local || source.updatedAt > local.updatedAt ? source : undefined;

/** a city shield: the one that runs longer wins */
export const longerShield: MergeRule<CityShield> = (local, source) =>
  !local || source.expiresAt > local.expiresAt ? source : undefined;

/** A row seen in the game with marks of the session player: players and great buildings. */
interface Marked {
  seenAt: number;
  marked?: boolean;
  ignored?: boolean;
  marksAt?: number;
}

/**
 * Players and great buildings: the game data come from the row with the newer `seenAt`, the star and the ignore from
 * the row with the newer `marksAt`. A row of the file without `marksAt` leaves the local marks as they are.
 */
export function mergeMarked<T extends Marked>(local: T | undefined, source: T): T | undefined {
  if (!local) return source;
  const game = source.seenAt > local.seenAt;
  const marks = source.marksAt !== undefined && source.marksAt > (local.marksAt ?? Number.NEGATIVE_INFINITY);
  if (!game && !marks) return undefined;
  const { marked, ignored, marksAt, ...data } = game ? source : local;
  const from = marks ? source : local;
  return {
    ...data,
    ...(from.marked && { marked: true }),
    ...(from.ignored && { ignored: true }),
    ...(from.marksAt !== undefined && { marksAt: from.marksAt }),
  } as T;
}

/** the PvP marks of a player come from the row with the newer `pvpMarksAt`, whichever row the game data come from */
const withPvpMarks = (row: Player, from: Player): Player => {
  const { plunderWorthy: _, noAttack: __, pvpMarksAt: ___, ...rest } = row;
  return {
    ...rest,
    ...(from.plunderWorthy && { plunderWorthy: true }),
    ...(from.noAttack && { noAttack: true }),
    ...(from.pvpMarksAt !== undefined && { pvpMarksAt: from.pvpMarksAt }),
  };
};

/** the fields of a player a great building list does not carry */
const LIST_GAPS = ['avatar', 'cityName', 'era', 'score', 'rank', 'active'] as const;

/**
 * A player: as `mergeMarked`, and the two PvP marks from the row with the newer `pvpMarksAt`, independent of the great
 * building marks. A row known only from a great building list lacks most game fields; whichever row wins,
 * the fields it lacks come from the other row, so a list never wipes what a richer row knows and a richer row of the
 * file fills a row the profile knows only from a list.
 */
export const mergePlayer: MergeRule<Player> = (local, source) => {
  const merged = mergeMarked(local, source);
  if (!local) return merged;
  const base = merged ?? local;
  const other = source.seenAt > local.seenAt ? local : source;
  const filled: Partial<Player> = {};
  for (const key of LIST_GAPS)
    if (base[key] === undefined && other[key] !== undefined) Object.assign(filled, { [key]: other[key] });
  const pvp = source.pvpMarksAt !== undefined && source.pvpMarksAt > (local.pvpMarksAt ?? Number.NEGATIVE_INFINITY);
  if (!merged && !pvp && Object.keys(filled).length === 0) return undefined;
  return withPvpMarks({ ...base, ...filled }, pvp ? source : local);
};

/**
 * The rows of the chosen areas, and the players that go with them: the ones those rows refer to and the marked or
 * ignored ones. Without any area with rows there are no players either.
 */
export function selectTables(tables: BackupTables, areas: ReadonlySet<Area>): BackupTables {
  const pvp = areas.has('pvp');
  const notes = areas.has('notes');
  const buildings = areas.has('greatBuildings');
  const picked: Omit<BackupTables, 'players'> = {
    battles: pvp ? tables.battles : [],
    plunders: pvp ? tables.plunders : [],
    incoming: pvp ? tables.incoming : [],
    cityShields: pvp ? tables.cityShields : [],
    noteGroups: notes ? tables.noteGroups : [],
    notePages: notes ? tables.notePages : [],
    greatBuildings: buildings ? tables.greatBuildings : [],
  };
  const players = pvp || notes || buildings ? playersToKeep(tables.players, referencedPlayers(picked)) : [];
  return { ...picked, players };
}
