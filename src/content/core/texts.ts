import { de, type TextKey } from '../texts/de';

export type { TextKey };

/** Text by key, `{name}` placeholders filled from params. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return de[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

const numberFormat = new Intl.NumberFormat('de-DE');
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n: number) => numberFormat.format(n);
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatTime = (epochMs: number) => timeFormat.format(epochMs);

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
