import { de, type TextKey } from '../texts/de';

export type { TextKey };

/** Text by key, `{name}` placeholders filled from params. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return de[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

const numberFormat = new Intl.NumberFormat('de-DE');
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatNumber = (n: number) => numberFormat.format(n);
export const formatTime = (epochMs: number) => timeFormat.format(epochMs);
