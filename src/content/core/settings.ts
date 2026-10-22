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

/** a whole number within `min` and `max` */
export interface NumberSettingDef extends BaseSettingDef {
  default: number;
  min: number;
  max: number;
}

export type SettingDef = ToggleSettingDef | ChoiceSettingDef | NumberSettingDef;

export const isChoice = (def: SettingDef): def is ChoiceSettingDef => 'choices' in def;
export const isNumber = (def: SettingDef): def is NumberSettingDef => 'min' in def;

type Value = boolean | string | number;
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
    return def && !isChoice(def) && !isNumber(def) ? def.default : false;
  }

  /** value of a number setting, rounded and kept within its bounds; a stored value of another type gives the default */
  number(key: string): number {
    const def = this.def(key);
    if (!def || !isNumber(def)) return 0;
    const value = this.values[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
    return Math.min(def.max, Math.max(def.min, Math.round(value)));
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
