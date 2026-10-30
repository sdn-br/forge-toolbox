// How active a player is, from their days at foestats.
import { DAY_MS } from '../../shared/time';

/** a day as foestats saw it; a value is missing when foestats did not tell it */
export interface ActivityDay {
  /** `YYYY-MM-DD` */
  date: string;
  points?: number;
  battles?: number;
}

export interface Activity {
  /** the last day with more points or battles than the day before; missing when no increase is known */
  lastActive?: string;
  /** days from `lastActive` to the current foestats day, 0 for today */
  daysAgo?: number;
  /** without a known increase: days from the oldest known day to the current foestats day */
  flatFor?: number;
  /** `IDLE_DAYS` or more days without an increase */
  idle: boolean;
  /** change from a week before the newest day (or from the oldest day, if that is younger) to the newest day */
  week: { points?: number; battles?: number; days: number };
}

/** from this many days without an increase on, a player counts as idle */
const IDLE_DAYS = 3;
const WEEK = 7;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

const rose = (before: number | undefined, after: number | undefined) =>
  before !== undefined && after !== undefined && after > before;

const change = (from: number | undefined, to: number | undefined) =>
  from === undefined || to === undefined ? undefined : to - from;

/** `today` is the current foestats day; undefined without any day */
export function playerActivity(history: ActivityDay[], today: string): Activity | undefined {
  const days = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = days[0];
  const newest = days.at(-1);
  if (!first || !newest) return undefined;

  let lastActive: string | undefined;
  for (let i = days.length - 1; i > 0 && lastActive === undefined; i--) {
    const [before, after] = [days[i - 1] as ActivityDay, days[i] as ActivityDay];
    if (rose(before.points, after.points) || rose(before.battles, after.battles)) lastActive = after.date;
  }
  const quiet = daysBetween(lastActive ?? first.date, today);

  const base = [...days].reverse().find((d) => daysBetween(d.date, newest.date) >= WEEK) ?? first;
  const points = change(base.points, newest.points);
  const battles = change(base.battles, newest.battles);
  return {
    ...(lastActive === undefined ? { flatFor: quiet } : { lastActive, daysAgo: quiet }),
    idle: quiet >= IDLE_DAYS,
    week: {
      ...(points !== undefined && { points }),
      ...(battles !== undefined && { battles }),
      days: daysBetween(base.date, newest.date),
    },
  };
}
