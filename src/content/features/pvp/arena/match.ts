// Which stored arena battle an attack line of the arena log belongs to. The log has no battle id, so the line is matched
// by opponent, time and points.
import type { ArenaBattle, ArenaLogEntry } from '../../../../shared/model';

/**
 * How long before its line a manual battle may have started. An auto battle's line carries the start time of the
 * battle, a manual battle's line the time it ended (the fixture of a manual battle with 23 moves: 145 s after the
 * start). Equal points and one battle at a time keep a wide window safe.
 */
export const MATCH_WINDOW = 15 * 60_000;

/** the battle won or lost the line's points; a battle without points by its result against the sign of the points */
const sameOutcome = (b: ArenaBattle, line: ArenaLogEntry) =>
  b.points === undefined ? (b.result === 'won') === line.points > 0 : b.points === line.points;

/** an auto battle's line has its start time, a manual battle's line comes when it ends, within the window */
const inTime = (b: ArenaBattle, line: ArenaLogEntry) =>
  b.auto ? line.at === b.at : b.at <= line.at && line.at - b.at <= MATCH_WINDOW;

/** whether the battle may be the one of this line: an attack on the same opponent, in time, with its points */
export const fits = (b: ArenaBattle, line: ArenaLogEntry) =>
  line.kind === 'attack' && b.opponent === line.opponent && inTime(b, line) && sameOutcome(b, line);

/**
 * The battle of each line, in the order of `lines`; undefined for a defense and for an attack without a stored battle.
 * A battle's line comes before the next battle starts, so each battle, oldest first, takes the earliest line left that
 * fits it; each line gets one battle at most.
 */
export function matchBattles(lines: ArenaLogEntry[], battles: ArenaBattle[]): (ArenaBattle | undefined)[] {
  const matched: (ArenaBattle | undefined)[] = lines.map(() => undefined);
  const oldestFirst = lines.map((_, i) => i).sort((a, b) => (lines[a]?.at ?? 0) - (lines[b]?.at ?? 0));
  for (const battle of [...battles].sort((a, b) => a.at - b.at)) {
    const i = oldestFirst.find((i) => matched[i] === undefined && fits(battle, lines[i] as ArenaLogEntry));
    if (i !== undefined) matched[i] = battle;
  }
  return matched;
}
