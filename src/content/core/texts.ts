import type { BuildingDefId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../shared/model';
import { de, type TextKey } from '../texts/de';

export type { TextKey };

/** Text by key, `{name}` placeholders filled from params. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return de[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

const numberFormat = new Intl.NumberFormat('de-DE');
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n: number) => numberFormat.format(n);
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

export const formatTime = (epochMs: number) => timeFormat.format(epochMs);

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

/** "heute 14:05", "morgen 04:14", otherwise date and time. */
export function formatWhen(epochMs: number, now: number): string {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(epochMs) === day(now)) return t('time.today', { time: formatTime(epochMs) });
  if (day(epochMs) === day(now + 86_400_000)) return t('time.tomorrow', { time: formatTime(epochMs) });
  return dateTimeFormat.format(epochMs);
}

/** Own name of a resource, else the game's name from the startup data, else its id. */
export function resourceLabel(id: string, catalog: { resourceName(id: string): string | undefined }): string {
  const key = `resource.${id}`;
  return key in de ? t(key as TextKey) : (catalog.resourceName(id) ?? id);
}

/** "1.220 Münzen, 5 Forge-Punkte" */
export const formatResources = (
  resources: Record<string, number>,
  catalog: { resourceName(id: string): string | undefined },
) =>
  Object.entries(resources)
    .map(([id, amount]) => `${formatNumber(amount)} ${resourceLabel(id, catalog)}`)
    .join(', ');

/** "3 Plünderungen, 2 abgewehrt, 120 FP"; the repelled part only when there are some */
export const formatPlunderTotals = ({ count, repelled, fp }: { count: number; repelled: number; fp: number }) =>
  [
    count === 1 ? t('plunder.countOne') : t('plunder.count', { count: formatNumber(count) }),
    repelled > 0 ? t('plunder.repelledCount', { count: formatNumber(repelled) }) : '',
    t('plunder.fp', { fp: formatNumber(fp) }),
  ]
    .filter(Boolean)
    .join(', ');

/** "3 Angriffe, 1 abgewehrt, 2 Plünderungen": battles with the held ones among them, then plunders */
export const formatIncomingTotals = ({ battles, held, plunders }: IncomingTotals) =>
  [
    battles === 1 ? t('incoming.countOne') : t('incoming.count', { count: formatNumber(battles) }),
    held > 0 ? t('incoming.heldCount', { count: formatNumber(held) }) : '',
    plunders === 1 ? t('plunder.countOne') : t('plunder.count', { count: formatNumber(plunders) }),
  ]
    .filter(Boolean)
    .join(', ');

/** "Kampf: durchbrochen", "Plünderung: Strohdachhaus" */
export function formatIncoming(a: IncomingAttack, building: (id: BuildingDefId) => string | undefined): string {
  if (a.kind === 'battle') return t(a.defense === 'held' ? 'incoming.held' : 'incoming.broken');
  const id = a.cityEntityId;
  return t('incoming.plunder', { building: id === undefined ? '–' : (building(id) ?? id) });
}
