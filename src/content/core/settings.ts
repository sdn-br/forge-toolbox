import type { TemplateResult } from 'lit-html';
import { clamp } from '../../shared/math';
import type { KeyValue } from './kv';
import type { TextKey } from './texts';

interface BaseSettingDef {
  key: string;
  group: TextKey;
  label: TextKey;
  /** a line below the control */
  hint?: TextKey;
  /** a part of the group with its own heading, e.g. the copy text of the own share */
  section?: TextKey;
  /** drawn by the settings box at a place of its own instead of in the list of the group */
  ownControl?: boolean;
}

export interface ToggleSettingDef extends BaseSettingDef {
  kind: 'toggle';
  default: boolean;
}

/** `V` is the union of the values, so a handle reads a literal type and no caller casts */
export interface ChoiceSettingDef<V extends string = string> extends BaseSettingDef {
  kind: 'choice';
  default: V;
  choices: { value: V; label: TextKey }[];
}

/** a number within `min` and `max`, rounded to `step` (default 1, a whole number) */
export interface NumberSettingDef extends BaseSettingDef {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  /** stored in percent, shown and typed as a factor: 90 reads 1,9 */
  asFactor?: boolean;
}

/** numbers within `min` and `max`, rounded to `step`, typed as a list like "80; 90; 95,5" */
export interface ListSettingDef extends BaseSettingDef {
  kind: 'list';
  default: number[];
  min: number;
  max: number;
  step?: number;
  /** stored in percent, shown and typed as factors: 90 reads 1,9 */
  asFactor?: boolean;
}

/** free text, such as a name */
export interface TextSettingDef extends BaseSettingDef {
  kind: 'text';
  default: string;
}

export type SettingDef = ToggleSettingDef | ChoiceSettingDef | NumberSettingDef | ListSettingDef | TextSettingDef;

/** a def is the single source of a setting: it is declared once, as a module constant, and its handle reads and writes */
export const toggleDef = (def: Omit<ToggleSettingDef, 'kind'>): ToggleSettingDef => ({ kind: 'toggle', ...def });
export const choiceDef = <const V extends string>(def: Omit<ChoiceSettingDef<V>, 'kind'>): ChoiceSettingDef<V> => ({
  kind: 'choice',
  ...def,
});
export const numberDef = (def: Omit<NumberSettingDef, 'kind'>): NumberSettingDef => ({ kind: 'number', ...def });
export const listDef = (def: Omit<ListSettingDef, 'kind'>): ListSettingDef => ({ kind: 'list', ...def });
export const textDef = (def: Omit<TextSettingDef, 'kind'>): TextSettingDef => ({ kind: 'text', ...def });

/** a registered setting of one `Settings`: reads the normalised value, writes it, hears changes of its key only */
export interface Setting<T> {
  readonly def: SettingDef;
  get(): T;
  set(value: T): Promise<void>;
  onChange(listener: () => void): () => void;
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

type Value = boolean | string | number | number[];
type Values = Record<string, Value>;

export class Settings {
  readonly defs: SettingDef[] = [];
  /** the icon of each group, as its feature shows it in the menu */
  private icons = new Map<string, TemplateResult | string>();
  private values: Values = {};
  /** whether anything was ever stored under `settings`, which `values` (empty by default) cannot tell */
  private present = false;
  private handles = new Map<SettingDef, Setting<Value>>();
  private listeners = new Set<(key: string) => void>();

  constructor(private kv: KeyValue) {}

  async load(): Promise<void> {
    const stored = await this.kv.get<Values>('settings');
    this.present = stored !== undefined;
    this.values = stored ?? {};
  }

  /** the values as stored under `settings`, undefined when nothing was ever stored; read only */
  stored(): Readonly<Values> | undefined {
    return this.present ? this.values : undefined;
  }

  /** the icon a group shows in the settings box; the feature passes the one of its menu entry */
  registerGroup(group: TextKey, icon: TemplateResult | string): void {
    this.icons.set(group, icon);
  }

  groupIcon(group: string): TemplateResult | string | undefined {
    return this.icons.get(group);
  }

  /** the handle of a setting; the owner registers it, the handle is the only way to read or write the value */
  register<D extends SettingDef>(def: D): Setting<D['default']> {
    this.defs.push(def);
    const handle: Setting<Value> = {
      def,
      get: () => this.read(def),
      set: (value) => this.write(def.key, value),
      onChange: (listener) =>
        this.onChange((key) => {
          if (key === def.key) listener();
        }),
    };
    this.handles.set(def, handle);
    return handle as Setting<D['default']>;
  }

  /** the handle of a registered setting, for readers that do not own it; an unregistered def is a programming error */
  of<D extends SettingDef>(def: D): Setting<D['default']> {
    const handle = this.handles.get(def);
    if (!handle) throw new Error(`setting ${def.key} is not registered`);
    return handle as Setting<D['default']>;
  }

  private read(def: SettingDef): Value {
    const value = this.values[def.key];
    switch (def.kind) {
      case 'toggle':
        return typeof value === 'boolean' ? value : def.default;
      case 'number':
        // a stored value of another type gives the default
        if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
        return clamp(toStep(value, def.step), def.min, def.max);
      case 'list': {
        // numbers rounded to the step, within bounds, each once, in the order given; nothing usable left gives the default
        const list = Array.isArray(value)
          ? value.filter((n) => Number.isFinite(n)).map((n) => toStep(n, def.step))
          : [];
        const kept = [...new Set(list.filter((n) => n >= def.min && n <= def.max))];
        return kept.length ? kept : def.default;
      }
      case 'text':
        return typeof value === 'string' ? value.trim() : def.default;
      case 'choice':
        // a stored value that is no longer a choice falls back to the default
        return typeof value === 'string' && def.choices.some((c) => c.value === value) ? value : def.default;
    }
  }

  private async write(key: string, value: Value): Promise<void> {
    this.values = { ...this.values, [key]: value };
    this.present = true;
    await this.kv.set('settings', this.values);
    for (const listener of this.listeners) listener(key);
  }

  /** replaces all values, as taking found data does; no listener hears it, the game reloads right after */
  async replace(values: Record<string, unknown>): Promise<void> {
    // unchecked like a load: the handles fall back to the default for a value of the wrong type
    this.values = values as Values;
    this.present = true;
    await this.kv.set('settings', values);
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
