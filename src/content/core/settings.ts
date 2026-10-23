import type { KeyValue } from './kv';
import type { TextKey } from './texts';

interface BaseSettingDef {
  key: string;
  group: TextKey;
  label: TextKey;
  /** a line below the control */
  hint?: TextKey;
}

export interface ToggleSettingDef extends BaseSettingDef {
  default: boolean;
}

export interface ChoiceSettingDef extends BaseSettingDef {
  default: string;
  choices: { value: string; label: TextKey }[];
}

/** a number within `min` and `max`, rounded to `step` (default 1, a whole number) */
export interface NumberSettingDef extends BaseSettingDef {
  default: number;
  min: number;
  max: number;
  step?: number;
  /** stored in percent, shown and typed as a factor: 90 reads 1,9 */
  asFactor?: boolean;
}

/** numbers within `min` and `max`, rounded to `step`, typed as a list like "80; 90; 95,5" */
export interface ListSettingDef extends BaseSettingDef {
  default: number[];
  min: number;
  max: number;
  step?: number;
  /** stored in percent, shown and typed as factors: 90 reads 1,9 */
  asFactor?: boolean;
}

/** `value` rounded to a multiple of `step`, without the float tail of 955 × 0.1 */
export function toStep(value: number, step = 1): number {
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** "80; 90 95,5" → [80, 90, 95.5]: semicolons or spaces part the entries, so a comma can be the decimal mark */
export const parseNumberList = (text: string): number[] =>
  text
    .split(/[;\s]+/)
    .filter((entry) => entry !== '')
    .map((entry) => Number(entry.replace(',', '.')))
    .filter((n) => Number.isFinite(n));

/** the list as it is typed, with decimal commas */
export const formatNumberList = (list: number[]): string => list.map((n) => String(n).replace('.', ',')).join('; ');

/** free text, such as a name */
export interface TextSettingDef extends BaseSettingDef {
  default: string;
  text: true;
}

export type SettingDef = ToggleSettingDef | ChoiceSettingDef | NumberSettingDef | ListSettingDef | TextSettingDef;

export const isChoice = (def: SettingDef): def is ChoiceSettingDef => 'choices' in def;
export const isText = (def: SettingDef): def is TextSettingDef => 'text' in def;
export const isList = (def: SettingDef): def is ListSettingDef => Array.isArray(def.default);
export const isNumber = (def: SettingDef): def is NumberSettingDef => 'min' in def && !isList(def);

type Value = boolean | string | number | number[];
type Values = Record<string, Value>;

export class Settings {
  readonly defs: SettingDef[] = [];
  private values: Values = {};
  private listeners = new Set<(key: string) => void>();

  constructor(private kv: KeyValue) {}

  async load(): Promise<void> {
    this.values = (await this.kv.get<Values>('settings')) ?? {};
  }

  register(def: SettingDef): void {
    this.defs.push(def);
  }

  /** value of a toggle */
  get(key: string): boolean {
    const value = this.values[key];
    if (typeof value === 'boolean') return value;
    const def = this.def(key);
    return def && !isChoice(def) && !isNumber(def) && !isList(def) && !isText(def) ? def.default : false;
  }

  /** value of a number setting, rounded and kept within its bounds; a stored value of another type gives the default */
  number(key: string): number {
    const def = this.def(key);
    if (!def || !isNumber(def)) return 0;
    const value = this.values[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
    return Math.min(def.max, Math.max(def.min, toStep(value, def.step)));
  }

  /**
   * value of a list setting: numbers rounded to the step, within bounds, each once, in the order given; nothing usable
   * left gives the default
   */
  numbers(key: string): number[] {
    const def = this.def(key);
    if (!def || !isList(def)) return [];
    const value = this.values[key];
    const list = Array.isArray(value) ? value.filter((n) => Number.isFinite(n)).map((n) => toStep(n, def.step)) : [];
    const kept = [...new Set(list.filter((n) => n >= def.min && n <= def.max))];
    return kept.length ? kept : def.default;
  }

  /** value of a text setting, trimmed; another type stored gives the default */
  text(key: string): string {
    const def = this.def(key);
    if (!def || !isText(def)) return '';
    const value = this.values[key];
    return typeof value === 'string' ? value.trim() : def.default;
  }

  /** value of a choice; a stored value that is no longer a choice falls back to the default */
  choice(key: string): string {
    const def = this.def(key);
    if (!def || !isChoice(def)) return '';
    const value = this.values[key];
    return typeof value === 'string' && def.choices.some((c) => c.value === value) ? value : def.default;
  }

  async set(key: string, value: Value): Promise<void> {
    this.values = { ...this.values, [key]: value };
    await this.kv.set('settings', this.values);
    for (const listener of this.listeners) listener(key);
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private def(key: string): SettingDef | undefined {
    return this.defs.find((d) => d.key === key);
  }
}
