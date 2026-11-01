import { DAY_MS, sameDay } from '../../shared/time';
import { de, type TextKey } from '../texts/de';

export type { TextKey };

/** whether a text with this key exists, for keys put together at run time */
export const hasText = (key: string): key is TextKey => key in de;

/** Text by key, `{name}` placeholders filled from params. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return de[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

const numberFormat = new Intl.NumberFormat('de-DE');
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n: number) => numberFormat.format(n);

/** compares two texts in German order, as `a.localeCompare(b, 'de')` without setting up the order on each call */
export const compareText = new Intl.Collator('de').compare;

/** a text in the case that `containsText` and `sameName` compare in */
export const foldCase = (text: string) => text.toLocaleLowerCase('de');

/** a test whether a text contains `part`, any case; `part` is trimmed, an empty one matches every text. Built once per
 * filter run, so the part is not lowered again for each row */
export const textFilter = (part: string): ((text: string) => boolean) => {
  const needle = foldCase(part.trim());
  return (text) => foldCase(text).includes(needle);
};

/** part of a text, any case; an empty part matches every text */
export const containsText = (text: string, part: string) => textFilter(part)(text);

/** the same name in any case; neither side is trimmed */
export const sameName = (a: string, b: string) => foldCase(a) === foldCase(b);

/** a gain or loss with its sign, „+310“, „−40“; zero without one */
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;

/** "12,5 %" */
export const formatPercent = (n: number) => `${formatNumber(n)} %`;
const millionFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** "45 Mio.", "0,6 Mio." from 100.000 on, below that the whole number */
export const formatPrice = (n: number) =>
  n >= 100_000 ? t('number.millions', { n: millionFormat.format(n / 1_000_000) }) : formatNumber(n);
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const formatTime = (epochMs: number) => timeFormat.format(epochMs);

const fullDateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "21.10.2026, 18:00" */
export const formatFullDateTime = (epochMs: number) => fullDateTimeFormat.format(epochMs);

/** "21.10., 18:00" */
export const formatDateTime = (epochMs: number) => dateTimeFormat.format(epochMs);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const withRest = (big: string, rest: number, small: (n: number) => string) => (rest ? `${big} ${small(rest)}` : big);
const minutesText = (minutes: number) => t('duration.minutes', { minutes });
const hoursText = (hours: number) => t('duration.hours', { hours });

/** "5 Std. 3 Min.", "2 T. 3 Std.", "20 Std.": the two largest units, rounded up, so a countdown never shows 0. */
export function formatDuration(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / MINUTE);
  if (minutes < 60) return minutesText(minutes);
  if (minutes < 24 * 60) return withRest(hoursText(Math.floor(minutes / 60)), minutes % 60, minutesText);
  const hours = Math.ceil(ms / HOUR);
  return withRest(t('duration.days', { days: Math.floor(hours / 24) }), hours % 24, hoursText);
}

/** how long ago something was, `ms` back, at least "1 Min.", so what just came never reads as 0 */
export const formatAge = (ms: number) => formatDuration(Math.max(MINUTE, ms));

/** "3 Std." for three hours and forty minutes: like `formatAge`, but the largest unit only, for a narrow column */
export const formatAgeShort = (ms: number) =>
  formatAge(ms >= DAY_MS ? Math.floor(ms / DAY_MS) * DAY_MS : ms >= HOUR ? Math.floor(ms / HOUR) * HOUR : ms);

/** "heute 14:05", "morgen 04:14", otherwise date and time. */
export function formatWhen(epochMs: number, now: number): string {
  if (sameDay(epochMs, now)) return t('time.today', { time: formatTime(epochMs) });
  if (sameDay(epochMs, now + DAY_MS)) return t('time.tomorrow', { time: formatTime(epochMs) });
  return formatDateTime(epochMs);
}
