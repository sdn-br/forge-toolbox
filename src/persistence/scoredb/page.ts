// Reads the days of a player from a page of ScoreDB (foe.scoredb.io). The page is server-rendered HTML; its two charts
// carry the daily values as attributes. The service worker has no DOMParser, so the attributes are read with regexes,
// defensively: the page is not ours, attributes may come in any order, be missing or hold something else than numbers.
//
// The chart as seen on 2026-11-13:
//   <div id="playerPoints" data-startdate="2026_11_12" data-counters="300|200|100,…neighbours…" …>
//   <div id="playerBattles" data-startdate="2026_11_12" data-counters="12|11|10" …>
// Series are parted by `,`, values by `|`, newest first; `data-startdate` is the day of the newest value, each next
// value is one calendar day earlier. In `playerPoints` the first series is the player, the others are rank neighbours.
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay } from '../../shared/model';
import { DAY_MS } from '../../shared/time';

/** the attributes of the opening tag with `id="<id>"`; undefined when the page has none */
function tagAttributes(html: string, id: string): Map<string, string> | undefined {
  const at = new RegExp(`\\sid\\s*=\\s*(["'])${id}\\1`).exec(html)?.index;
  if (at === undefined) return undefined;
  const start = html.lastIndexOf('<', at);
  const end = html.indexOf('>', at);
  if (start < 0 || end < 0) return undefined;
  const attributes = new Map<string, string>();
  for (const m of html.slice(start, end).matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attributes.set((m[1] ?? '').toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attributes;
}

function num(text: string | undefined): number | undefined {
  const t = text?.trim() ?? '';
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** milliseconds of `YYYY_MM_DD` at UTC midnight; undefined for anything else or a day that does not exist */
function startDay(text: string | undefined): number | undefined {
  const m = /^\s*(\d{4})[_-](\d{2})[_-](\d{2})\s*$/.exec(text ?? '');
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? ms : undefined;
}

/** the first series of a chart by day, `YYYY-MM-DD` → value; days whose value is no number are left out */
function series(html: string, id: string): Map<string, number> {
  const values = new Map<string, number>();
  const chart = tagAttributes(html, id);
  const start = startDay(chart?.get('data-startdate'));
  const counters = chart?.get('data-counters');
  if (start === undefined || counters === undefined) return values;
  // the first series is the player's; in `playerPoints` the rank neighbours follow
  (counters.split(',')[0] ?? '').split('|').forEach((text, i) => {
    const value = num(text);
    if (value !== undefined) values.set(new Date(start - i * DAY_MS).toISOString().slice(0, 10), value);
  });
  return values;
}

/**
 * The days of a player a ScoreDB player page tells, oldest first: points and battles paired by day. A day in only one
 * chart is left out, as a day with one value would never get the other. Undefined when no day has both.
 */
export function scoredbDays(html: string, world: WorldId, player: PlayerId): FoestatsDay[] | undefined {
  const points = series(html, 'playerPoints');
  const battles = series(html, 'playerBattles');
  const days: FoestatsDay[] = [];
  for (const [date, p] of points) {
    const b = battles.get(date);
    if (b !== undefined) days.push({ world, player, date, points: p, battles: b });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days.length ? days : undefined;
}
