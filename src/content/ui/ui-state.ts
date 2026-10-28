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
