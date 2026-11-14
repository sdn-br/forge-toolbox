// How active a player is, from their days at foestats or ScoreDB. Points that change either way count, as tearing down a
// great building costs points; battles only rise. Neither is proof: others may level a great building of an idle player,
// an active player may only level buildings. Good enough as a hint (Nutzer, 2026-11-14).
import { DAY_MS } from '../../shared/time';

/** a day as foestats saw it; a value is missing when foestats did not tell it */
export interface ActivityDay {
  /** `YYYY-MM-DD` */
  date: string;
  points?: number;
  battles?: number;
}

export interface Activity {
  /**
   * the last day with other points or more battles than the calendar day before; missing when no such change is known,
   * also when the last change lies in a gap between two known days
   */
  lastActive?: string;
  /** days from `lastActive` to the current foestats day, 0 for today */
  daysAgo?: number;
  /** without a known `lastActive`: days from the oldest day known without a change to the current foestats day */
  flatFor?: number;
  /** `IDLE_DAYS` or more days without a change */
  idle: boolean;
  /** change from a week before the newest day (or from the oldest day, if that is younger) to the newest day */
  week: { points?: number; battles?: number; days: number };
}

/** from this many days without a change on, a player counts as idle */
const IDLE_DAYS = 3;
const WEEK = 7;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

const rose = (before: number | undefined, after: number | undefined) =>
  before !== undefined && after !== undefined && after > before;

const differs = (before: number | undefined, after: number | undefined) =>
  before !== undefined && after !== undefined && after !== before;

const change = (from: number | undefined, to: number | undefined) =>
  from === undefined || to === undefined ? undefined : to - from;

/** `today` is the current foestats day; undefined without any day */
export function playerActivity(history: ActivityDay[], today: string): Activity | undefined {
  const days = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = days[0];
  const newest = days.at(-1);
  if (!first || !newest) return undefined;

  // the newest change decides; across a gap its day is not known, only that it was quiet since the day after the gap
  let lastActive: string | undefined;
  let flatSince = first.date;
  for (let i = days.length - 1; i > 0; i--) {
    const [before, after] = [days[i - 1] as ActivityDay, days[i] as ActivityDay];
    if (!differs(before.points, after.points) && !rose(before.battles, after.battles)) continue;
    if (daysBetween(before.date, after.date) === 1) lastActive = after.date;
    else flatSince = after.date;
    break;
  }
  const quiet = daysBetween(lastActive ?? flatSince, today);

  const base = [...days].reverse().find((d) => daysBetween(d.date, newest.date) >= WEEK) ?? first;
  const points = change(base.points, newest.points);
  const battles = change(base.battles, newest.battles);
  return {
    lastActive,
    daysAgo: lastActive === undefined ? undefined : quiet,
    flatFor: lastActive === undefined ? quiet : undefined,
    idle: quiet >= IDLE_DAYS,
    week: { points, battles, days: daysBetween(base.date, newest.date) },
  };
}
