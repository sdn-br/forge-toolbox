import type { KeyValue } from './kv';
import type { TextKey } from './texts';

export interface SettingDef {
  key: string;
  group: TextKey;
  label: TextKey;
  default: boolean;
}

type Values = Record<string, boolean>;

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

  get(key: string): boolean {
    return this.values[key] ?? this.defs.find((d) => d.key === key)?.default ?? false;
  }

  async set(key: string, value: boolean): Promise<void> {
    this.values = { ...this.values, [key]: value };
    await this.kv.set('settings', this.values);
    for (const listener of this.listeners) listener(key);
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
