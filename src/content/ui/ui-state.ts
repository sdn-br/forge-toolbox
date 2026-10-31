import type { KeyValue } from '../core/kv';
import { logError } from '../core/log';

export interface BoxState {
  x?: number;
  y?: number;
  pinned?: boolean;
  minimized?: boolean;
  /** size set by the viewer, in pixels; without it the box has its default width and the height of its content */
  width?: number;
  height?: number;
}

/** Remembers position and flags of each box, and small view choices of features, across page loads. */
export class UiState {
  private boxes: Record<string, BoxState> = {};
  private prefs: Record<string, string> = {};

  constructor(private kv: KeyValue) {}

  async load(): Promise<void> {
    this.boxes = (await this.kv.get<Record<string, BoxState>>('ui.boxes')) ?? {};
    this.prefs = (await this.kv.get<Record<string, string>>('ui.prefs')) ?? {};
  }

  /** a view choice such as the mode of a map; not a setting, so it does not show in the settings box */
  pref(key: string): string | undefined {
    return this.prefs[key];
  }

  savePref(key: string, value: string): void {
    this.prefs = { ...this.prefs, [key]: value };
    this.persist('ui.prefs', this.prefs, 'saving a view choice failed');
  }

  removePref(key: string): void {
    if (!(key in this.prefs)) return;
    const { [key]: _, ...rest } = this.prefs;
    this.prefs = rest;
    this.persist('ui.prefs', this.prefs, 'saving a view choice failed');
  }

  box(id: string): BoxState {
    return this.boxes[id] ?? {};
  }

  saveBox(id: string, patch: BoxState): void {
    this.boxes = { ...this.boxes, [id]: { ...this.box(id), ...patch } };
    this.persist('ui.boxes', this.boxes, 'saving box state failed');
  }

  /** writes in the background; a failure is only logged, the state in memory stays */
  private persist(key: 'ui.prefs' | 'ui.boxes', value: unknown, failure: string) {
    this.kv.set(key, value).catch((error) => logError(failure, error));
  }
}

type PrefFields = Record<string, unknown>;

const isRecord = (value: unknown): value is PrefFields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** each field of `defaults` from `saved` where it has the type of its default, else the default; records within field
 * by field the same way */
const pickFields = <T extends object>(defaults: T, saved: unknown): T => {
  const found: PrefFields = isRecord(saved) ? saved : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const value = found[key];
      if (isRecord(fallback)) return [key, pickFields(fallback, value)];
      return [key, typeof value === typeof fallback ? value : fallback];
    }),
  ) as T;
};

/**
 * A view choice saved as a JSON record (`savePref(key, JSON.stringify(value))`), read back with each field that is
 * missing or of another type than its default at the default. `migrate` turns a record of an older shape into the
 * current one before the fields are checked.
 */
export function prefRecord<T extends object>(
  defaults: T,
  saved: string | undefined,
  migrate?: (saved: PrefFields) => PrefFields,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved ?? '{}');
  } catch {
    return defaults;
  }
  return pickFields(defaults, migrate && isRecord(parsed) ? migrate(parsed) : parsed);
}
